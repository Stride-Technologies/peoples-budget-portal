"""Propose draft labels for rows the taxonomy misses (specs/020 B5.1).

    uv run --project services/inference --group research python tools/topics/propose.py \
        --data <dir with rows.csv, annotations.csv, labels.csv> [--out docs/design/explorer-topic-proposals.md]

BERTopic (Grootendorst 2022): multilingual-e5 embeddings → UMAP (McInnes et al. 2018) →
HDBSCAN (Campello et al. 2013) → class-based TF-IDF keywords per cluster, over the rows
the labelling run left **Not classified** (no live label) or **in review**. Each cluster is
written to a report with its size, keywords, example rows, and the existing label its
centroid sits nearest, as a *proposal* for Stride. It never writes to the taxonomy or the
database: a label is added only by editing `api/prisma/data/explorer-labels.json` after
review. Inputs are the labelling exports (budget text only, public record).

Seeded (UMAP random_state, a fixed row order), so a rerun on the same exports gives the
same clusters on the same machine; UMAP is not bit-identical across BLAS builds.
"""

from __future__ import annotations

import argparse
import csv
import os
import platform
import subprocess
import sys
import time
from collections import Counter

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from phrases import learn_phrases, merged_text  # noqa: E402  (decision #16: compounds are terms)

csv.field_size_limit(sys.maxsize)
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Words that say nothing about what a budget row is for (en + fil + book boilerplate).
STOP = """
the of and for to in a an on at by with from or as is are be this that these those its it
program programs project projects activity activities office city naga budget fund funds
general services service expenses expense other others various implementation maintenance
operating operation operations support provision conduct conducting part money ppa ppas item
items sub account line class personnel capital outlay mooe ps co fe fy year annual
ng sa ang mga na at para kay ni si mga kan an sa
""".split()


