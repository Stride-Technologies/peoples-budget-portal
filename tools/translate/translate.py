#!/usr/bin/env python3
"""Draft Filipino and Bikol for the public site's catalogues (specs/014).

    pnpm translate                      # both languages, only new or changed English
    pnpm translate -- --lang bcl --dry-run

Reads the English from client/src/i18n/messages/en.json plus the copy kept in code
(the budget cycle, glossary and reading guide, via client/src/i18n/code-copy.ts), and writes
client/src/i18n/messages/{fil,bcl}.json as key -> {"text", "src"}, where `src` is
the English the draft was made from. Only keys whose English is new or changed are
sent; a reviewed string is never redone while its English stands (FR-008).

Prompts, the wrong-language word lists and the model chain come from
a sister project, which translates council sessions into the
same two registers. On top of that, every protected budget term
(protected-terms.txt), number, peso amount and {slot} is masked as ⟦n⟧ before
the text leaves this machine and must come back exactly once, or the string is
rejected and stays English. The model is never trusted to "keep" a term.

Standard library only. Models: `claude` (needs ANTHROPIC_API_KEY), then Stride's
Azure AI Foundry (`FOUNDRY_KEY`, or fetched with `az` when logged in). The text
sent is public site copy; no data, names or personal information.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MESSAGES = ROOT / "client/src/i18n/messages"
TERMS = Path(__file__).with_name("protected-terms.txt")

CLAUDE = "claude-sonnet-5-5"
FOUNDRY = os.environ.get("FOUNDRY_ENDPOINT", "")  # an OpenAI-compatible endpoint, for the foundry:<model> entries
MODELS = os.environ.get("TRANSLATE_MODELS", "claude,foundry:DeepSeek-V4-Pro,foundry:DeepSeek-V3.2").split(",")
BATCH = 30

# The register, and the function words that prove which
# language came back (an early prompt asked for "Filipino as spoken in Naga" and
# got Bikol).
LANGS = {
    "fil": ("Filipino", "conversational Filipino (Tagalog-based, as in national news and social media posts), not formal "
            "textbook Tagalog. This is NOT Bikol: use ang/ng/sa/ay/at/hindi/ito/mga/para; never kan/nin/asin/dai/iyo/sarong"),
    "bcl": ("Central Bikol", "conversational Central Bikol as spoken in Naga City (Bikol Naga), the way councilors and local "
            "radio talk. Use Bikol words, never Tagalog ones: an/kan/nin/sa/si/ni, asin, dai, iyo, mga, ini/kaini, idto, "
            "pig-/nag-/mag- verbs; not ang/ng/hindi/ito/ay/at"),
}
LEAK = {"fil": ["kan", "nin", "asin", "dai", "iyo", "sarong", "giraray", "tanganing", "hale"],
        "bcl": ["ang", "ng", "hindi", "ito", "ay", "at", "yung", "naman"]}

PROMPT = """You translate the public website of a Philippine local government's budget portal, where residents read the LGU's
budget plans and send feedback. Translate each string in this JSON array into {lang}: {register}.
Write plainly, the way the city would explain something to a resident; nothing intimidating.
Mixing in English is natural and expected. Keep in English the words people there already say in English or that
read stiff or unclear when translated; when unsure, keep the English word.
Every ⟦n⟧ marker stands for a budget term, a name, a number or an amount: copy each marker exactly once, unchanged,
into the translation where it belongs. Never translate, drop or repeat a marker.
Keep the meaning exact. Do not add, drop or soften any fact. Keep sentence-final punctuation.
Return ONLY a JSON array with the same number of strings, in the same order.

{strings}"""


def code_copy(expr):
    return json.loads(subprocess.run(
        ["node", "--experimental-strip-types", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--input-type=module", "-e",
         f"const m = await import('./src/i18n/code-copy.ts'); process.stdout.write(JSON.stringify(m.{expr}))"],
        cwd=ROOT / "client", capture_output=True, text=True, check=True).stdout)


def english():
    en = json.loads((MESSAGES / "en.json").read_text())
    return {**en, **code_copy("codeSource()")}


def protected_terms():
    """The hand list plus the glossary's terms, longest first so a phrase wins over a word inside it."""
    lines = [l.strip() for l in TERMS.read_text().splitlines()]
    terms = {l for l in lines if l and not l.startswith("#")} | set(code_copy("glossaryTerms()"))
    return sorted(terms, key=len, reverse=True)


def term_pattern(t):
    # An acronym matches as written (CO, not "co"); a phrase in any case and its
    # plural, keeping the original text. Mirrored in client/src/i18n/catalogue.test.ts.
    return (r"(?<![\w])" + re.escape(t) + r"(?![\w])") if t.isupper() else (r"(?i:(?<![\w])" + re.escape(t) + r"s?(?![\w]))")


