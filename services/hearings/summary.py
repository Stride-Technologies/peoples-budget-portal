"""The summary of a session: what was taken up, the issues, the goals they serve, a headline, translations.

Written by a language model through any OpenAI-compatible endpoint, and held to rules the code checks:
- every claim cites lines of the transcript (`refs`); a ref to a line that does not exist or to aired audio is
  dropped, and a claim left with no ref is dropped with it;
- goals and clusters come from the LGU's own lists; anything else the model answers is dropped;
- a translation changes strings only: the shape and the refs are copied from the English, never regenerated.
The model is told never to invent a name, a vote or an amount. No code can check that: the refs are how a reader does.
"""
import datetime as dt, json, os, re, urllib.request

from text import fold

PROMPT = """You are summarising an automatic transcript of {what}. The transcript is in {languages} and has
recognition errors; names may be misspelled. Each line is `[index] hh:mm:ss text`.
The recording is a broadcast: an advertisement, a jingle or a public announcement may be mixed in. Those are not part
of the session; leave them out.
Write the summary in English. Only state what the transcript supports; if unsure, say it is unclear.
Never invent names, amounts or votes.
Return ONLY JSON:
{{"glance":[{{"lead":"short label","text":"1-2 sentences","refs":[idx]}}],
 "sections":[{{"title":"theme","items":[{{"lead":"bold lead-in","text":"2-3 sentences","refs":[idx]}}]}}],
 "issues":[{{"topic":"issue discussed","summary":"what was raised, by whom if clear","offices":["office"],"refs":[idx]}}]}}
3-5 glance bullets; 4-8 themes in the order they came up (fewer for a short recording). Every item needs 1-6 refs:
the indexes of the lines that support it."""

TAG = """These issues were discussed in {what}. For each, choose the goals it serves: 1 or 2 goals (most relevant
first) by number, and exactly 1 cluster by name, from these lists only. Use [] and null when an issue fits none
(a purely procedural one). Return ONLY a JSON array, one object per issue, in the same order:
[{{"finishLines":[n],"cluster":"name"}}]

GOALS:
{goals}

CLUSTERS:
{clusters}

ISSUES:
{issues}"""

HEADLINE = """Write the one-sentence summary for a news-site card about {what}, from the summary below.
Say concretely what was done, most newsworthy first{form}. Name the measures, places, offices and amounts; avoid
vague words like "discussed several matters". 25-45 words, plain English, no member's name, nothing that is not in
the summary. Return ONLY the sentence.

SUMMARY:
{summary}"""

TRANSLATE = """Translate each value of this JSON object into {lang}{register}.
Keep in English the words people already say in English or that read stiff or unclear when translated: budget and
legal terms (budget, ordinance, resolution, second reading, committee, quorum, appropriation), office and program
names, titles of measures, acronyms. When unsure, keep the English word.
Keep every name, number, date and amount exactly as written. Do not add, drop or soften any fact.
Return ONLY a JSON object with the same keys, each with its translation.

{strings}"""

TEXT_KEYS = ("headline", "lead", "text", "title", "topic", "summary")


def chat(cfg, replies=None):
    """-> ask(prompt) -> reply text, on the endpoint the settings name: POST <base_url>/chat/completions.
    The key is read from the environment variable `api_key_env` names; a local server needs none. `replies` is a
    file every answer is appended to, for reading what a model said when its answer was refused."""
    key = os.environ.get(cfg.get("api_key_env") or "HEARINGS_LLM_KEY", "")

    def ask(prompt):
        body = {"model": cfg["model"], "messages": [{"role": "user", "content": prompt}],
                # OpenAI's reasoning models call this max_completion_tokens; everything else says max_tokens
                cfg.get("token_limit_field", "max_tokens"): int(cfg.get("max_tokens", 16000)),
                **({"temperature": cfg["temperature"]} if "temperature" in cfg else {})}
        req = urllib.request.Request(cfg["base_url"].rstrip("/") + "/chat/completions", json.dumps(body).encode(),
                                     {"content-type": "application/json", **({"authorization": f"Bearer {key}"} if key else {})})
        with urllib.request.urlopen(req, timeout=int(cfg.get("timeout_seconds", 900))) as r:
            reply = json.load(r)["choices"][0]["message"].get("content") or ""
        if replies:
            with open(replies, "a") as f:
                f.write(f"=== asked: {prompt[:200]!r}\n{reply}\n\n")
        return reply
    return ask