def read(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def name_of(text: str) -> str:
    """The row's own first line, without its kind prefix ("Activity: …")."""
    first = text.split("\n", 1)[0]
    return first.split(": ", 1)[1] if ": " in first else first


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", default=os.path.join(ROOT, "docs", "design", "explorer-topic-proposals.md"))
    ap.add_argument("--model", default="intfloat/multilingual-e5-base")
    ap.add_argument("--min-cluster", type=int, default=8)
    ap.add_argument("--kinds", default="aip-program,aip-pa,budget-item,project",
                    help="Row kinds to cluster; account lines are boilerplate and left out by default.")
    args = ap.parse_args()

    from bertopic import BERTopic
    from hdbscan import HDBSCAN
    from sentence_transformers import SentenceTransformer
    from sklearn.feature_extraction.text import CountVectorizer
    from umap import UMAP

    labels = read(os.path.join(args.data, "labels.csv"))
    tops = {l["id"]: l for l in labels if not l["parent_id"] and l["id"] != "unclassified"}
    live: dict[str, set[str]] = {}
    review: set[str] = set()
    for a in read(os.path.join(args.data, "annotations.csv")):
        if a["in_review"] in ("t", "true", "True"):
            review.add(a["row_id"])
        else:
            live.setdefault(a["row_id"], set()).add(a["label_id"])
    kinds = set(args.kinds.split(","))
    rows = sorted(
        (r for r in read(os.path.join(args.data, "rows.csv"))
         if r["row_kind"] in kinds and r["labelled_at"]
         and (r["row_id"] in review or not live.get(r["row_id"]))),
        key=lambda r: r["row_id"],
    )
    why = Counter("in review" if r["row_id"] in review else "not classified" for r in rows)
    docs = [name_of(r["text"]) for r in rows]
    # Keywords count learned phrases as one term ("human_resource"), so a cluster's top
    # words never list "human", "resource" and "human resource" side by side. The
    # embeddings still read the names as written.
    phrases = learn_phrases(docs)
    bag = [merged_text(d, phrases) for d in docs]
    print(f"{len(rows)} rows ({dict(why)}), {len(phrases)} phrases", flush=True)

    t0 = time.time()
    st = SentenceTransformer(args.model, device="cpu")
    emb = st.encode([f"passage: {d}" for d in docs], normalize_embeddings=True, batch_size=64)
    label_texts = [f"passage: {l['label']}: {l['definition']}" for l in tops.values()]
    label_vecs = st.encode(label_texts, normalize_embeddings=True)

    topic_model = BERTopic(
        umap_model=UMAP(n_neighbors=15, n_components=5, min_dist=0.0, metric="cosine", random_state=42),
        hdbscan_model=HDBSCAN(min_cluster_size=args.min_cluster, metric="euclidean",
                              cluster_selection_method="leaf", prediction_data=True),
        vectorizer_model=CountVectorizer(stop_words=STOP, ngram_range=(1, 1), min_df=1,
                                         token_pattern=r"(?u)\b[a-zA-ZñÑ][a-zA-ZñÑ_-]+\b"),
        calculate_probabilities=False,
        # "english" strips every character but A-Z and 0-9 before counting: the phrase
        # joiner "_" and Filipino "ñ" with it. Embeddings are passed in, so this is the
        # only thing the setting changes.
        language="multilingual",
    )
    topics, _ = topic_model.fit_transform(bag, emb)
    seconds = round(time.time() - t0)

    clusters = []
    for t in sorted(set(topics) - {-1}):
        idx = [i for i, x in enumerate(topics) if x == t]
        centroid = emb[idx].mean(axis=0)
        centroid /= np.linalg.norm(centroid) or 1
        sims = label_vecs @ centroid
        best = int(np.argmax(sims))
        words = [w.replace("_", " ") for w, _ in topic_model.get_topic(t)[:8] if w] or ["(no distinctive words)"]
        # Examples nearest the centroid: the most typical rows, not random ones.
        near = sorted(idx, key=lambda i: -float(emb[i] @ centroid))[:6]
        clusters.append({
            "size": len(idx),
            "words": words,
            "examples": [docs[i] for i in near],
            "nearest": list(tops)[best],
            "nearest_sim": float(sims[best]),
            "kinds": Counter(rows[i]["row_kind"] for i in idx).most_common(),
            "in_review": sum(rows[i]["row_id"] in review for i in idx),
        })
    clusters.sort(key=lambda c: -c["size"])
    noise = sum(1 for x in topics if x == -1)

    commit = subprocess.run(["git", "-C", ROOT, "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    import bertopic as bt
    lines = [
        "# Data Explorer — draft label proposals (specs/020 B5.1)",
        "",
        f"Generated {time.strftime('%Y-%m-%d')} by `tools/topics/propose.py` at `{commit}`: BERTopic {bt.__version__} over "
        f"**{len(rows)}** rows the labelling run left not classified or in review ({', '.join(f'{k} {v}' for k, v in why.items())}; "
        f"kinds {', '.join(sorted(kinds))}). Embeddings `{args.model}` (CPU), UMAP(15 neighbours, 5 dims, cosine, seed 42), "
        f"HDBSCAN(min cluster {args.min_cluster}, leaf selection), c-TF-IDF over learned phrases (NPMI ≥ 0.5, decision #16) with an en/fil stop-list. {len(clusters)} clusters, "
        f"{noise} rows unclustered ({noise / max(len(rows), 1):.0%}). {platform.machine()}, {seconds} s.",
        "",
        "**These are proposals, not labels.** Nothing here changes the taxonomy or any row. A cluster worth a",
        "label is added by editing `api/prisma/data/explorer-labels.json` after Stride's review, then",
        "`db:seed:labels` and `db:label -- --all`. *Nearest label* is the existing top-level label whose",
        "definition sits closest to the cluster's centre (cosine): high means the rows probably belong",
        "there and the gate was too strict; low means the taxonomy may be missing something.",
        "",
        "| # | Rows | In review | Keywords | Nearest label (cosine) | Kinds |",
        "|--:|--:|--:|---|---|---|",
    ]
    for i, c in enumerate(clusters, 1):
        lines.append(f"| {i} | {c['size']} | {c['in_review']} | {', '.join(c['words'])} | "
                     f"{c['nearest']} ({c['nearest_sim']:.2f}) | {', '.join(f'{k} {n}' for k, n in c['kinds'])} |")
    lines += ["", "## Examples (the rows nearest each cluster's centre)", ""]
    for i, c in enumerate(clusters, 1):
        lines.append(f"**{i}. {', '.join(c['words'][:4])}** — {c['size']} rows")
        lines += [f"- {e}" for e in c["examples"]]
        lines.append("")
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"{len(clusters)} clusters, {noise} unclustered, {seconds}s → {args.out}")


if __name__ == "__main__":
    main()
