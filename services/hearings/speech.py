"""The stages that hear the recording: speech to text, and (optionally) when each word is said.

The speech model is a setting. Each engine is one function that takes wav files (16 kHz mono, one per line of the
transcript) and returns their text; add an engine by adding a function to ENGINES. The engines' libraries are
imported only when used, so the rest of the pipeline runs without them.
"""
import json, pathlib, re, subprocess, tempfile, unicodedata

from text import clean

SHARD = 1200  # seconds of recording per shard file: a run that stops loses at most this much work


def cut(audio, start, seconds, wav):
    """One line's audio -> a 16 kHz mono wav. False when there is nothing there: a recording's stated length can run
    past its audio, and ffmpeg then writes an empty file."""
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(start), "-t", str(seconds), "-i", str(audio),
                    "-ac", "1", "-ar", "16000", str(wav)], check=True)
    return pathlib.Path(wav).stat().st_size > 44 + 3200  # a wav header and a tenth of a second


def faster_whisper(cfg):
    """OpenAI's Whisper through CTranslate2. Runs on a CPU (README.md has what was measured).
    `language` is Whisper's code ("en", "tl"); empty lets the model guess, line by line."""
    import wave
    import numpy as np
    from faster_whisper import WhisperModel
    model = WhisperModel(cfg.get("model", "small"), device=cfg.get("device", "auto"), compute_type=cfg.get("compute_type", "default"))

    def samples(wav):
        # Our own wav (16 kHz mono, 16-bit, from `cut`) read here, not by the library's decoder: faster-whisper 1.2.1
        # with PyAV 19 fails to open any file ("unexpected keyword argument 'metadata_errors'").
        with wave.open(str(wav)) as f:
            return np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16).astype(np.float32) / 32768

    def run(wavs):
        return [" ".join(s.text.strip() for s in model.transcribe(
            samples(w), language=cfg.get("language") or None, vad_filter=True, condition_on_previous_text=False)[0]) for w in wavs]
    return run


def omnilingual(cfg):
    """Meta's Omnilingual ASR (1,600 languages, among them many Philippine ones). The `omniASR_LLM_*` models take a
    `language` such as "bcl_Latn"; the CTC ones ignore it. Needs a GPU in practice (the 3B model fits 16 GB), and a
    line must be under 40 seconds."""
    from omnilingual_asr.models.inference.pipeline import ASRInferencePipeline
    pipe = ASRInferencePipeline(model_card=cfg.get("model", "omniASR_LLM_3B_v2"))

    def run(wavs):
        lang = [cfg["language"]] * len(wavs) if cfg.get("language") else None
        return pipe.transcribe([str(w) for w in wavs], lang=lang, batch_size=1)
    return run


ENGINES = {"faster-whisper": faster_whisper, "omnilingual": omnilingual}


def transcribe(audio, duration, shard_dir, cfg, log=print):
    """The recording -> shard files `<start>.json`, each `[{start, end, text}]`, one entry per `line_seconds` of
    audio. A shard already on disk is kept, so a run that stopped picks up where it left off. Returns the shards
    in order; text.merge joins them."""
    line = int(cfg.get("line_seconds", 30))
    shard_dir = pathlib.Path(shard_dir)
    shard_dir.mkdir(parents=True, exist_ok=True)
    run = None
    for start in range(0, max(int(duration), 1), SHARD):
        out = shard_dir / f"{start}.json"
        if out.exists():
            continue
        if run is None:
            log(f"  loading the speech model ({cfg['engine']}: {cfg.get('model', 'its default')})")
            run = ENGINES[cfg["engine"]](cfg)
        with tempfile.TemporaryDirectory() as tmp:
            lines = [(off, pathlib.Path(tmp) / f"{off}.wav") for off in range(start, min(start + SHARD, int(duration) or 1), line)]
            lines = [(off, wav) for off, wav in lines if cut(audio, off, line, wav)]
            texts = run([wav for _, wav in lines]) if lines else []
        segs = [{"start": off, "end": min(off + line, int(duration) or off + line), "text": t}
                for (off, _), t in zip(lines, map(clean, texts)) if t]
        tmp_out = out.with_suffix(".part")
        tmp_out.write_text(json.dumps(segs, ensure_ascii=False))
        tmp_out.replace(out)  # a shard is whole or absent, never half written
        log(f"  {min(start + SHARD, int(duration))}/{int(duration)} s transcribed")
    return [json.loads(f.read_text()) for f in sorted(shard_dir.glob("*.json"), key=lambda f: int(f.stem))]


def _letters(w):
    w = "".join(c for c in unicodedata.normalize("NFD", w.lower()) if not unicodedata.combining(c))
    return re.sub(r"[^a-z']", "", w)


def align(segs, audio, log=print):
    """Add `words` to each line that has none: `[[start, end], ...]`, one pair per space-separated word of `text`,
    by forced alignment (torchaudio's MMS_FA: one multilingual model on romanised text, fine on a CPU). A word with
    no letters (a number) takes its neighbour's end. A line that cannot be aligned is left without `words`, and the
    page spreads its words evenly instead. Returns (aligned, failed)."""
    import torch
    from torchaudio.pipelines import MMS_FA as B
    model, tok, aligner = B.get_model(with_star=True), B.get_tokenizer(), B.get_aligner()
    done = failed = 0
    for n, g in enumerate(segs):
        words = g["text"].split()
        idx = [i for i, w in enumerate(words) if _letters(w)]
        if g.get("skip") or g.get("words") or not idx:
            continue
        try:
            raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", str(g["start"]), "-t", str(g["end"] - g["start"]),
                                  "-i", str(audio), "-ac", "1", "-ar", str(B.sample_rate), "-f", "f32le", "-"],
                                 capture_output=True, check=True).stdout
            wav = torch.frombuffer(bytearray(raw), dtype=torch.float32)[None]
            with torch.inference_mode():
                em, _ = model(wav)
            # a `*` on each side soaks up audio the text does not cover
            spans = aligner(em[0], tok(["*"] + [_letters(words[i]) for i in idx] + ["*"]))[1:-1]
        except Exception as e:  # more letters than audio frames, or no audio: the page falls back
            log(f"  line {n} not aligned: {e}")
            failed += 1
            continue
        sec = wav.size(1) / em.size(1) / B.sample_rate
        at = {i: [round(g["start"] + s[0].start * sec, 2), round(g["start"] + s[-1].end * sec, 2)] for i, s in zip(idx, spans)}
        last, out = g["start"], []
        for i in range(len(words)):
            out.append(at.get(i, [last, last]))
            last = out[-1][1]
        g["words"] = out
        done += 1
    return done, failed