def mask(text, terms):
    """Protected terms, {slots}, ₱ amounts and numbers -> ⟦n⟧; returns (masked, originals)."""
    kept = []
    pattern = "|".join([r"\{\w+\}", r"₱\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:billion|million|thousand|[BMK]))?",
                        r"\d[\d,.]*"] + [term_pattern(t) for t in terms])

    def keep(m):
        kept.append(m.group(0))
        return f"⟦{len(kept) - 1}⟧"
    return re.sub(pattern, keep, text), kept


def unmask(text, kept):
    """Back to real text, or None when a marker was dropped, repeated or invented."""
    found = re.findall(r"⟦(\d+)⟧", text)
    if sorted(int(n) for n in found) != list(range(len(kept))):
        return None
    return re.sub(r"⟦(\d+)⟧", lambda m: kept[int(m.group(1))], text)


def post(url, body, headers):
    req = urllib.request.Request(url, json.dumps(body).encode(), {"content-type": "application/json", **headers})
    return json.load(urllib.request.urlopen(req, timeout=900))


def foundry_key():
    # FOUNDRY_KEY, or an Azure AI resource named by FOUNDRY_RESOURCE_GROUP and FOUNDRY_ACCOUNT (needs `az login`).
    return os.environ.get("FOUNDRY_KEY") or subprocess.run(
        ["az", "cognitiveservices", "account", "keys", "list", "-g", os.environ["FOUNDRY_RESOURCE_GROUP"],
         "-n", os.environ["FOUNDRY_ACCOUNT"], "--query", "key1", "-o", "tsv"],
        capture_output=True, text=True, check=True).stdout.strip()


def call(model, prompt):
    if model == "claude":
        r = post("https://api.anthropic.com/v1/messages",
                 {"model": CLAUDE, "max_tokens": 8000, "messages": [{"role": "user", "content": prompt}]},
                 {"x-api-key": os.environ["ANTHROPIC_API_KEY"], "anthropic-version": "2023-06-01"})
        return r["content"][0]["text"]
    dep = model.removeprefix("foundry:")
    limit = "max_completion_tokens" if dep.startswith("gpt") else "max_tokens"
    r = post(f"{FOUNDRY}/chat/completions",
             {"model": dep, limit: 16000, "messages": [{"role": "user", "content": prompt}]},
             {"api-key": foundry_key()})
    return r["choices"][0]["message"].get("content") or ""


def translate_batch(lang, masked):
    name, register = LANGS[lang]
    prompt = PROMPT.format(lang=name, register=register, strings=json.dumps(masked, ensure_ascii=False, indent=1))
    for model in MODELS:
        if model == "claude" and not os.environ.get("ANTHROPIC_API_KEY"):
            continue
        try:
            raw = re.sub(r"(?s)<think>.*?</think>", "", call(model, prompt))
            out = json.loads(raw[raw.index("["):raw.rindex("]") + 1])
            if len(out) == len(masked) and all(isinstance(s, str) and s.strip() for s in out):
                return model, out
            print(f"    {model}: returned {len(out)} strings for {len(masked)}; trying the next model", file=sys.stderr)
        except Exception as e:  # noqa: BLE001 — any failure moves to the next model
            print(f"    {model}: {e}; trying the next model", file=sys.stderr)
    raise SystemExit("every model failed for this batch")


def leaks(lang, text):
    return sum(len(re.findall(rf"\b{w}\b", text, re.I)) for w in LEAK[lang])


def save(path, current, source):
    ordered = {k: current[k] for k in source if k in current}
    path.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", choices=["fil", "bcl", "all"], default="all")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="translate at most N strings (a trial run)")
    args = ap.parse_args()

    source, terms = english(), protected_terms()
    for lang in (["fil", "bcl"] if args.lang == "all" else [args.lang]):
        path = MESSAGES / f"{lang}.json"
        current = json.loads(path.read_text())
        todo = [k for k, en in source.items() if current.get(k, {}).get("src") != en]
        stale = [k for k in current if k not in source]
        if args.limit:
            todo = todo[:args.limit]
        print(f"{lang}: {len(source)} strings, {len(todo)} new or changed, {len(stale)} no longer used")
        if args.dry_run:
            continue
        if not todo:
            for k in stale:
                del current[k]
            save(path, current, source)
            continue

        written = rejected = leaked = 0
        for i in range(0, len(todo), BATCH):
            keys = todo[i:i + BATCH]
            pairs = [mask(source[k], terms) for k in keys]
            model, out = translate_batch(lang, [m for m, _ in pairs])
            for key, (masked, kept), draft in zip(keys, pairs, out):
                text = unmask(draft, kept)
                if text is None:
                    rejected += 1
                    print(f"    rejected {key}: markers did not round-trip", file=sys.stderr)
                    continue
                current[key] = {"text": text, "src": source[key]}
                written += 1
                leaked += leaks(lang, text)
            # Saved after every batch, so a run that dies keeps what it finished.
            save(path, current, source)
            print(f"  {min(i + BATCH, len(todo))}/{len(todo)} via {model}")
        for k in stale:
            del current[k]
        save(path, current, source)
        print(f"{lang}: wrote {written}, rejected {rejected} (left in English), wrong-language words {leaked}")


if __name__ == "__main__":
    main()
