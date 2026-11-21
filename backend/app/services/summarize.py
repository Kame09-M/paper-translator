"""論文全体の要約。段落のまとまりごとに要約し、それらをまとめる。（担当: 市川）

本番は LLM API（Gemini など）。
"""

from __future__ import annotations

from app.config import use_llm_mock


def chunk(paragraphs: list[str], size: int = 5) -> list[list[str]]:
    return [paragraphs[i : i + size] for i in range(0, len(paragraphs), size)]


def summarize_chunk(paragraphs: list[str], target_lang: str) -> str:
    if use_llm_mock():
        return paragraphs[0][:80] + "…"
    raise NotImplementedError("LLM API による要約は未実装")


def merge_summaries(summaries: list[str], target_lang: str) -> str:
    if use_llm_mock():
        return "（ダミー要約）" + " / ".join(summaries)
    raise NotImplementedError("LLM API による要約の統合は未実装")


def summarize_paper(paragraphs: list[str], target_lang: str) -> str:
    if not paragraphs:
        return ""
    partial = [summarize_chunk(c, target_lang) for c in chunk(paragraphs)]
    return merge_summaries(partial, target_lang)
