"""要約・用語説明が LLM に渡すプロンプトを、偽の llm.generate で確かめる（API キー不要）。"""

from __future__ import annotations

import pytest

from app.services import explain, llm, summarize


@pytest.fixture
def fake_llm(monkeypatch):
    calls = []

    def fake_generate(system: str, user: str, max_tokens: int) -> str:
        calls.append({"system": system, "user": user})
        return "生成結果"

    monkeypatch.setattr(llm, "generate", fake_generate)
    monkeypatch.setenv("MOCK", "0")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    return calls


def test_summarize_sends_whole_paper_once_with_format(fake_llm):
    out = summarize.summarize_paper(["First paragraph.", "Second paragraph."], "ja")
    assert out == "生成結果"
    assert len(fake_llm) == 1  # 論文全体を1回で渡す
    prompt = fake_llm[0]["system"] + fake_llm[0]["user"]
    for heading in ["[研究背景]", "[研究目的]", "[方法]", "[結果]", "[考察]", "[結論]"]:
        assert heading in prompt
    assert "300字以内" in prompt
    assert "First paragraph." in fake_llm[0]["user"]
    assert "Second paragraph." in fake_llm[0]["user"]


def test_explain_uses_term_and_contexts(fake_llm):
    out = explain.explain_term("attention", "ja", ["Self-attention relates positions."])
    assert out == "生成結果"
    user = fake_llm[0]["user"]
    assert "attention" in user
    assert "Self-attention relates positions." in user


def test_mock_summary_has_all_headings(monkeypatch):
    monkeypatch.setenv("MOCK", "1")
    out = summarize.summarize_paper(["A paragraph."], "ja")
    for heading in ["[研究背景]", "[研究目的]", "[方法]", "[結果]", "[考察]", "[結論]"]:
        assert heading in out
