"""Every stage that needs no model, and the model stages against a stand-in. Standard library only:

    python3 -m unittest discover -s services/hearings        (pytest runs it too)

No speech model and no language model runs here. The speech engine is a function that returns hand-written lines,
and the summary model is a function that returns hand-written replies; what is checked is everything around them.
All names are made up.
"""
import contextlib, io, json, pathlib, random, sys, tempfile, threading, unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest import mock

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
import hearings, speech, summary, text  # noqa: E402

TERMS = text.terms("""
# made-up names
Barangay San Roque
Maria Dimaculangan
Dimaculangan
Mercado-Ramos
Peñaranda
Reyes
CHO
EDF
haime = Jaime
""".splitlines())


def segs(*texts, step=30):
    return [{"start": i * step, "end": (i + 1) * step, "text": t} for i, t in enumerate(texts)]


class Glossary(unittest.TestCase):
    def test_names_get_their_spelling_and_capitals(self):
        self.assertEqual(text.fix("si councilor dimakulangan sa barangay san roke", TERMS),
                         "Si councilor Dimaculangan sa Barangay San Roque")
        self.assertEqual(text.fix("the road in penaranda", TERMS), "The road in Peñaranda")

    def test_an_acronym_matches_exactly_only(self):
        self.assertEqual(text.fix("ask the cho about the edp", TERMS), "Ask the CHO about the edp")  # edp is not EDF

    def test_a_short_word_is_never_a_fuzzy_target(self):
        self.assertEqual(text.fix("councilor reyess spoke", TERMS), "Councilor reyess spoke")  # Reyes: 5 letters, exact only
        self.assertEqual(text.fix("councilor reyez spoke", TERMS), "Councilor Reyes spoke")    # z and s are one letter here

    def test_each_end_of_a_long_name_must_match(self):
        self.assertEqual(text.fix("frank dimaculangan and mercado ramos", TERMS), "Frank Dimaculangan and Mercado-Ramos")
        self.assertEqual(text.fix("councilor maria dimakulangan", TERMS), "Councilor Maria Dimaculangan")

    def test_heard_as_fixes_what_fuzzy_cannot(self):
        self.assertEqual(text.fix("secretary haime said", TERMS), "Secretary Jaime said")
        spelled = text.terms(["MOOE", "em o o e = MOOE"])
        self.assertEqual(text.fix("the em o o e and the mooe but not the mooi", spelled), "The MOOE and the MOOE but not the mooi")


class Clean(unittest.TestCase):
    def test_invented_text_is_dropped(self):
        self.assertEqual(text.clean("谢谢观看"), "")                                   # another script, on music
        self.assertEqual(text.clean("thank you " * 12), "")                             # a loop, on applause
        self.assertEqual(text.clean(" The session is called to order. "), "The session is called to order.")


class Aired(unittest.TestCase):
    def setUp(self):
        rnd = random.Random(1)
        self.floor = lambda: " ".join("".join(rnd.choice("adghlmnrstwy") for _ in range(5)) for _ in range(14))  # never repeats
        self.ad = "buy one take one at the public market this weekend only bring the whole family and save more"

    def test_a_looping_ad_is_flagged_and_floor_speech_is_not(self):
        s = [{"start": t, "end": t + 30, "text": self.ad if t in (0, 30, 300, 330, 600, 630) else self.floor()} for t in range(0, 660, 30)]
        self.assertEqual(text.mark_aired(s), 6)
        self.assertTrue(all(("skip" in g) == (g["text"] == self.ad) for g in s))

    def test_a_formula_read_in_other_sessions_is_not_an_ad(self):
        formula = "requesting for an authority to enter into a memorandum of agreement with the department"
        s = [{"start": t, "end": t + 30, "text": f"{formula} {self.floor()}"} for t in (0, 30)]
        pool = [text.shingles(f"{formula} {self.floor()}") for _ in range(8)]
        self.assertEqual(text.mark_aired(s, pool), 0)

    def test_flagging_again_clears_old_flags(self):
        s = segs(self.floor(), self.floor())
        s[0]["skip"] = "aired"
        text.mark_aired(s)
        self.assertNotIn("skip", s[0])


