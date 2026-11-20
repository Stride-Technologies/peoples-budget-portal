#!/usr/bin/env python3
"""The reviewer's sheet for one language, and back (specs/014 T017, T018).

    python3 tools/translate/review_sheet.py export --lang bcl            # -> review-bcl.csv
    python3 tools/translate/review_sheet.py export --lang bcl --prefix explore.   # one page's strings only
    python3 tools/translate/review_sheet.py apply --lang bcl review-bcl.csv --by "Name, Office"

`export` writes one row per string: where it shows, the English, the draft, and an
empty "Correction" column. UTF-8 with a BOM, so Excel and Google Sheets keep the
accents. `apply` takes every non-empty Correction into the catalogue (its `src`
stays the English it was reviewed against, so it is never redrafted while that
English stands) and records the reviewer in review.json, which is what makes the
language live in production. Run the catalogue test after: a correction that drops
a budget term, number or {slot} fails it like a draft would.
"""

import argparse
import csv
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from translate import MESSAGES, english  # noqa: E402

REVIEW = MESSAGES.parent / "review.json"
NAMES = {"fil": "Filipino", "bcl": "Bikol"}

# Key prefix -> where a reviewer sees the string.
PAGES = [
    (("nav.", "footer.", "lang."), "Every page (menu and footer)"),
    (("home.",), "/ (home)"),
    (("cycle.", "learn."), "/learn"),
    (("aipvs.",), "/learn/aip-vs-annual-budget"),
    (("entry.", "code.", "money.", "ppa."), "/learn/reading-an-entry"),
    (("glossary.",), "/learn/glossary"),
    (("aipov.", "guide."), "/aip/2027/overview (and its welcome guide)"),
    (("annov.",), "/annual/2026/overview"),
    (("ppmpov.",), "/ppmp/2027/overview"),
    (("explore.explain.", "explore.feedback."), "/explore, under \"Explain this chart\""),
    (("explore.",), "/explore"),
]


def page(key):
    return next((where for prefixes, where in PAGES if key.startswith(prefixes)), "Every Overview page")


def export(lang, out, prefix=""):
    source = english()
    current = json.loads((MESSAGES / f"{lang}.json").read_text())
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["Key", "Where it shows", "English", f"{NAMES[lang]} draft", "Correction", "Note"])
        rows = [(k, en) for k, en in source.items() if k.startswith(tuple(prefix.split(",")))]
        for key, en in rows:
            w.writerow([key, page(key), en, current.get(key, {}).get("text", ""), "", ""])
    print(f"{out}: {len(rows)} rows")


def apply(lang, sheet, by):
    source = english()
    path = MESSAGES / f"{lang}.json"
    current = json.loads(path.read_text())
    applied = skipped = 0
    seen = set()
    with open(sheet, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            seen.add(row["Key"])
            fix = (row.get("Correction") or "").strip()
            if not fix:
                continue
            key = row["Key"]
            # A row whose English changed since export is stale: drop it, re-export.
            if source.get(key) != row["English"]:
                skipped += 1
                print(f"  skipped {key}: its English changed since the sheet was made", file=sys.stderr)
                continue
            current[key] = {"text": fix, "src": source[key]}
            applied += 1
    path.write_text(json.dumps({k: current[k] for k in source if k in current}, ensure_ascii=False, indent=2) + "\n")
    if skipped:
        # Signing off makes the language live; a sheet reviewed against old English is not a sign-off.
        print(f"{lang}: {applied} corrections applied; {skipped} rows were stale, so review.json is unchanged. "
              "Re-export, have those rows reviewed, and apply again.")
        return
    if not set(source) <= seen:
        # A one-page sheet (--prefix) reviews that page, not the language: no sign-off.
        print(f"{lang}: {applied} corrections applied from a partial sheet ({len(seen)} of {len(source)} strings); "
              "review.json is unchanged, so the language does not go live.")
        return
    review = json.loads(REVIEW.read_text())
    review[lang] = {"by": by, "at": date.today().isoformat()}
    REVIEW.write_text(json.dumps(review, ensure_ascii=False, indent=2) + "\n")
    print(f"{lang}: {applied} corrections applied, {skipped} skipped; review.json records {by}")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("export")
    e.add_argument("--lang", choices=NAMES, required=True)
    e.add_argument("--out")
    e.add_argument("--prefix", default="", help="only keys starting with these (comma-separated), e.g. explore.,nav.explore")
    a = sub.add_parser("apply")
    a.add_argument("--lang", choices=NAMES, required=True)
    a.add_argument("sheet")
    a.add_argument("--by", required=True, help="the reviewer, as review.json should record them")
    args = ap.parse_args()
    if args.cmd == "export":
        export(args.lang, args.out or f"review-{args.lang}.csv", args.prefix)
    else:
        apply(args.lang, args.sheet, args.by)


if __name__ == "__main__":
    main()
