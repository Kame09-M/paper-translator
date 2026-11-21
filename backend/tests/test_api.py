from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "mock": True}


def test_prepare_returns_paragraphs_with_layout(sample_pdf):
    res = client.post(
        "/api/prepare",
        files={"file": ("sample.pdf", sample_pdf, "application/pdf")},
        data={"target_lang": "ja"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["target_lang"] == "ja"
    assert len(body["paragraphs"]) == 1
    assert body["paragraphs"][0]["id"] == 0
    assert body["paragraphs"][0]["page"] == 0
    assert len(body["paragraphs"][0]["bbox"]) == 4
    assert body["pages"] == [{"width": 612, "height": 792}]
    assert "glossary" not in body


def test_prepare_rejects_non_pdf():
    res = client.post(
        "/api/prepare",
        files={"file": ("x.pdf", b"not a pdf", "application/pdf")},
    )
    assert res.status_code == 400


def test_translate_paragraph_with_history():
    res = client.post(
        "/api/translate-paragraph",
        json={
            "text": "Attention layers stack attention.",
            "target_lang": "ja",
            "history": [{"source": "Prev.", "translation": "前。"}],
        },
    )
    assert res.status_code == 200, res.text
    assert res.json()["translation"] == "[ja] Attention layers stack attention."


def test_translate_paragraph_history_is_optional():
    res = client.post(
        "/api/translate-paragraph",
        json={"text": "Hello world.", "target_lang": "ja"},
    )
    assert res.status_code == 200, res.text


def test_summarize():
    res = client.post(
        "/api/summarize",
        json={"target_lang": "ja", "paragraphs": ["First paragraph here.", "Second one."]},
    )
    assert res.status_code == 200
    summary = res.json()["summary"]
    for heading in ["[研究背景]", "[研究目的]", "[方法]", "[結果]", "[考察]", "[結論]"]:
        assert heading in summary


def test_explain():
    res = client.post(
        "/api/explain",
        json={"term": "attention", "target_lang": "ja", "contexts": ["a", "b"]},
    )
    assert res.status_code == 200
    assert res.json()["term"] == "attention"


def test_gemini_key_header_is_passed_to_services(monkeypatch):
    from app.services import explain, summarize

    seen = {}
    monkeypatch.setattr(
        summarize, "summarize_paper", lambda ps, lang, api_key=None: seen.setdefault("s", api_key)
    )
    monkeypatch.setattr(
        explain, "explain_term", lambda t, lang, ctx, api_key=None: seen.setdefault("e", api_key)
    )
    headers = {"X-Gemini-Api-Key": "key-from-ui"}
    client.post("/api/summarize", json={"target_lang": "ja", "paragraphs": ["a"]}, headers=headers)
    client.post(
        "/api/explain", json={"term": "t", "target_lang": "ja", "contexts": []}, headers=headers
    )
    assert seen == {"s": "key-from-ui", "e": "key-from-ui"}
