"""Contract tests with fake models: the shapes the TypeScript port reads (specs/020 B3.2)."""

import numpy as np
import pytest
from fastapi.testclient import TestClient

import app as sidecar


class FakeEmbedder:
    def encode(self, texts, normalize_embeddings, batch_size):
        assert normalize_embeddings
        return np.array([[1.0, 0.0] if "health" in t else [0.0, 1.0] for t in texts])


class FakeDecider:
    def predict(self, state, questions):
        return {
            "answers": {
                "label": {"type": "choice", "choice": "health", "probabilities": {"health": 0.9, "roads": 0.1}, "confidence": 0.8},
                "named": {"type": "noul", "noul": 0.7, "confidence": 0.4},
            }
        }


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(sidecar, "embedder", lambda model: FakeEmbedder())
    monkeypatch.setattr(sidecar, "decider", lambda: FakeDecider())
    monkeypatch.setattr(sidecar, "EMBED_MODELS", ["intfloat/multilingual-e5-base"])
    monkeypatch.setattr(sidecar, "API_KEY", "")
    return TestClient(sidecar.app)


def test_embeddings_are_openai_shaped_and_in_order(client):
    r = client.post("/v1/embeddings", json={"input": ["roads", "health centre"]})
    assert r.status_code == 200
    body = r.json()
    assert [d["index"] for d in body["data"]] == [0, 1]
    assert body["data"][1]["embedding"] == [1.0, 0.0]
    assert body["model"] == "intfloat/multilingual-e5-base"


def test_embeddings_refuse_an_unserved_model(client):
    assert client.post("/v1/embeddings", json={"input": "x", "model": "other"}).status_code == 400


def test_e5_prefix():
    assert sidecar.prefix("intfloat/multilingual-e5-base", "x", "query") == "query: x"
    assert sidecar.prefix("BAAI/bge-m3", "x", "query") == "x"


def test_decide_returns_one_field_per_type(client):
    r = client.post(
        "/v1/decide",
        json={
            "state": {"row": "Clinic supplies"},
            "questions": {
                "label": {"type": "choice", "instructions": "What is it for?", "criteria": {"health": "h", "roads": "r"}},
                "named": {"type": "noul", "instructions": "Does it name a barangay?"},
            },
        },
    )
    assert r.status_code == 200
    a = r.json()["answers"]
    assert a["label"]["choice"] == "health" and a["label"]["probabilities"]["health"] == 0.9
    assert a["named"]["p"] == 0.7


def test_choice_needs_criteria(client):
    r = client.post("/v1/decide", json={"state": "x", "questions": {"q": {"type": "choice", "instructions": "?"}}})
    assert r.status_code == 400


def test_bearer_key_when_set(client, monkeypatch):
    monkeypatch.setattr(sidecar, "API_KEY", "k")
    assert client.post("/v1/embeddings", json={"input": "x"}).status_code == 401
    assert client.post("/v1/embeddings", json={"input": "x"}, headers={"authorization": "Bearer k"}).status_code == 200


def test_oversized_state_and_no_public_docs(client):
    big = {"state": "x" * 20_000, "questions": {"q": {"type": "noul", "instructions": "?"}}}
    assert client.post("/v1/decide", json=big).status_code == 413
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404
