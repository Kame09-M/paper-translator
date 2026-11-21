"""用語の簡易説明を、論文中の文脈を根拠に生成する。（担当: 市川）

本番は LLM API（Gemini など）。モデル名・無料枠の上限は未確認。
"""

from __future__ import annotations

from app.config import use_llm_mock


def explain_term(term: str, target_lang: str, contexts: list[str]) -> str:
    if use_llm_mock():
        return f"（ダミー説明）「{term}」は本文中で {len(contexts)} 段落に出てくる用語です。"
    raise NotImplementedError("LLM API による用語説明は未実装")
