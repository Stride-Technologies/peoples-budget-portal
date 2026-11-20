"""Fine-tune LAYA for the explorer's typed decisions, then measure it (specs/020 B3.3).

    uv run --project services/inference --group research python tools/laya/finetune.py \
        --data <dir with rows.csv, annotations.csv, labels.csv> --out <dir> [--train-limit N] [--epochs 2]

Task: a budget row's main top-level label, as one LAYA `choice` over the taxonomy's top
labels plus "unclassified". Inputs are the labelling run's exports (budget text only,
public record): rows.csv (row_id, row_kind, root_id, text), annotations.csv (row_id,
label_id, confidence, decided_by, in_review), labels.csv (id, parent_id, label,
definition). The CSVs come from `\\copy` of explorer_rows / explorer_annotations /
explorer_labels (columns as above; no personal-data table is read).

Targets:
- **gold**, when `api/prisma/data/explorer-gold/*.csv` has decided rows: Stride's decision.
  This is the only evidence the swap rule accepts (decisions.md #11).
- **silver** otherwise: GPT's own highest-confidence live label. Silver agreement measures
  how well LAYA imitates GPT (distillation), never whether it is right.

Split: by root_id hash (a program and its activities never straddle train and test),
80% train / 10% calibration (LAYA's own temperature fit) / 10% test. Gold rows are
always held out of training. Writes `<out>/results.json` and the fine-tuned checkpoint
to `<out>/checkpoint`, which the sidecar serves with LAYA_MODEL=<that dir>.
"""

from __future__ import annotations

import argparse
import csv
import glob
import hashlib
import json
import os
import platform
import random
import subprocess
import sys
import time
from collections import Counter, defaultdict

csv.field_size_limit(sys.maxsize)
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GOLD_DIR = os.path.join(ROOT, "api", "prisma", "data", "explorer-gold")
UNCLASSIFIED = "unclassified"
INSTRUCTIONS = (
    "This is one line of a Philippine city's budget (Naga City): a program, project, "
    "activity, budget item or account line, with its office and the larger item it is part of. "
    "What is this row mainly FOR, from what the row itself is (not just which office runs it)? "
    "Pick the one label that fits best."
)


def bucket(root_id: str) -> int:
    return int(hashlib.sha256(f"laya-split-v1:{root_id}".encode()).hexdigest()[:8], 16) % 10