class Merge(unittest.TestCase):
    def test_shards_join_in_order_without_noise(self):
        late = [{"start": 1200, "end": 1230, "text": "councilor dimakulangan moved to adjourn"}]
        early = [{"start": 0, "end": 30, "text": "the session is called to order"},
                 {"start": 30, "end": 60, "text": "noise"}, {"start": 60, "end": 90, "text": "  "},
                 {"start": 90, "end": 120, "text": "the cho report is next"}]
        out = text.merge([late, early], TERMS)
        self.assertEqual([g["start"] for g in out], [0, 90, 1200])
        self.assertEqual(out[1]["text"], "The CHO report is next")
        self.assertEqual(out[2]["text"], "Councilor Dimaculangan moved to adjourn")
        self.assertEqual(set(out[0]), {"start", "end", "text"})

    def test_word_timings_survive_only_where_the_text_did(self):
        shard = [{"start": 0, "end": 30, "text": "called to order"}, {"start": 30, "end": 60, "text": "ask the cho"}]
        before = [{"start": 0, "end": 30, "text": "Called to order", "words": [[0, 1], [1, 2], [2, 3]]},
                  {"start": 30, "end": 60, "text": "Ask the cho", "words": [[30, 31], [31, 32], [32, 33]]}]  # before CHO was a term
        out = text.merge([shard], TERMS, previous=before)
        self.assertEqual(out[0]["words"], [[0, 1], [1, 2], [2, 3]])
        self.assertNotIn("words", out[1])


class Links(unittest.TestCase):
    DOCS = [{"kind": "ordinance", "no": "2026-014", "title": "An ordinance establishing the barangay health station improvement program", "url": "https://example.gov.ph/o/14"},
            {"kind": "proposed", "no": "2027-001", "title": "Supplemental Annual Investment Program for the health office", "url": "https://example.gov.ph/o/p1"},
            {"kind": "resolution", "no": "2027-003", "title": "Senior Citizens Center", "url": "https://example.gov.ph/r/3"}]

    def link(self, *texts):
        return [(x["seg"], x["url"].rsplit("/", 1)[1]) for x in text.links(segs(*texts), self.DOCS)]

    def test_a_number_links_however_the_dash_was_heard(self):
        self.assertEqual(self.link("we take up ordinance number 2026 dash 014 today"), [(0, "14")])
        self.assertEqual(self.link("under ordinance no. 2026-14"), [(0, "14")])
        self.assertEqual(self.link("proposed ordinance 2027 thus 001 is on first reading"), [(0, "p1")])

    def test_an_unknown_number_links_nothing(self):
        self.assertEqual(self.link("ordinance number 2026 dash 015 was cited"), [])

    def test_another_bodys_number_is_not_the_councils(self):
        self.assertEqual(self.link("barangay appropriation ordinance number 2026 dash 014"), [])
        self.assertEqual(self.link("the health board resolution number 2027 dash 003"), [])
        self.assertEqual(self.link("resolution number 2027 dash 003 of the sangguniang kabataan"), [])

    def test_a_title_links_across_a_line_break_and_once_a_minute(self):
        self.assertEqual(self.link("next the supplemental annual investment", "program for the health office is read",
                                   "the supplemental annual investment program for the health office again"), [(0, "p1")])

    def test_a_short_title_must_sit_whole_in_one_line(self):
        self.assertEqual(self.link("the senior citizens", "center is open"), [])
        self.assertEqual(self.link("the senior citizens center is open"), [(0, "3")])

    def test_aired_lines_link_nothing(self):
        s = segs("ordinance number 2026 dash 014")
        s[0]["skip"] = "aired"
        self.assertEqual(text.links(s, self.DOCS), [])


