#!/usr/bin/env python3
"""From a recording of a council session to the files the portal's hearings pages read (docs/hearings-api.md).

  python3 hearings.py [--config hearings.toml] run <recording> [--id ID] [--title T] [--date YYYY-MM-DD] [--body ID]
  python3 hearings.py run <id> --redo summary        again, for a session already processed
  python3 hearings.py remove <id>                    take a session off the site
  python3 hearings.py site                           only rewrite the goals, members, glossary and bodies files

<recording> is a YouTube link, another link yt-dlp can read, or a local audio or video file. One machine, one
command; every stage keeps its result, so a run that stops is continued by running it again. README.md has the rest.
"""
import argparse, json, pathlib, re, shutil, subprocess, sys, tomllib

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import speech, summary, text  # noqa: E402

ID = re.compile(r"[\w-]{1,64}")  # the contract's ids: safe inside a path
REDO = ("transcribe", "summary", "translate")  # each one also redoes the ones after it


def sh(*a):
    return subprocess.run([str(x) for x in a], check=True, capture_output=True, text=True).stdout.strip()


def write_json(path, data, indent=1):
    """Whole or not at all: a web server is reading this folder while we write."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".part")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=indent, separators=(",", ": ") if indent else (",", ":")))
    tmp.replace(path)


def read_json(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def load_config(path):
    """The settings file, with its paths made absolute (they are written relative to the file) and its data read."""
    path = pathlib.Path(path).resolve()
    if not path.exists():
        sys.exit(f"No settings file at {path}. Copy example/hearings.toml and edit it, or pass --config.")
    cfg = tomllib.loads(path.read_text())
    at = lambda p: (path.parent / p).resolve()
    data = cfg.get("data", {})
    cfg["out"], cfg["work"] = at(cfg.get("output", "out")), at(cfg.get("work", "work"))
    if cfg["work"] == cfg["out"] or cfg["out"] in cfg["work"].parents:
        sys.exit("`work` must not be inside `output`: the output folder is public, recordings and drafts are not.")
    cfg["bodies"] = cfg.get("bodies") or [{"id": "council", "name": ""}]
    cfg["roster"] = read_json(at(data["roster"]), []) if data.get("roster") else []
    cfg["goals"] = read_json(at(data["goals"]), {}) if data.get("goals") else {}
    cfg["documents"] = read_json(at(data["documents"]), []) if data.get("documents") else []
    cfg["reader_glossary"] = read_json(at(data["reader_glossary"]), []) if data.get("reader_glossary") else []
    for what, rows, field in (("bodies", cfg["bodies"], "id"), ("roster", cfg["roster"], "slug")):
        for r in rows:
            if not ID.fullmatch(str(r.get(field, ""))):
                sys.exit(f"{what}: `{field}` must be 1 to 64 letters, digits, _ or -; got {r.get(field)!r}")
    if cfg.get("speech", {}).get("engine") not in speech.ENGINES:
        sys.exit(f"[speech] engine must be one of: {', '.join(speech.ENGINES)}")
    for lang in cfg.get("translate", {}):
        if lang not in ("tl", "bcl"):
            sys.exit(f"[translate.{lang}]: contract v1 names two summary languages, tl (Filipino) and bcl (Bikol)")
    lines = [line for f in data.get("glossary", []) for line in at(f).read_text().splitlines()]
    # the roster's names are terms too: the full name, and a surname long enough to be safe on its own
    names = [re.sub(r"\s*\(.*?\)", "", m["name"]).strip() for m in cfg["roster"]]
    cfg["terms"] = text.terms(lines + names + [n.split()[-1] for n in names if len(n.split()) > 1 and len(n.split()[-1]) >= 5])
    return cfg


# --- the recording -----------------------------------------------------------------------------------------------

def ytdlp(*a):
    """yt-dlp if it is installed, else the newest one through uv: an old yt-dlp stops working when a site changes."""
    cmd = ["yt-dlp"] if shutil.which("yt-dlp") else ["uvx", "yt-dlp@latest"]
    return sh(*cmd, *(["--js-runtimes", "node"] if shutil.which("node") else []), "--no-playlist", *a)


def duration(media):
    return int(float(sh("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", media)))


def fetch(recording, cfg, args):
    """A link or a file -> the session's facts (`meta.json` in its work folder), downloading what is needed."""
    is_link = re.match(r"https?://", recording)
    if not is_link and not pathlib.Path(recording).is_file() and (cfg["work"] / recording / "meta.json").exists():
        meta = read_json(cfg["work"] / recording / "meta.json")  # a session already processed, named by its id
    elif is_link:
        info = json.loads(ytdlp("-J", recording))
        youtube = info.get("extractor_key") == "Youtube"
        sid = args.id or (info["id"] if youtube else re.sub(r"[^\w-]", "-", f"{info.get('extractor_key', 'video')}-{info['id']}".lower())[:64])
        if youtube and sid != info["id"]:
            sys.exit("A YouTube session's id is the video's own id: the pages build the player from it. Drop --id.")
        d = info.get("upload_date") or ""
        meta = {"id": sid, "title": info.get("title") or sid, "date": f"{d[:4]}-{d[4:6]}-{d[6:]}" if d else "",
                "durationSec": int(info.get("duration") or 0), "source": "youtube" if youtube else "file", "link": recording}
    else:
        f = pathlib.Path(recording).resolve()
        if not f.is_file():
            sys.exit(f"{recording} is not a link, a file, or the id of a session already processed.")
        sid = args.id or re.sub(r"[^\w-]+", "-", f.stem).strip("-")[:64]
        meta = {"id": sid, "title": f.stem, "date": "", "durationSec": 0, "source": "file", "media": str(f)}
    if not ID.fullmatch(meta["id"]):
        sys.exit(f"Session id {meta['id']!r} must be 1 to 64 letters, digits, _ or -. Pass --id.")
    work = cfg["work"] / meta["id"]
    work.mkdir(parents=True, exist_ok=True)
    meta = {**meta, **{k: v for k, v in (("title", args.title), ("date", args.date)) if v},
            "body": args.body or meta.get("body") or cfg["bodies"][0]["id"]}
    if meta["body"] not in [b["id"] for b in cfg["bodies"]]:
        sys.exit(f"--body {meta['body']} is not one of the bodies in the settings file.")
    if meta["date"] and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", meta["date"]):
        sys.exit("--date is YYYY-MM-DD.")
    had = next((f for f in work.glob("audio.*") if f.suffix != ".part"), None)  # downloaded by an earlier run
    if had and "media" not in meta:
        meta["media"] = str(had)
    if "media" not in meta or not pathlib.Path(meta["media"]).exists():
        if "link" not in meta:
            sys.exit(f"The recording {meta.get('media')} is gone; pass the file again.")
        print("downloading")
        if meta["source"] == "youtube":  # the page plays YouTube's own copy: only the sound is needed here
            ytdlp("-f", "bestaudio[ext=m4a]/bestaudio", "-o", work / "audio.%(ext)s", meta["link"])
        else:
            ytdlp("-f", "bv*[height<=720]+ba/b[height<=720]/b", "--merge-output-format", "mp4", "-o", work / "audio.%(ext)s", meta["link"])
        meta["media"] = str(next(f for f in work.glob("audio.*") if f.suffix != ".part"))
    meta["durationSec"] = meta["durationSec"] or duration(meta["media"])
    write_json(work / "meta.json", meta)
    return meta