def read(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load(data: str):
    labels = read(os.path.join(data, "labels.csv"))
    top = {l["id"]: l for l in labels if not l["parent_id"] and l["id"] != UNCLASSIFIED}
    parent = {l["id"]: l["parent_id"] or l["id"] for l in labels}
    rows = {r["row_id"]: r for r in read(os.path.join(data, "rows.csv"))}
    best: dict[str, tuple[float, str]] = {}
    in_review: set[str] = set()
    for a in read(os.path.join(data, "annotations.csv")):
        if a["in_review"] in ("t", "true", "True"):
            in_review.add(a["row_id"])
            continue
        c = float(a["confidence"])
        t = parent.get(a["label_id"], a["label_id"])
        if t in top and (a["row_id"] not in best or c > best[a["row_id"]][0]):
            best[a["row_id"]] = (c, t)
    return top, parent, rows, best, in_review


def gold_targets(parent: dict, top: dict) -> dict[str, list[str]]:
    """Stride's decisions as top-level label sets (a row may rightly carry several)."""
    out: dict[str, list[str]] = {}
    for f in sorted(glob.glob(os.path.join(GOLD_DIR, "*.csv"))):
        for r in read(f):
            d = (r.get("decision") or "").strip()
            if not d:
                continue
            ids = [] if d.lower() in ("none", "-") else d.replace(",", " ").replace(";", " ").split()
            tops = sorted({parent.get(i, i) for i in ids} & set(top)) or [UNCLASSIFIED]
            out[r["row_id"]] = tops
    return out


def question(top: dict) -> dict:
    criteria = {k: f"{v['label']}: {v['definition']}" for k, v in top.items()}
    criteria[UNCLASSIFIED] = "None of these: an administrative or accounting line that says nothing about what it is for."
    return {"label": {"type": "choice", "instructions": INSTRUCTIONS, "criteria": criteria}}


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if not n:
        return (0.0, 0.0)
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * ((p * (1 - p) + z * z / (4 * n)) / n) ** 0.5
    return ((c - h) / d, (c + h) / d)


def ece(conf: list[float], ok: list[bool], bins: int = 10) -> float:
    total = 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        idx = [i for i, c in enumerate(conf) if lo <= c < hi or (b == bins - 1 and c == 1.0)]
        if idx:
            acc = sum(ok[i] for i in idx) / len(idx)
            total += len(idx) / len(conf) * abs(acc - sum(conf[i] for i in idx) / len(idx))
    return total


def macro_f1(pairs: list[tuple[str, str]]) -> float:
    classes = {g for g, _ in pairs} | {p for _, p in pairs}
    f1s = []
    for c in classes:
        tp = sum(g == c and p == c for g, p in pairs)
        fp = sum(g != c and p == c for g, p in pairs)
        fn = sum(g == c and p != c for g, p in pairs)
        f1s.append(2 * tp / (2 * tp + fp + fn) if tp else 0.0)
    return sum(f1s) / len(f1s) if f1s else 0.0


def evaluate(agent, items: list[dict], q: dict, gold_sets: dict[str, list[str]] | None = None) -> dict:
    """Accuracy (Wilson 95% CI), macro-F1 and ECE of the choice's confidence, against each item's target."""
    started = time.perf_counter()
    conf, ok, pairs = [], [], []
    for it in items:
        a = agent.predict(it["state"], q)["answers"]["label"]
        want = gold_sets[it["row_id"]] if gold_sets else [it["target"]]
        hit = a["choice"] in want
        conf.append(float(a["probabilities"][a["choice"]]))
        ok.append(hit)
        pairs.append((a["choice"] if hit else want[0], a["choice"]))
    k, n = sum(ok), len(ok)
    lo, hi = wilson(k, n)
    return {
        "n": n,
        "accuracy": k / n if n else 0.0,
        "accuracy_ci95": [lo, hi],
        "macro_f1": macro_f1(pairs),
        "ece": ece(conf, ok),
        "ms_per_row": (time.perf_counter() - started) * 1000 / max(n, 1),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--base", default="convaiinnovations/laya:multilingual")
    ap.add_argument("--train-limit", type=int, default=3000)
    ap.add_argument("--test-limit", type=int, default=500)
    ap.add_argument("--epochs", type=int, default=2)
    ap.add_argument("--device", default="auto")
    ap.add_argument("--skip-train", action="store_true")
    # 16 GB unified memory ran out at micro-batch 4 with 19 options in the prompt (2026-11-13).
    ap.add_argument("--micro-batch", type=int, default=1)
    ap.add_argument("--grad-accum", type=int, default=32)
    args = ap.parse_args()

    import laya
    import torch
    from huggingface_hub import snapshot_download
    from laya.train import TrainConfig, finetune

    os.makedirs(args.out, exist_ok=True)
    top, parent, rows, best, in_review = load(args.data)
    gold = gold_targets(parent, top)
    q = question(top)

    items = []
    for rid, r in rows.items():
        if rid in in_review or rid in gold:
            continue  # review rows are noisy; gold rows are test-only
        target = best[rid][1] if rid in best else UNCLASSIFIED
        items.append({"row_id": rid, "root": r["root_id"], "state": {"row": r["text"]}, "target": target})
    rnd = random.Random(20261113)
    rnd.shuffle(items)
    train = [i for i in items if bucket(i["root"]) < 9][: args.train_limit]
    test = [i for i in items if bucket(i["root"]) == 9][: args.test_limit]

    jsonl = os.path.join(args.out, "train.jsonl")
    with open(jsonl, "w", encoding="utf-8") as f:
        for it in train:
            f.write(json.dumps({"state": it["state"], "questions": q, "expected": {"label": it["target"]}}) + "\n")

    repo, _, sub = args.base.partition(":")
    base_dir = snapshot_download(repo, allow_patterns=[f"{sub}/*"] if sub else None)
    base_dir = os.path.join(base_dir, sub) if sub else base_dir
    device = args.device if args.device != "auto" else ("mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu"))

    results = {
        "date": time.strftime("%Y-%m-%d"),
        "commit": subprocess.run(["git", "-C", ROOT, "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip(),
        "laya": getattr(laya, "__version__", "?"),
        "torch": torch.__version__,
        "base": args.base,
        "device": device,
        "hardware": f"{platform.machine()} {platform.processor() or platform.platform()}",
        "task": "top-level label, one choice over %d labels + unclassified" % len(top),
        "data": {"rows": len(rows), "candidates": len(items), "train": len(train), "test": len(test),
                 "gold_rows": len(gold), "train_target_counts": Counter(i["target"] for i in train).most_common()},
        "train_config": {"epochs": args.epochs, "micro_batch": args.micro_batch, "grad_accum": args.grad_accum},
        "split": "root_id sha256 bucket: 9/10 train pool (LAYA takes its own calibration slice), 1/10 test",
    }
    majority = Counter(i["target"] for i in train).most_common(1)[0][0]
    results["silver_majority_baseline"] = sum(i["target"] == majority for i in test) / max(len(test), 1)

    base = laya.load(base_dir, device=device)
    results["zero_shot_silver"] = evaluate(base, test, q)
    print("zero-shot (silver):", json.dumps(results["zero_shot_silver"]), flush=True)
    if gold:
        gold_items = [{"row_id": r, "state": {"row": rows[r]["text"]}} for r in gold if r in rows]
        results["zero_shot_gold"] = evaluate(base, gold_items, q, gold)
    del base
    save = lambda: json.dump(results, open(os.path.join(args.out, "results.json"), "w"), indent=2, default=str)
    save()  # the zero-shot half survives a failed training run

    if not args.skip_train:
        ckpt = os.path.join(args.out, "checkpoint")
        t0 = time.time()
        summary = finetune(jsonl, base_dir, ckpt, TrainConfig(epochs=args.epochs, micro_batch=args.micro_batch, grad_accum=args.grad_accum), device=device)
        results["train_seconds"] = round(time.time() - t0)
        results["train_summary"] = {k: v for k, v in summary.items() if isinstance(v, (int, float, str, list, dict))}
        tuned = laya.load(ckpt, device=device)
        results["finetuned_silver"] = evaluate(tuned, test, q)
        print("fine-tuned (silver):", json.dumps(results["finetuned_silver"]))
        if gold:
            results["finetuned_gold"] = evaluate(tuned, gold_items, q, gold)

    results["swap_verdict"] = (
        "pending: no gold rows; silver agreement cannot decide a swap (decisions.md #11)"
        if not gold
        else "compare finetuned_gold with GPT on the same gold rows (db:label:calibrate) under decisions.md #11"
    )
    save()
    print(json.dumps({k: results[k] for k in results if k != "data"}, indent=2, default=str))


if __name__ == "__main__":
    main()