SESSION = segs("The session is called to order.",
               "The health office asks for two more barangay health stations and medicine for six months.",
               "Buy one take one at the public market.",
               "The committee recommends approval of the supplemental investment program for health stations.",
               "The resolution on the drainage project report is approved without objection.")
SESSION[2]["skip"] = "aired"
GOALS = {"finishLines": {"2": "A Cleaner, Greener City", "4": "Healthy Residents"}, "clusters": ["Health", "Infrastructure"]}
REPLY = {
    "glance": [{"lead": "Health stations", "text": "The health office asked for two more health stations.", "refs": [1, 3]},
               {"lead": "An ad", "text": "A sale at the market.", "refs": [2]},                 # cites aired audio only
               {"lead": "A vote", "text": "The measure passed 7 to 3.", "refs": []},            # cites nothing
               {"lead": "Far away", "text": "Something else.", "refs": [99, "1", -1, True]}],   # cites no real line
    "sections": [{"title": "Health", "items": [{"lead": "Stations.", "text": "The committee recommended approval.", "refs": [3, 3, 3, 3, 3, 3, 3, 1]}]},
                 {"title": "Empty", "items": [{"lead": "Nothing.", "text": "No refs.", "refs": []}]}],
    "issues": [{"topic": "More barangay health stations", "summary": "Two stations and medicine.", "offices": ["City Health Office", 7], "refs": [1]},
               {"topic": "Drainage report", "summary": "A report was asked for.", "refs": [4]},
               {"topic": "Uncited", "summary": "Nobody said this.", "refs": [2]}],
}


def model(replies):
    """A stand-in for the language model: answers by which prompt it was sent."""
    def ask(prompt):
        for marker, reply in replies.items():
            if marker in prompt:
                return reply if isinstance(reply, str) else json.dumps(reply)
        raise AssertionError("unexpected prompt: " + prompt[:80])
    return ask


TAGS = [{"finishLines": [4, 9, "2"], "cluster": "Health"}, {"finishLines": [2, 4, 4], "cluster": "Roads"}, {"finishLines": [4]}]
LINE = "The council took up two more barangay health stations and asked for a report on the drainage project."
ASK = model({"TRANSCRIPT:": "<think>let me see</think>Here it is:\n```json\n" + json.dumps(REPLY) + "\n```",
             "GOALS:": TAGS, "news-site card": f'"{LINE}"'})