def video(meta, cfg):
    """A `file` session: the API holds the video and its poster (`video/<id>.mp4`, `video/<id>.jpg`)."""
    mp4, jpg = cfg["out"] / "video" / f"{meta['id']}.mp4", cfg["out"] / "video" / f"{meta['id']}.jpg"
    mp4.parent.mkdir(parents=True, exist_ok=True)
    has_picture = bool(sh("ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_type", "-of", "csv=p=0", meta["media"]))
    if not mp4.exists():
        print("writing the video for the page")
        tmp = mp4.with_suffix(".part.mp4")
        # H.264 and AAC play in every browser; faststart puts the index first, so the page can seek before the file
        # has loaded; 720p keeps slides readable at about 500 MB an hour.
        # ponytail: always re-encoded, which takes a while for a long video; copy the streams when they already fit.
        picture = ["-vf", "scale=-2:min(720\\,ih)", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p"] if has_picture else ["-vn"]
        sh("ffmpeg", "-loglevel", "error", "-y", "-i", meta["media"], *picture, "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", tmp)
        tmp.replace(mp4)
    if not jpg.exists():
        # the middle of the recording: the first minutes are often a title card or an empty hall
        frame = ["-ss", meta["durationSec"] / 2, "-i", mp4] if has_picture else ["-f", "lavfi", "-i", "color=c=0x1f2937:s=640x360"]
        sh("ffmpeg", "-loglevel", "error", "-y", *frame, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", jpg)


# --- the site's files ----------------------------------------------------------------------------------------------

def site(cfg):
    """The files that describe the LGU rather than one session. Each is written only when there is something to say."""
    out = cfg["out"]
    if any(b.get("name") for b in cfg["bodies"]):
        write_json(out / "hearings.json", {"bodies": [{k: b[k] for k in ("id", "name", "about") if b.get(k)} for b in cfg["bodies"]]})
    for name, data in (("portal.json", cfg["goals"]), ("councilors.json", cfg["roster"]), ("glossary.json", cfg["reader_glossary"])):
        if data:
            write_json(out / name, data)


def index(cfg, meta=None, remove=None):
    """`sessions/index.json`, newest first; the order the pages show."""
    f = cfg["out"] / "sessions" / "index.json"
    rows = [r for r in read_json(f, []) if r["id"] not in (remove, meta and meta["id"])]
    if meta:
        rows.append({k: meta[k] for k in ("id", "title", "date", "durationSec", "body", "source") if meta.get(k)})
    rows.sort(key=lambda r: r.get("date", ""), reverse=True)  # stable: same-day sessions keep their order
    write_json(f, rows)


# --- the commands ------------------------------------------------------------------------------------------------

def run(cfg, args):
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            sys.exit(f"{tool} is not installed.")
    meta = fetch(args.recording, cfg, args)
    sid, work, sessions = meta["id"], cfg["work"] / meta["id"], cfg["out"] / "sessions"
    session, en = sessions / f"{sid}.json", sessions / f"{sid}.summary.json"
    redo = REDO[REDO.index(args.redo):] if args.redo else ()
    if "transcribe" in redo:
        shutil.rmtree(work / "shards", ignore_errors=True)
    if "summary" in redo:
        en.unlink(missing_ok=True)
    if "translate" in redo:
        for f in sessions.glob(f"{sid}.summary.*.json"):
            f.unlink()
    print(f"{sid}: {meta['title']} ({meta['durationSec']} s, {meta['source']})")

    print("transcribing")
    shards = speech.transcribe(meta["media"], meta["durationSec"], work / "shards", cfg["speech"])
    others = [text.shingles(g["text"]) for f in sessions.glob("*.json") if "." not in f.stem and f.stem not in ("index", sid)
              for g in read_json(f)["segments"]]  # an ad aired in another session is still an ad
    segs = text.merge(shards, cfg["terms"], others, (read_json(session) or {}).get("segments", ()))
    if not segs:
        sys.exit("The speech model heard nothing in this recording.")
    print(f"  {len(segs)} lines, {sum(bool(g.get('skip')) for g in segs)} flagged as aired audio")
    if cfg.get("align", {}).get("enabled") and any(not g.get("skip") and not g.get("words") for g in segs):
        print("aligning words to the audio")  # only the lines that have no timings yet
        print("  %d lines aligned, %d left to the page's own spread" % speech.align(segs, meta["media"]))
    write_json(session, {"segments": segs}, indent=None)  # compact: word timings triple an indented file

    found = text.links(segs, cfg["documents"])
    write_json(sessions / f"{sid}.links.json", found)
    print(f"{len(found)} documents named")
    if meta["source"] == "file":
        video(meta, cfg)
    site(cfg)
    index(cfg, meta)  # listed now: the transcript does not wait for the summary model

    llm = cfg.get("summary", {})
    ask = summary.chat(llm, work / "model-replies.txt") if llm.get("base_url") and llm.get("model") else None
    if en.exists():
        print("summary: kept the one already there (--redo summary writes a new one)")
    elif ask:
        print(f"writing the summary ({llm['model']})")
        body = next(b for b in cfg["bodies"] if b["id"] == meta["body"])
        try:
            write_json(en, summary.write(ask, segs, body, cfg["goals"], llm))
        except Exception as e:  # the endpoint is down, or the model's answer cites nothing
            sys.exit(f"No summary: {e}\nThe transcript is on the site without one; what the model answered is in "
                     f"{work / 'model-replies.txt'}. Run `hearings.py run {sid}` to try again.")
    else:
        print("summary: skipped, no [summary] base_url and model in the settings")
    for lang, t in cfg.get("translate", {}).items():
        f = sessions / f"{sid}.summary.{lang}.json"
        if en.exists() and not f.exists() and ask:
            print(f"translating the summary ({lang})")
            try:
                write_json(f, summary.translate(ask, read_json(en), lang, t.get("name", lang), t.get("register", "")))
            except Exception as e:  # the English summary stands on its own
                print(f"  no {lang} summary: {e}")
    print(f"done: {session}\nServe {cfg['out']} with any web server and point NEXT_PUBLIC_HEARINGS_API_URL at it.")


def remove(cfg, args):
    if not ID.fullmatch(args.id):
        sys.exit("Not a session id.")
    index(cfg, remove=args.id)  # off the list first, then the files
    gone = [f for d, pat in (("sessions", f"{args.id}.json"), ("sessions", f"{args.id}.*.json"), ("video", f"{args.id}.*"))
            for f in (cfg["out"] / d).glob(pat)]
    for f in gone:
        f.unlink()
    print(f"{args.id}: removed from the list, {len(gone)} files deleted from {cfg['out']}.")
    if (cfg["work"] / args.id).exists():
        print(f"The recording and its shards are still in {cfg['work'] / args.id}; delete that folder to forget them.")


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--config", default="hearings.toml", help="the settings file (default: ./hearings.toml)")
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="process a recording")
    r.add_argument("recording", help="a YouTube link, another link, a local file, or the id of a session already processed")
    r.add_argument("--id", help="the session's id (a file: default its name; a YouTube link: always the video's id)")
    r.add_argument("--title")
    r.add_argument("--date", help="YYYY-MM-DD")
    r.add_argument("--body", help="which body met, an id from the settings (default: the first)")
    r.add_argument("--redo", choices=REDO, help="do this stage again, and the ones after it")
    sub.add_parser("remove", help="take a session off the site").add_argument("id")
    sub.add_parser("site", help="rewrite the goals, members, glossary and bodies files")
    args = p.parse_args(argv)
    cfg = load_config(args.config)
    {"run": run, "remove": remove, "site": lambda c, a: site(c)}[args.cmd](cfg, args)


if __name__ == "__main__":
    main()
