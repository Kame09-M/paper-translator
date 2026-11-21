"""PDF から本文を抽出して段落に分ける。（担当: 寺田）"""

from __future__ import annotations

import io
import re

from pypdf import PdfReader


def extract_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def split_paragraphs(text: str, min_chars: int = 40) -> list[str]:
    """空行区切りで段落にし、行末のハイフン改行と改行を整える。短すぎる断片は捨てる。

    TODO: 見出し・図表キャプション・参考文献の扱い
    """
    paragraphs = []
    for block in re.split(r"\n\s*\n", text):
        block = re.sub(r"-\n(\w)", r"\1", block)  # 行末ハイフンでの単語分割を戻す
        block = re.sub(r"\s*\n\s*", " ", block).strip()
        if len(block) >= min_chars:
            paragraphs.append(block)
    return paragraphs


def extract_paragraphs(pdf_bytes: bytes) -> list[str]:
    return split_paragraphs(extract_text(pdf_bytes))
