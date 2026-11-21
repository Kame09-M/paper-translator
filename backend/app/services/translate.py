"""用語集と文脈付きの段落翻訳。（担当: 寺田）

本番は PLaMo 3 Translate。用語集は apply_chat_template の glossary 引数、
文脈は context 引数で渡す。引数の形式はモデルカードで確認してから書くこと（推測しない）。
"""

from __future__ import annotations

import re

from app.config import is_mock
from app.schemas import GlossaryEntry


def _mock_translate(text: str, target_lang: str, glossary: list[GlossaryEntry]) -> str:
    # 用語集の訳語が効いていることが画面で分かるよう、用語だけ置き換える
    out = text
    for g in glossary:
        out = re.sub(rf"\b{re.escape(g.term)}\b", g.translation, out, flags=re.IGNORECASE)
    return f"[{target_lang}] {out}"


def translate_paragraph(
    text: str,
    target_lang: str,
    glossary: list[GlossaryEntry],
    context: str | None = None,
) -> str:
    if is_mock():
        return _mock_translate(text, target_lang, glossary)
    raise NotImplementedError("PLaMo 3 Translate の呼び出しは未実装（モデルカード確認待ち）")


def translate_paragraphs(
    paragraphs: list[str], target_lang: str, glossary: list[GlossaryEntry]
) -> list[str]:
    results = []
    for i, p in enumerate(paragraphs):
        context = paragraphs[i - 1] if i > 0 else None  # 直前の段落を文脈として渡す
        results.append(translate_paragraph(p, target_lang, glossary, context))
    return results
