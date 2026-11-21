from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "mock": True}


def test_translate_pdf(sample_pdf):
    res = client.post(
        "/api/translate",
        files={"file": ("sample.pdf", sample_pdf, "application/pdf")},
        data={"target_lang": "Japanese"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["target_lang"] == "Japanese"
    assert len(body["paragraphs"]) == 1
    terms = {g["term"]: g for g in body["glossary"]}
    assert "attention" in terms
    assert terms["attention"]["paragraph_ids"] == [0]
    # MOCK の翻訳は用語集の訳語で置き換わる
    assert terms["attention"]["translation"] in body["paragraphs"][0]["translation"]
    assert body["summary"]


def test_translate_rejects_non_pdf():
    res = client.post(
        "/api/translate",
        files={"file": ("x.pdf", b"not a pdf", "application/pdf")},
    )
    assert res.status_code == 400


def test_explain():
    res = client.post(
        "/api/explain",
        json={"term": "attention", "target_lang": "Japanese", "contexts": ["a", "b"]},
    )
    assert res.status_code == 200
    assert res.json()["term"] == "attention"
