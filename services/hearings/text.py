"""The stages that need no model: joining shards, glossary clean-up, flagging aired audio, finding documents named.

Standard library only. The thresholds are calibration knobs measured on real council recordings (30-second lines,
mixed English, Filipino and Bikol); change them against lines a person has checked, not by feel.
"""
import difflib, re, unicodedata

MIN_RATIO, MIN_LEN, MIN_TERM_1 = 0.86, 5, 6  # MIN_TERM_1: one-word terms shorter than this match exactly only
# Spelling drift folded before matching, tuned for Philippine languages (Spanish-derived c/k/qu, v/b, z/s, f/p, ñ,
# and o/u, e/i). Another language family needs its own pairs.
FOLD = (("-", " "), ("qu", "k"), ("c", "k"), ("v", "b"), ("z", "s"), ("f", "p"), ("ny", "n"))
VOWELS = str.maketrans("oe", "ui")
JUNK = {"noise", "unintelligible"}  # what speech models write for a stretch with no speech


def clean(t):
    """A speech model invents text on music and applause. Drop a line in another script, or one that only repeats.
    ponytail: a text heuristic; put a voice-activity detector in front of the model if it misses."""
    if re.search(r"[^\x00-ɏ -⁯]", t):
        return ""
    w = t.split()
    return "" if len(w) > 8 and len(set(w)) / len(w) < 0.3 else t.strip()


def norm(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if not unicodedata.combining(c))


def fold(s):
    s = norm(s)
    for a, b in FOLD:
        s = s.replace(a, b)
    return " ".join(s.translate(VOWELS).split())


def key(t):
    return norm(t) if t.isupper() else fold(t)  # acronyms are never folded: "edp" must not become EDF


def terms(lines):
    """Term lines -> {word count: {folded key: (canonical, was it a `heard =` line)}}. A line is a term as it should
    be written, or `heard = Canonical` for a mishearing fuzzy matching cannot reach (a different first letter, or an
    acronym spelled out). `#` starts a comment."""
    by_n = {}
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        heard, _, t = line.rpartition(" = ")
        by_n.setdefault(len(fold(heard or t).split()), {})[key(heard or t)] = (t, bool(heard))
    return by_n


def fix(text, by_n):
    """Write names, places, offices and acronyms the way the glossary does. Heuristic, no model: an acronym matches
    exactly only, a short single word matches exactly only, and a fuzzy match needs the same first letter."""
    toks = text.split()
    out, i = [], 0
    while i < len(toks):
        for n in sorted(by_n, reverse=True):
            if len(toks[i:i + n]) < n:
                continue
            said = " ".join(toks[i:i + n])
            gram = fold(said)
            exact, heard = by_n[n].get(gram) or by_n[n].get(norm(said)) or (None, False)
            # an acronym is written only where it was said letter for letter, or where a `heard =` line says so
            exact = None if exact and exact.isupper() and not heard and norm(exact) != norm(said) else exact
            if exact is None and len(gram) >= MIN_LEN and not any(
                    t.isupper() for k, (t, _) in by_n[n].items() if difflib.SequenceMatcher(None, gram, k).ratio() >= MIN_RATIO):
                m = difflib.get_close_matches(gram, [k for k in by_n[n] if k[0] == gram[0] and (n > 1 or len(k) >= MIN_TERM_1)],
                                              n=1, cutoff=MIN_RATIO)
                # several words: each end must match on its own, or "frank reyes" becomes another Reyes
                ends = lambda k: all(difflib.SequenceMatcher(None, a, b).ratio() >= 0.75
                                     for a, b in ((gram.split()[0], k.split()[0]), (gram.split()[-1], k.split()[-1])))
                exact = by_n[n][m[0]][0] if m and (n == 1 or ends(m[0])) else None
            if exact:
                out.append(exact)
                i += n
                break
        else:
            out.append(toks[i])
            i += 1
    s = " ".join(out)
    return s[:1].upper() + s[1:]


def shingles(text, n=4):
    w = re.findall(r"[a-z]+", fold(text))
    return {tuple(w[i:i + n]) for i in range(len(w) - n + 1)}


def mark_aired(segs, pool=()):
    """Flag broadcast ads, jingles and announcements by repetition: floor speech never repeats a 30-second stretch,
    aired media loops. A line is aired when at least 2 others match it (2 minutes or more away in this session,
    sharing 30% of its 4-word runs; or in `pool`, the lines of other sessions, sharing 50%) and it sits in a run of 2
    or more such lines, or fills a short gap between runs. One near-verbatim repeat (70%) also counts. Sets
    `skip: "aired"` and returns how many; never drops a line, because a line's index is its identity."""
    S = [shingles(g["text"]) for g in segs]

    def hit(i):
        a = S[i]
        if len(a) < 6:
            return False
        near = lambda b, k=0.3: len(a & b) / len(a) >= k
        # Other sessions need 50%: agenda formulas ("requesting authority to enter into a memorandum of agreement")
        # recur at 0.31 to 0.38, a rebroadcast at 0.53 and up.
        here = [b for j, b in enumerate(S) if abs(segs[i]["start"] - segs[j]["start"]) >= 120]
        return sum(map(near, here)) + sum(near(b, 0.5) for b in pool) >= 2 or any(near(b, 0.7) for b in here + list(pool))

    on, n = [hit(i) for i in range(len(segs))], len(segs)
    keep, i = [False] * n, 0
    while i < n:
        j = i
        while j < n and on[j] and (j == i or segs[j]["start"] - segs[j - 1]["start"] <= 60):
            j += 1
        if j - i >= 2:
            keep[i:j] = [True] * (j - i)
        i = max(j, i + 1)
    idx = [i for i in range(n) if keep[i]]
    for a, b in zip(idx, idx[1:]):
        if 1 < b - a <= 4 and segs[b]["start"] - segs[a]["start"] <= 240:
            keep[a:b] = [True] * (b - a)
    for g, k in zip(segs, keep):
        g.pop("skip", None)
        if k:
            g["skip"] = "aired"
    return sum(keep)


