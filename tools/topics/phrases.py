"""Compound phrases for the topic proposer (specs/020, decision #16).

A port of `api/src/explorer/phrases.ts` (`learnPhrases`, `termsOf`): adjacent
words that occur together far more than chance, by normalised PMI over rows
(Bouma 2009), in at least 3 rows, merged in two passes (Mikolov et al. 2013),
never across punctuation or a stop word, at most three words. The stop words
are read from the TypeScript file, so the two cannot drift.

    python3 -I tools/topics/phrases.py --self-test
"""

from __future__ import annotations

import math
import os
import re
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
NPMI_MIN = 0.5
MIN_PHRASE_ROWS = 3
PHRASE_PASSES = 2


def _stop() -> set[str]:
    src = open(os.path.join(ROOT, "api", "src", "explorer", "phrases.ts"), encoding="utf-8").read()
    m = re.search(r"export const STOP = new Set\(\s*`([^`]*)`", src)
    if not m:
        raise SystemExit("STOP list not found in api/src/explorer/phrases.ts")
    return set(m.group(1).split())


STOP = _stop()


def norm(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c)).lower()


def tokens(name: str) -> list[str | None]:
    """Words of a name; stop words and punctuation are gaps a phrase never spans."""
    t = re.sub(r"[,;:()/&|.]+", " | ", norm(name))
    out: list[str | None] = []
    for w in re.split(r"[^a-z|]+", t):
        if not w:
            continue
        out.append(None if w == "|" or len(w) < 3 or w in STOP else w)
    return out


def _merge(seq: list[str | None], phrases: set[str]) -> list[str | None]:
    out: list[str | None] = []
    i = 0
    while i < len(seq):
        a = seq[i]
        b = seq[i + 1] if i + 1 < len(seq) else None
        if a and b and f"{a} {b}" in phrases:
            out.append(f"{a} {b}")
            i += 2
        else:
            out.append(a)
            i += 1
    return out


def learn_phrases(names: list[str]) -> set[str]:
    phrases: set[str] = set()
    seqs = [tokens(n) for n in names]
    n_rows = max(1, len(seqs))
    for _ in range(PHRASE_PASSES):
        words: dict[str, int] = {}
        pairs: dict[str, tuple[str, str, int]] = {}
        for s in seqs:
            for w in {w for w in s if w}:
                words[w] = words.get(w, 0) + 1
            seen: set[str] = set()
            for a, b in zip(s, s[1:]):
                if a and b and f"{a} {b}" not in seen:
                    seen.add(f"{a} {b}")
                    k = f"{a} {b}"
                    pa, pb, n = pairs.get(k, (a, b, 0))
                    pairs[k] = (pa, pb, n + 1)
        for k, (a, b, n) in pairs.items():
            if n < MIN_PHRASE_ROWS or (" " in a and " " in b):
                continue
            pab = n / n_rows
            npmi = 1.0 if pab >= 1 else math.log(pab / ((words[a] / n_rows) * (words[b] / n_rows))) / -math.log(pab)
            if npmi >= NPMI_MIN:
                phrases.add(k)
        seqs = [_merge(s, phrases) for s in seqs]
    return phrases


def terms_of(name: str, phrases: set[str]) -> list[str]:
    seq = tokens(name)
    for _ in range(PHRASE_PASSES):
        seq = _merge(seq, phrases)
    return list(dict.fromkeys(w for w in seq if w))


def merged_text(name: str, phrases: set[str]) -> str:
    """A name with each phrase joined by `_`, for a bag-of-words vectoriser."""
    return " ".join(t.replace(" ", "_") for t in terms_of(name, phrases))


def _self_test() -> None:
    names = [
        "Human Resource and Administrative Support Services",
        "Human Resource Development Program",
        "Human Resource Information System",
        "Human Rights Desk",
        "Resource Mobilization",
        "Senior Citizens Assistance",
        "Senior Citizens Pension",
        "Senior Citizens Day",
        "Along Soriano Ave",
        "Drainage, Soriano Ave",
        "Budget Planning, Investment Programming",
        "Budget Planning, Investment Programming and Review",
        "Budget Planning, Investment Programming Support",
    ]
    ph = learn_phrases(names)
    assert "human resource" in ph and "senior citizens" in ph, ph
    assert terms_of("Human Resource Development", ph) == ["human resource", "development"]
    assert terms_of("Human Rights Desk", ph) == ["human", "rights", "desk"]
    assert "soriano ave" not in ph and "planning investment" not in ph, ph
    assert "budget planning" in ph
    assert merged_text("Human Resource Development", ph) == "human_resource development"
    assert all(len(p.split()) <= 3 for p in learn_phrases(names + names))
    assert terms_of("Peñafrancia", set()) == terms_of("Penafrancia", set())
    print(f"phrases.py self-test ok ({len(STOP)} stop words read from phrases.ts)")


if __name__ == "__main__" and "--self-test" in sys.argv:
    _self_test()