def _json(raw, open_, close):
    raw = re.sub(r"(?s)<think>.*?</think>", "", raw)  # some open models think out loud first
    return json.loads(raw[raw.index(open_):raw.rindex(close) + 1])


def _item(node, keys, segs):
    """A claim with its strings and at most 6 refs that point at real, unaired lines; None when it has no such ref."""
    if not isinstance(node, dict) or not all(isinstance(node.get(k), str) and node[k].strip() for k in keys):
        return None
    refs = [r for r in node.get("refs") or [] if type(r) is int and 0 <= r < len(segs) and not segs[r].get("skip")]
    return {**{k: node[k].strip() for k in keys}, "refs": refs[:6]} if refs else None


def parse(raw, segs):
    """The model's reply -> (summary in the contract's shape, how many claims were dropped for having no valid ref)."""
    got = _json(raw, "{", "}")
    dropped = 0

    def items(nodes, keys):
        nonlocal dropped
        nodes = nodes if isinstance(nodes, list) else []
        kept = [i for i in (_item(n, keys, segs) for n in nodes) if i]
        dropped += len(nodes) - len(kept)
        return kept

    issues = []
    for node, issue in ((n, _item(n, ("topic", "summary"), segs)) for n in (got.get("issues") if isinstance(got.get("issues"), list) else [])):
        if issue:
            offices = [o for o in node.get("offices") or [] if isinstance(o, str) and o.strip()]
            issues.append({**issue, **({"offices": offices} if offices else {}),
                           "at": int(segs[issue["refs"][0]]["start"])})  # where to start watching
        else:
            dropped += 1
    sections = [{"title": s["title"].strip(), "items": kept} for s in (got.get("sections") if isinstance(got.get("sections"), list) else [])
                if isinstance(s, dict) and isinstance(s.get("title"), str) for kept in [items(s.get("items"), ("lead", "text"))] if kept]
    out = {"glance": items(got.get("glance"), ("lead", "text")), "sections": sections, "issues": issues}
    if not (out["glance"] or out["sections"] or out["issues"]):
        raise ValueError("the model's summary has no claim that cites a line of the transcript")
    return out, dropped


def grounded(summary, segs):
    """A cheap check to print, not a guarantee: how many claims share 2 or more longer words with the lines they cite."""
    claims = summary["glance"] + [i for s in summary["sections"] for i in s["items"]] + summary["issues"]
    words = lambda t: set(re.findall(r"[a-z]{5,}", fold(t)))
    ok = sum(len(words(" ".join(str(c.get(k, "")) for k in TEXT_KEYS)) & words(" ".join(segs[r]["text"] for r in c["refs"]))) >= 2
             for c in claims)
    return f"{ok}/{len(claims)}"


