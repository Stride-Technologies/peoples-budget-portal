"""Open-model sidecar for the Data Explorer (specs/020 B3.2).

Two capabilities behind one small HTTP contract (docs/modules/inference-sidecar.md):

- POST /v1/decide      typed decisions (choice / noul / score) from LAYA, with probabilities
- POST /v1/embeddings  OpenAI-compatible embeddings (bge-m3, multilingual-e5, ...)
- GET  /health         what is loaded, on which device

The Stride inference API is this same service, hosted, with a bearer key in front
(SIDECAR_API_KEY). Inputs are budget text and questions; nothing is written to disk
or logged beyond request counts and latency.
"""

from __future__ import annotations

import hmac
import json
import os
import time
from functools import lru_cache
from typing import Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

DEVICE = os.environ.get("DEVICE", "cpu")
# Comma-separated sentence-transformers ids; the first is the default.
EMBED_MODELS = [
    m.strip()
    for m in os.environ.get("EMBED_MODELS", "intfloat/multilingual-e5-base").split(",")
    if m.strip()
]
# A Hub id (optionally "repo:subfolder") or a local fine-tuned directory (tools/laya).
LAYA_MODEL = os.environ.get("LAYA_MODEL", "convaiinnovations/laya:multilingual")
API_KEY = os.environ.get("SIDECAR_API_KEY", "")
# The hosted Stride API sets this: it refuses to start without a key rather than serve openly.
if os.environ.get("SIDECAR_REQUIRE_KEY") == "1" and not API_KEY:
    raise SystemExit("SIDECAR_REQUIRE_KEY=1 but SIDECAR_API_KEY is empty.")
MAX_TEXTS = 256
MAX_CHARS = 8_000
MAX_STATE_CHARS = 16_000
MAX_CRITERIA = 64

# No /docs or /openapi.json: the contract is docs/modules/inference-sidecar.md.
app = FastAPI(title="budget-portal-inference", version="0.1.0", docs_url=None, redoc_url=None, openapi_url=None)


def auth(authorization: str = Header(default="")) -> None:
    """Open on a private network; a bearer key when exposed (the hosted Stride API)."""
    if API_KEY and not hmac.compare_digest(authorization.encode(), f"Bearer {API_KEY}".encode()):
        raise HTTPException(status_code=401, detail="Bad or missing bearer key.")


# ─── Embeddings ──────────────────────────────────────────────────────────────


@lru_cache(maxsize=4)
def embedder(model: str):
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(model, device=DEVICE)


def prefix(model: str, text: str, kind: str) -> str:
    """E5 models are trained with "query: " / "passage: " prefixes; others take raw text."""
    if "e5" in model.lower():
        return f"{kind}: {text}"
    return text


class EmbedRequest(BaseModel):
    input: list[str] | str
    model: str | None = None
    # Not in OpenAI's API: E5 wants to know a question from a document. Default "query".
    input_type: Literal["query", "passage"] = "query"


@app.post("/v1/embeddings", dependencies=[Depends(auth)])
def embeddings(req: EmbedRequest) -> dict[str, Any]:
    texts = [req.input] if isinstance(req.input, str) else req.input
    model = req.model or EMBED_MODELS[0]
    if model not in EMBED_MODELS:
        raise HTTPException(400, f"Model {model!r} is not served here: {EMBED_MODELS}.")
    if len(texts) > MAX_TEXTS or any(len(t) > MAX_CHARS for t in texts):
        raise HTTPException(413, f"At most {MAX_TEXTS} texts of {MAX_CHARS} characters.")
    started = time.perf_counter()
    vecs = embedder(model).encode(
        [prefix(model, t, req.input_type) for t in texts],
        normalize_embeddings=True,
        batch_size=32,
    )
    return {
        "object": "list",
        "model": model,
        "data": [
            {"object": "embedding", "index": i, "embedding": [float(x) for x in v]}
            for i, v in enumerate(vecs)
        ],
        "usage": {"prompt_tokens": 0, "total_tokens": 0},
        "latency_ms": round((time.perf_counter() - started) * 1000),
    }


# ─── Decisions ───────────────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def decider():
    import laya

    repo, _, sub = LAYA_MODEL.partition(":")
    return laya.load(repo, subfolder=sub or None, device=DEVICE)


class Question(BaseModel):
    type: Literal["choice", "noul", "score"]
    instructions: str = Field(max_length=2_000)
    # choice: {option: meaning}; score: {level: meaning}, low to high; noul: none.
    criteria: dict[str, str] | None = None


class DecideRequest(BaseModel):
    state: dict[str, Any] | str
    questions: dict[str, Question]


@app.post("/v1/decide", dependencies=[Depends(auth)])
def decide(req: DecideRequest) -> dict[str, Any]:
    if not req.questions or len(req.questions) > 32:
        raise HTTPException(400, "Between 1 and 32 questions.")
    state_chars = len(req.state) if isinstance(req.state, str) else len(json.dumps(req.state))
    if state_chars > MAX_STATE_CHARS:
        raise HTTPException(413, f"State over {MAX_STATE_CHARS} characters.")
    for qid, q in req.questions.items():
        if q.type in ("choice", "score") and not q.criteria:
            raise HTTPException(400, f"{qid}: a {q.type} needs criteria.")
        if q.criteria and (
            len(q.criteria) > MAX_CRITERIA or any(len(k) > 200 or len(v) > 2_000 for k, v in q.criteria.items())
        ):
            raise HTTPException(413, f"{qid}: at most {MAX_CRITERIA} options, short ones.")
    started = time.perf_counter()
    out = decider().predict(
        req.state,
        {k: q.model_dump(exclude_none=True) for k, q in req.questions.items()},
    )
    answers = {}
    for qid, a in out["answers"].items():
        answers[qid] = {
            "type": a["type"],
            # One field per type, the shape the TypeScript port reads.
            "choice": a.get("choice"),
            "probabilities": a.get("probabilities"),
            "p": a.get("noul"),
            "score": a.get("score"),
            "confidence": a.get("confidence"),
        }
    return {
        "model": LAYA_MODEL,
        "answers": answers,
        "latency_ms": round((time.perf_counter() - started) * 1000),
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "device": DEVICE,
        "embed_models": EMBED_MODELS,
        "decide_model": LAYA_MODEL,
        "loaded": {
            "embed": embedder.cache_info().currsize,
            "decide": decider.cache_info().currsize,
        },
    }
