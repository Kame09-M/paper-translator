from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "mock": True}


def test_prepare_returns_paragraphs_and_glossary(sample_pdf):
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
    terms = {g["term"]: g for g in body["glossary"]}
    assert terms["attention"]["paragraph_ids"] == [0]


def test_prepare_rejects_non_pdf():
    res = client.post(
        "/api/prepare",
        files={"file": ("x.pdf", b"not a pdf", "application/pdf")},
    )
    assert res.status_code == 400


def test_translate_paragraph_uses_glossary():
    res = client.post(
        "/api/translate-paragraph",
        json={
            "text": "Attention layers stack attention.",
            "target_lang": "ja",
            "glossary": [{"term": "attention", "translation": "注意機構", "paragraph_ids": [0]}],
            "history": [{"source": "Prev.", "translation": "前。"}],
        },
    )
    assert res.status_code == 200, res.text
    # MOCK の翻訳は用語集の訳語で置き換わる
    assert res.json()["translation"] == "[ja] 注意機構 layers stack 注意機構."


def test_translate_paragraph_history_is_optional():
    res = client.post(
        "/api/translate-paragraph",
        json={"text": "Hello world.", "target_lang": "ja", "glossary": []},
    )
    assert res.status_code == 200, res.text


def test_summarize():
    res = client.post(
        "/api/summarize",
        json={"target_lang": "ja", "paragraphs": ["First paragraph here.", "Second one."]},
    )
    assert res.status_code == 200
    assert res.json()["summary"]


def test_explain():
    res = client.post(
        "/api/explain",
        json={"term": "attention", "target_lang": "ja", "contexts": ["a", "b"]},
    )
    assert res.status_code == 200
    assert res.json()["term"] == "attention"