class Summary(unittest.TestCase):
    def test_a_claim_without_a_real_unaired_line_is_dropped(self):
        out, dropped = summary.parse(json.dumps(REPLY), SESSION)
        self.assertEqual([i["lead"] for i in out["glance"]], ["Health stations"])
        self.assertEqual([s["title"] for s in out["sections"]], ["Health"])
        self.assertEqual(out["sections"][0]["items"][0]["refs"], [3, 3, 3, 3, 3, 3])  # at most six
        self.assertEqual([i["topic"] for i in out["issues"]], ["More barangay health stations", "Drainage report"])
        self.assertEqual(out["issues"][0]["offices"], ["City Health Office"])
        self.assertEqual([i["at"] for i in out["issues"]], [30, 120])
        self.assertEqual(dropped, 5)

    def test_a_summary_with_no_cited_claim_is_refused(self):
        with self.assertRaises(ValueError):
            summary.parse('{"glance":[{"lead":"x","text":"y","refs":[42]}]}', SESSION)
        with self.assertRaises(ValueError):
            summary.parse("I cannot help with that.", SESSION)

    def test_the_transcript_sent_to_the_model_has_no_aired_line(self):
        sent = []
        summary.summarize(lambda p: sent.append(p) or json.dumps(REPLY), SESSION, "a session", "English")
        self.assertIn("[1] 00:00:30 The health office", sent[0])
        self.assertNotIn("Buy one take one", sent[0])

    def test_goals_come_from_the_lgus_lists_only(self):
        out, _ = summary.parse(json.dumps(REPLY), SESSION)
        summary.tag(ASK, out, GOALS, "a session")
        self.assertEqual(out["issues"][0]["finishLines"], [4])            # 9 and "2" are not goals
        self.assertEqual(out["issues"][0]["cluster"], "Health")
        self.assertEqual(out["issues"][1]["finishLines"], [2, 4])         # at most two
        self.assertNotIn("cluster", out["issues"][1])                     # "Roads" is not a cluster
        self.assertEqual(out["sections"][0]["finishLines"], [4])
        self.assertNotIn("cluster", out["sections"][0])
        with self.assertRaises(ValueError):                               # one tag short
            summary.tag(model({"GOALS:": TAGS[:2]}), out, GOALS, "a session")

    def test_write_gives_the_contracts_shape(self):
        with contextlib.redirect_stdout(io.StringIO()):
            out = summary.write(ASK, SESSION, {"name": "Sample Council"}, GOALS, {"model": "stand-in"})
        self.assertEqual(out["headline"], LINE)
        self.assertEqual(out["meta"]["model"], "stand-in")
        check_summary(self, out, SESSION)

    def test_a_refused_answer_is_asked_for_once_more(self):
        answers = iter(["Sure! Here is the summary.", json.dumps(REPLY)])
        with contextlib.redirect_stdout(io.StringIO()) as said:
            out = summary.write(lambda p: next(answers) if "TRANSCRIPT:" in p else ASK(p), SESSION, {}, GOALS, {"model": "m"})
        self.assertIn("asking once more", said.getvalue())
        check_summary(self, out, SESSION)
        with self.assertRaises(ValueError), contextlib.redirect_stdout(io.StringIO()):
            summary.write(lambda p: "no", SESSION, {}, GOALS, {"model": "m"})

    def test_the_summary_stands_when_goals_or_headline_fail(self):
        with contextlib.redirect_stdout(io.StringIO()):
            out = summary.write(model({"TRANSCRIPT:": REPLY, "GOALS:": "no", "news-site card": "Too short."}), SESSION, {}, GOALS, {"model": "m"})
        self.assertNotIn("headline", out)
        check_summary(self, out, SESSION)

    def test_a_translation_changes_strings_only(self):
        with contextlib.redirect_stdout(io.StringIO()):
            en = summary.write(ASK, SESSION, {}, GOALS, {"model": "m"})
        src = summary.strings(en)
        numbered = lambda strings, start=1: json.dumps({str(i): s for i, s in enumerate(strings, start)})
        tl = summary.translate(lambda p: numbered([f"[tl] {s}" for s in src]), en, "tl", "Filipino", "conversational")
        self.assertEqual(summary.strings(tl), [f"[tl] {s}" for s in src])
        strip = lambda d: json.dumps({**json.loads(json.dumps(d)), "meta": 0}, sort_keys=True).replace("[tl] ", "")
        self.assertEqual(strip(tl), strip(en))                            # same shape, refs, goals
        self.assertEqual(tl["meta"]["lang"], "tl")
        self.assertNotIn("[tl]", json.dumps(en))                          # the English copy is untouched
        short = iter([numbered(src[:-1]), numbered(src)])                # one string short, then right
        self.assertEqual(summary.strings(summary.translate(lambda p: next(short), en, "tl", "Filipino", log=lambda *_: None)), src)
        for wrong in (numbered(src + ["one more"]), numbered(src, start=0), json.dumps(src), numbered([""] * len(src))):
            with self.assertRaises(ValueError):
                summary.translate(lambda p: wrong, en, "tl", "Filipino", log=lambda *_: None)

    def test_the_endpoint_is_called_the_openai_way(self):
        seen = {}

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                seen.update(path=self.path, auth=self.headers.get("authorization"),
                            body=json.loads(self.rfile.read(int(self.headers["content-length"]))))
                reply = json.dumps({"choices": [{"message": {"content": "hello"}}]}).encode()
                self.send_response(200)
                self.send_header("content-length", str(len(reply)))
                self.end_headers()
                self.wfile.write(reply)

            def log_message(self, *a):
                pass

        server = HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with mock.patch.dict("os.environ", {"TEST_LLM_KEY": "made-up-key"}):
                ask = summary.chat({"base_url": f"http://127.0.0.1:{server.server_port}/v1/", "model": "open-model", "api_key_env": "TEST_LLM_KEY"})
            self.assertEqual(ask("hi"), "hello")
        finally:
            server.shutdown()
            server.server_close()
        self.assertEqual(seen["path"], "/v1/chat/completions")
        self.assertEqual(seen["auth"], "Bearer made-up-key")
        self.assertEqual(seen["body"]["model"], "open-model")
        self.assertEqual(seen["body"]["messages"], [{"role": "user", "content": "hi"}])