def merge(shards, by_n, pool=(), previous=()):
    """Shards (each a list of `{start, end, text}` from the speech stage) -> the session's segments, in order: lines
    with no speech dropped, the glossary applied, aired audio flagged. `previous` is the session's segments from an
    earlier run: a line whose text did not change keeps its word timings."""
    segs = sorted(({"start": s["start"], "end": s["end"], "text": fix(s["text"], by_n)}
                   for shard in shards for s in shard if s["text"].strip() and not set(s["text"].lower().split()) <= JUNK),
                  key=lambda s: s["start"])
    words = {(p["start"], p["text"]): p["words"] for p in previous if p.get("words")}
    for s in segs:
        if (s["start"], s["text"]) in words:
            s["words"] = words[(s["start"], s["text"])]
    mark_aired(segs, pool)
    for s in segs:
        if s.get("skip"):
            s.pop("words", None)
    return segs


# --- documents named in a session --------------------------------------------------------------------------------

# A speech model writes the dash of "2027-001" as a word it half heard.
DASH = r"(?:\s*[-–,.]\s*|\s+(?:thus|da|das|dah|the|does|dash|that's|thats|that)\s+|\s+)"
NUM = re.compile(r"\b(ordinances?|ordinansa|resolutions?|resolusyon)\s+(?:(?:numbers?|no\.?|num|numero)\s+)?(\d{4}|\d{2})" + DASH + r"(\d{1,3})(?!\d)")
STOP = {fold(w) for w in ("ordinance ordinances proposed proposal city municipality province with from that this other purposes "
                          "therefor therefore providing penalties amending section series known otherwise entitled further "
                          "hereof thereof under into their through establishing institutionalizing creating program").split()}
# A barangay's or another body's own numbering collides with the council's ("barangay appropriation ordinance number
# 2027-009", "resolution number 2027-09 of the ..."): skip a number with that just before it or right after it.
BEFORE, AFTER = re.compile(r"barang|kabataan|\bsk\b"), re.compile(r"barang|kabataan|\bsk\b|^\W*of\s+(?:the|sangguni)")
OTHER_BODY = re.compile(r"board|committee|council")  # boards and committees number their own resolutions the same way


def number(text):
    """"Ordinance No. 27-9" -> "2027-009", or None."""
    m = re.search(r"(?<!\d)(\d{4}|\d{2})\s*[-–]\s*(\d{1,4})(?!\d)", text or "")
    return f"{_year(m[1])}-{int(m[2]):03d}" if m else None


def _year(y):
    return y if len(y) == 4 else ("19" if int(y) >= 40 else "20") + y


def _words(text):
    return set(re.findall(r"[a-z]{4,}", fold(text)))


def _core(title):
    """The descriptive words of a title: no "PROPOSED ORDINANCE:", no number, no boilerplate."""
    t = re.sub(r"(?i)^\s*proposed\s+ordinance\s*:?\s*|ordinance\s+no\.?\s*[\d\s–-]+|^\s*[\d\s–-]+$", " ", title)
    return _words(t) - STOP


def links(segs, docs):
    """Where a session names a known document -> `[{seg, kind, no, title, url}]` (the contract's links file).
    `docs` is the LGU's own list, `[{kind, no?, title, url}]`. Two ways to match:
    - by number: "ordinance number 2027 dash 001". A number links only if it is in the list, so a misheard number
      links nothing rather than the wrong law.
    - by title: 5 or more descriptive words, 85% of them in the line and the next one (a title is read across a line
      break); 3 or 4 words, all of them in the line itself."""
    by_no = {}
    for d in docs:
        if number(d.get("no")):
            by_no.setdefault((d["kind"], number(d["no"])), d)
    titled = [(d, c) for d in docs for c in [_core(d["title"])] if len(c) >= 3]
    out, seen = [], {}
    for i, g in enumerate(segs):
        if g.get("skip"):
            continue
        found = []
        low, prev = g["text"].lower(), (segs[i - 1]["text"].lower()[-60:] + " ") if i else ""
        for m in NUM.finditer(low):
            kind = "resolution" if m[1].startswith("resol") else "ordinance"
            if BEFORE.search((prev + low[:m.start()])[-60:]) or AFTER.search(low[m.end():m.end() + 25]) \
                    or kind == "resolution" and OTHER_BODY.search((prev + low[:m.start()])[-30:]):
                continue
            no = f"{_year(m[2])}-{int(m[3]):03d}"
            d = by_no.get((kind, no)) or (kind == "ordinance" and by_no.get(("proposed", no)))
            if d:
                found.append(d)
        mine = _words(g["text"])
        here = mine | _words(segs[i + 1]["text"] if i + 1 < len(segs) else "")
        found += [d for d, c in titled if (c <= mine if len(c) < 5 else len(c & here) >= 0.85 * len(c) and len(c & mine) >= 2)]
        for d in found:
            if seen.get(d["url"], -1e9) >= g["start"] - 60:  # the same document again within a minute: one link
                continue
            seen[d["url"]] = g["start"]
            out.append({"seg": i, "kind": d["kind"], "no": d.get("no"), "title": d["title"], "url": d["url"]})
    return out