def summarize(ask, segs, what, languages):
    clock = lambda s: "%02d:%02d:%02d" % (s // 3600, s % 3600 // 60, s % 60)
    # ponytail: the whole session in one call, about 10,000 tokens per hour of recording. A model with a small
    # context window needs the transcript summarised in parts and the parts joined.
    transcript = "\n".join(f"[{i}] {clock(int(g['start']))} {g['text']}" for i, g in enumerate(segs) if not g.get("skip"))
    return parse(ask(PROMPT.format(what=what, languages=languages) + "\n\nTRANSCRIPT:\n" + transcript), segs)


def tag(ask, summary, goals, what):
    """Give each issue 1 or 2 goals and 1 cluster, and each theme its goals, from the LGU's lists only."""
    names, clusters = goals.get("finishLines") or {}, goals.get("clusters") or []
    rows = [{k: i.get(k) for k in ("topic", "summary", "offices")} for i in summary["issues"]] + \
           [{"topic": s["title"], "summary": " ".join(f"{i['lead']} {i['text']}" for i in s["items"])} for s in summary["sections"]]
    if not rows or not (names or clusters):
        return
    got = _json(ask(TAG.format(what=what, goals="\n".join(f"{n}. {v}" for n, v in names.items()), clusters="\n".join(clusters),
                               issues=json.dumps(rows, ensure_ascii=False, indent=0))), "[", "]")
    if len(got) != len(rows):
        raise ValueError(f"the model tagged {len(got)} of {len(rows)} issues and themes")
    for row, g in zip(summary["issues"] + summary["sections"], (g if isinstance(g, dict) else {} for g in got)):
        row["finishLines"] = [n for n in g.get("finishLines") or [] if type(n) is int and str(n) in names][:2]
        if "topic" in row and g.get("cluster") in clusters:
            row["cluster"] = g["cluster"]


def headline(ask, summary, what, form=""):
    line = re.sub(r"(?s)<think>.*?</think>", "", ask(HEADLINE.format(
        what=what, form=f', in the form "{form}"' if form else "", summary="\n".join(strings(summary))))).strip().strip('"')
    if not 40 <= len(line) <= 500 or "\n" in line:
        raise ValueError(f"the model's headline is not one sentence ({len(line)} characters)")
    return line


def strings(node, put=None):
    """Every string a reader sees in a summary, in document order; with `put`, replace them in that order."""
    found = []

    def walk(n):
        if isinstance(n, dict):
            for k, v in n.items():
                if k in TEXT_KEYS and isinstance(v, str):
                    found.append(v)
                    if put is not None:
                        n[k] = put[len(found) - 1]
                elif k != "meta":
                    walk(v)
        elif isinstance(n, list):
            for v in n:
                walk(v)
    walk(node)
    return found


def twice(step, log=print):
    """Models now and then answer with something that is not JSON, or cites nothing, or miscounts: ask once more."""
    try:
        return step()
    except ValueError as e:
        log(f"  the model's answer was refused ({e}); asking once more")
        return step()


def translate(ask, en, lang, name, register="", log=print):
    """The English summary -> a copy in another language. Only the strings change."""
    src = strings(en)

    def step():  # numbered, so a string the model adds, drops or merges is seen and refused
        got = _json(ask(TRANSLATE.format(lang=name, register=f": {register}" if register else "",
                                         strings=json.dumps({str(i): s for i, s in enumerate(src, 1)}, ensure_ascii=False, indent=0))), "{", "}")
        if set(got) != {str(i) for i in range(1, len(src) + 1)} or not all(isinstance(x, str) and x.strip() for x in got.values()):
            raise ValueError(f"the model returned {len(got)} strings for {len(src)}, or not the ones it was sent")
        return [got[str(i)] for i in range(1, len(src) + 1)]
    got = twice(step, log)
    out = json.loads(json.dumps(en))
    strings(out, got)
    out["meta"] = {**en.get("meta", {}), "lang": lang}
    return out


def write(ask, segs, body, goals, cfg, log=print):
    """Summary, then goals, then a headline. The last two are extras: if the model fails at one, the summary stands."""
    what = body.get("describe") or f"a session of {body.get('name') or 'a local council'}"
    out, dropped = twice(lambda: summarize(ask, segs, what, cfg.get("transcript_languages", "English")), log)
    log(f"  {len(out['glance'])} at a glance, {len(out['sections'])} themes, {len(out['issues'])} issues; "
        f"{dropped} claims dropped for citing no line; grounded {grounded(out, segs)}")
    for name, step in (("goals", lambda: tag(ask, out, goals, what)),
                       ("headline", lambda: out.update(headline=headline(ask, out, what, body.get("headline_form", ""))))):
        try:
            step()
        except Exception as e:
            log(f"  no {name}: {e}")
    out["meta"] = {"model": cfg["model"], "generated": dt.date.today().isoformat()}
    return out