def check_summary(t, s, segments):
    """docs/hearings-api.md, `sessions/<id>.summary.json`."""
    t.assertLessEqual(set(s), {"headline", "glance", "sections", "issues", "meta"})
    claims = s["glance"] + [i for x in s["sections"] for i in x["items"]] + s["issues"]
    t.assertTrue(claims)
    for c in claims:
        t.assertTrue(c["refs"], c)
        t.assertTrue(all(type(r) is int and 0 <= r < len(segments) and not segments[r].get("skip") for r in c["refs"]), c)
    for i in s["glance"] + [i for x in s["sections"] for i in x["items"]]:
        t.assertEqual(set(i), {"lead", "text", "refs"})
    for i in s["issues"]:
        t.assertLessEqual({"topic", "summary", "refs"}, set(i))
        t.assertLessEqual(set(i), {"topic", "summary", "offices", "refs", "finishLines", "cluster", "at"})


LINES = {0: "the session is called to order", 30: "the cho asks for two more health stations",
         60: "noise", 90: "we take up proposed ordinance 2027 dash 001", 120: "the session is adjourned"}


def fake_engine(cfg):
    return lambda wavs: [LINES[int(pathlib.Path(w).stem)] for w in wavs]


class Transcribe(unittest.TestCase):
    def test_shards_are_written_once_and_a_stopped_run_continues(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(speech, "SHARD", 60), \
                mock.patch.dict(speech.ENGINES, {"fake": fake_engine}), \
                mock.patch.object(speech, "cut", lambda audio, start, seconds, wav: start != 120):  # nothing in the last line
            shards = speech.transcribe("x.m4a", 150, tmp, {"engine": "fake"}, log=lambda *_: None)
            self.assertEqual([[g["start"] for g in s] for s in shards], [[0, 30], [60, 90], []])
            self.assertEqual(shards[1][1], {"start": 90, "end": 120, "text": LINES[90]})
            (pathlib.Path(tmp) / "60.json").unlink()                      # as if the run had stopped there
            with mock.patch.dict(speech.ENGINES, {"fake": lambda cfg: lambda wavs: ["again"] * len(wavs)}):
                shards = speech.transcribe("x.m4a", 150, tmp, {"engine": "fake"}, log=lambda *_: None)
            self.assertEqual([g["text"] for s in shards for g in s], [LINES[0], LINES[30], "again", "again"])


def settings(tmp, extra=""):
    (tmp / "terms.txt").write_text("CHO\n")
    (tmp / "roster.json").write_text(json.dumps([{"slug": "member-one", "name": "Maria Dimaculangan (sample)", "role": "Member"}]))
    (tmp / "goals.json").write_text(json.dumps(GOALS))
    (tmp / "documents.json").write_text(json.dumps(Links.DOCS))
    (tmp / "hearings.toml").write_text(f"""
output = "out"
work = "work"
[speech]
engine = "fake"
[summary]
base_url = "http://stand-in.invalid/v1"
model = "stand-in"
[translate.tl]
name = "Filipino"
[data]
glossary = ["terms.txt"]
roster = "roster.json"
goals = "goals.json"
documents = "documents.json"
[[bodies]]
id = "council"
name = "Sample Council"
[[bodies]]
id = "peoples-council"
name = "Sample People's Council"
{extra}""")
    return tmp / "hearings.toml"


def cli(*argv):
    with contextlib.redirect_stdout(io.StringIO()) as said:
        hearings.main([str(a) for a in argv])
    return said.getvalue()


class Config(unittest.TestCase):
    def test_the_example_settings_load(self):
        with mock.patch.dict(speech.ENGINES, {"fake": fake_engine}):
            cfg = hearings.load_config(HERE / "example" / "hearings.toml")
        self.assertEqual(cfg["out"], HERE / "example" / "out")
        self.assertEqual(cfg["bodies"][0]["id"], "council")
        self.assertEqual(len(cfg["goals"]["finishLines"]), 8)
        self.assertEqual(text.fix("the m o o e of the city helth office", cfg["terms"]), "The m o o e of the City Health Office")
        self.assertEqual(text.fix("em o o e and kapital outlay", cfg["terms"]), "MOOE and Capital Outlay")
        self.assertTrue(json.loads((HERE / "example" / "documents.json").read_text()))

    def test_the_rosters_names_are_terms(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(speech.ENGINES, {"fake": fake_engine}):
            cfg = hearings.load_config(settings(pathlib.Path(tmp)))
        self.assertEqual(text.fix("councilor maria dimakulangan and dimaculangan", cfg["terms"]),
                         "Councilor Maria Dimaculangan and Dimaculangan")

    def test_bad_settings_stop_before_any_work(self):
        for extra, said in (('[[bodies]]\nid = "not an id"', "bodies"), ('[translate.ceb]\nname = "Cebuano"', "contract v1")):
            with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(speech.ENGINES, {"fake": fake_engine}):
                with self.assertRaises(SystemExit) as e:
                    hearings.load_config(settings(pathlib.Path(tmp), extra))
                self.assertIn(said, str(e.exception))
        with tempfile.TemporaryDirectory() as tmp:                        # no such engine
            with self.assertRaises(SystemExit):
                hearings.load_config(settings(pathlib.Path(tmp)))
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(speech.ENGINES, {"fake": fake_engine}):
            f = settings(pathlib.Path(tmp))
            f.write_text(f.read_text().replace('work = "work"', 'work = "out/work"'))
            with self.assertRaises(SystemExit) as e:                      # recordings inside the public folder
                hearings.load_config(f)
            self.assertIn("public", str(e.exception))


class Ids(unittest.TestCase):
    """An id becomes a file name here and a path in the pages, whose own check is ASCII."""

    def args(self, **k):
        return mock.Mock(**{"id": None, "title": None, "date": None, "body": None, **k})

    def test_an_id_is_ascii_and_never_index(self):
        for good in ("s1", "sample-session_1", "dQw4w9WgXcQ", "a" * 64):
            self.assertTrue(hearings.session_id(good), good)
        for bad in ("index", "Index", "INDEX", "sesión", "会议", "a b", "a/b", "..", "a.b", "", "a" * 65):
            self.assertFalse(hearings.session_id(bad), bad)
        self.assertEqual(hearings.as_id("sesión ordinaria #3"), "sesi-n-ordinaria-3")
        self.assertEqual(hearings.as_id("会议"), "")

    def test_a_files_name_becomes_an_ascii_id_or_the_run_stops(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(speech.ENGINES, {"fake": fake_engine}), \
                mock.patch.object(hearings, "duration", lambda media: 60):
            tmp = pathlib.Path(tmp)
            cfg = hearings.load_config(settings(tmp))
            for name in ("sesión.mp4", "index.mp4", "Index.mp4", "会议.mp4"):
                (tmp / name).write_bytes(b"")
            self.assertEqual(hearings.fetch(str(tmp / "sesión.mp4"), cfg, self.args())["id"], "sesi-n")
            self.assertEqual(hearings.fetch(str(tmp / "index.mp4"), cfg, self.args(id="session-1"))["id"], "session-1")
            for name, given in (("index.mp4", None), ("Index.mp4", None), ("会议.mp4", None), ("sesión.mp4", "sesión"), ("sesión.mp4", "index")):
                with self.assertRaises(SystemExit) as e:
                    hearings.fetch(str(tmp / name), cfg, self.args(id=given))
                self.assertIn("--id", str(e.exception))
            self.assertEqual(sorted(p.name for p in (tmp / "work").iterdir()), ["sesi-n", "session-1"])  # nothing made for a refused id

    def test_remove_never_touches_the_list_itself(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(speech.ENGINES, {"fake": fake_engine}):
            tmp = pathlib.Path(tmp)
            config = settings(tmp)
            hearings.index(hearings.load_config(config), {"id": "s1", "title": "One", "durationSec": 60, "source": "file"})
            before = (tmp / "out/sessions/index.json").read_text()
            for bad in ("index", "Index", "sesión", "../index"):
                with self.assertRaises(SystemExit):
                    cli("--config", config, "remove", bad)
            self.assertEqual((tmp / "out/sessions/index.json").read_text(), before)

    def test_a_members_slug_and_a_bodys_id_are_ascii_too(self):
        for extra, said in (('[[bodies]]\nid = "sesión"', "bodies"),):
            with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(speech.ENGINES, {"fake": fake_engine}):
                with self.assertRaises(SystemExit) as e:
                    hearings.load_config(settings(pathlib.Path(tmp), extra))
                self.assertIn(said, str(e.exception))
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(speech.ENGINES, {"fake": fake_engine}):
            f = settings(pathlib.Path(tmp))
            (pathlib.Path(tmp) / "roster.json").write_text(json.dumps([{"slug": "josé-reyes", "name": "José Reyes (sample)"}]))
            with self.assertRaises(SystemExit) as e:
                hearings.load_config(f)
            self.assertIn("roster", str(e.exception))


class Index(unittest.TestCase):
    def test_newest_first_one_entry_per_session(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = {"out": pathlib.Path(tmp)}
            row = lambda i, d, **k: {"id": i, "title": i.upper(), "date": d, "durationSec": 60, "body": "council", "source": "file", **k}
            hearings.index(cfg, row("a", "2027-01-05"))
            hearings.index(cfg, row("b", "2027-02-01", source="youtube"))
            hearings.index(cfg, row("c", ""))
            hearings.index(cfg, row("a", "2027-03-01", title="Again", media="/private/path", link="x"))
            rows = json.loads((pathlib.Path(tmp) / "sessions" / "index.json").read_text())
            self.assertEqual([r["id"] for r in rows], ["a", "b", "c"])
            self.assertEqual(rows[0], {"id": "a", "title": "Again", "date": "2027-03-01", "durationSec": 60, "body": "council", "source": "file"})
            self.assertEqual(rows[1]["source"], "youtube")
            self.assertNotIn("date", rows[2])
            hearings.index(cfg, remove="b")
            self.assertEqual([r["id"] for r in json.loads((pathlib.Path(tmp) / "sessions" / "index.json").read_text())], ["a", "c"])


class Run(unittest.TestCase):
    """The whole command on a session whose recording is already "downloaded", with stand-in models."""

    def test_from_shards_to_the_contracts_files_and_back_out(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(speech.ENGINES, {"fake": fake_engine}), \
                mock.patch.object(speech, "cut", lambda *a: True), mock.patch.object(hearings.shutil, "which", lambda t: t), \
                mock.patch.object(hearings, "video", lambda meta, cfg: None), \
                mock.patch.object(summary, "chat", lambda cfg, replies=None: ASK_ALL):
            tmp = pathlib.Path(tmp)
            config, out = settings(tmp), tmp / "out"
            (tmp / "work" / "s1").mkdir(parents=True)
            (tmp / "work" / "s1" / "meta.json").write_text(json.dumps(
                {"id": "s1", "title": "1st Regular Session", "date": "2027-01-12", "durationSec": 150, "source": "file", "media": __file__}))
            cli("--config", config, "run", "s1", "--body", "peoples-council")

            self.assertEqual(json.loads((out / "sessions/index.json").read_text()),
                             [{"id": "s1", "title": "1st Regular Session", "date": "2027-01-12", "durationSec": 150, "body": "peoples-council", "source": "file"}])
            session = json.loads((out / "sessions/s1.json").read_text())["segments"]
            self.assertEqual([g["start"] for g in session], [0, 30, 90, 120])
            self.assertEqual(session[1]["text"], "The CHO asks for two more health stations")
            for g in session:
                self.assertLessEqual(set(g), {"start", "end", "text", "skip", "words"})
            self.assertEqual([(x["seg"], x["kind"], x["no"]) for x in json.loads((out / "sessions/s1.links.json").read_text())], [(2, "proposed", "2027-001")])
            en = json.loads((out / "sessions/s1.summary.json").read_text())
            check_summary(self, en, session)
            tl = json.loads((out / "sessions/s1.summary.tl.json").read_text())
            check_summary(self, tl, session)
            self.assertTrue(tl["headline"].startswith("[tl] "))
            self.assertEqual(json.loads((out / "hearings.json").read_text())["bodies"][1], {"id": "peoples-council", "name": "Sample People's Council"})
            self.assertEqual(json.loads((out / "portal.json").read_text()), GOALS)
            self.assertEqual(json.loads((out / "councilors.json").read_text())[0]["slug"], "member-one")
            self.assertFalse((out / "glossary.json").exists())            # none was configured
            self.assertFalse(list(out.rglob("*.part")) + list(out.rglob("meta.json")))  # nothing private, nothing half written

            # again: nothing is transcribed or summarised twice
            with mock.patch.dict(speech.ENGINES, {"fake": lambda cfg: self.fail("transcribed again")}), \
                    mock.patch.object(summary, "chat", lambda cfg, replies=None: lambda p: self.fail("asked the model again")):
                self.assertIn("kept the one already there", cli("--config", config, "run", "s1"))
                self.assertEqual(json.loads((out / "sessions/index.json").read_text())[0]["body"], "peoples-council")
            # --redo summary asks again and replaces the translation too
            asked = []
            with mock.patch.object(summary, "chat", lambda cfg, replies=None: lambda p: asked.append(p) or ASK_ALL(p)):
                cli("--config", config, "run", "s1", "--redo", "summary")
            self.assertEqual(len(asked), 4)                               # summary, goals, headline, translation

            self.assertIn("4 files deleted", cli("--config", config, "remove", "s1"))
            self.assertEqual(json.loads((out / "sessions/index.json").read_text()), [])
            self.assertEqual(sorted(f.name for f in (out / "sessions").iterdir()), ["index.json"])
            self.assertTrue((tmp / "work/s1/shards/0.json").exists())     # the work folder is the operator's to delete


def ASK_ALL(prompt):
    if "Translate each value" in prompt:
        return json.dumps({k: f"[tl] {s}" for k, s in json.loads(prompt[prompt.index("\n\n{") + 2:]).items()})
    return model({"TRANSCRIPT:": {**REPLY, "glance": REPLY["glance"][:1], "sections": REPLY["sections"][:1],
                                  "issues": [{**REPLY["issues"][0], "refs": [1]}]},
                  "GOALS:": TAGS[:2], "news-site card": LINE})(prompt)


class Sample(unittest.TestCase):
    """The made-up sample the pages are tried against keeps the same shapes the pipeline writes."""

    def test_the_sample_follows_the_contract(self):
        d = HERE / "sample"
        for row in json.loads((d / "sessions/index.json").read_text()):
            self.assertRegex(row["id"], r"^[\w-]{1,64}$")
            self.assertIn(row["source"], ("youtube", "file"))
            session = json.loads((d / f"sessions/{row['id']}.json").read_text())["segments"]
            check_summary(self, json.loads((d / f"sessions/{row['id']}.summary.json").read_text()), session)
            for link in json.loads((d / f"sessions/{row['id']}.links.json").read_text()):
                self.assertLess(link["seg"], len(session))


if __name__ == "__main__":
    unittest.main()
