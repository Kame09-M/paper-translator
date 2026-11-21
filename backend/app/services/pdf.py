"""PDF から本文を段落ごとに、ページ番号と位置つきで取り出す。（担当: 寺田）

PyMuPDF のテキストブロックを段落とみなす。2段組の左右の列は別のブロックになり、
図・数式・見出しは訳さずに原文ページのまま見せる（画面が位置を使って訳を重ねる）。
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import fitz  # PyMuPDF


@dataclass
class Page:
    width: float
    height: float


@dataclass
class Paragraph:
    text: str
    page: int  # 0 始まり
    bbox: tuple[float, float, float, float]  # (x0, y0, x1, y1)。pt、左上原点


# 参考文献の見出し行（「References」「7 References」「Bibliography」など、その語だけの行）
REFERENCES_HEADING_RE = re.compile(r"^\s*(\d+\.?\s*)?(references|bibliography)\s*$", re.IGNORECASE)


WORD_RE = re.compile(r"[A-Za-z][a-z\-]+[,.;:]?")
EMAIL_RE = re.compile(r"\S+@\S+\.\w+")


def _is_prose(text: str) -> bool:
    """文章のブロックか。表・数式（英単語が半分未満）と著者欄（メールアドレス入りの短いもの）は訳さない。"""
    words = text.split()
    if sum(bool(WORD_RE.fullmatch(w)) for w in words) < len(words) / 2:
        return False
    return not (EMAIL_RE.search(text) and len(words) < 15)


def _join_lines(text: str) -> str:
    text = re.sub(r"-\n(\w)", r"\1", text)  # 行末ハイフンでの単語分割を戻す
    return re.sub(r"\s*\n\s*", " ", text).strip()


def _is_horizontal(block: dict) -> bool:
    """横書きのブロックか（arXiv の余白にある縦書きの ID などを除く）。"""
    return all(abs(line["dir"][1]) < 0.1 for line in block["lines"])


def _block_text(block: dict) -> str:
    return "\n".join("".join(span["text"] for span in line["spans"]) for line in block["lines"])


def _is_references_heading(raw: str) -> bool:
    lines = raw.strip().split("\n")
    head = lines[0]
    if head.strip().isdigit() and len(lines) >= 2:  # 「7\nReferences」のように番号が別の行のとき
        head = f"{head} {lines[1]}"
    return bool(REFERENCES_HEADING_RE.match(head))


def extract_layout(pdf_bytes: bytes, min_chars: int = 40) -> tuple[list[Page], list[Paragraph]]:
    """ページの大きさと、訳す段落（テキスト・ページ番号・位置）を返す。

    - 短いブロック（見出し・ページ番号）と、文章でないブロック（表・数式・著者欄）は
      訳さないので含めない
    - 参考文献の見出し以降（参考文献リストと、その後ろの付録）は含めない
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages: list[Page] = []
    paragraphs: list[Paragraph] = []
    for page_no, page in enumerate(doc):
        pages.append(Page(width=page.rect.width, height=page.rect.height))
        for block in page.get_text("dict")["blocks"]:
            if block["type"] != 0 or not block["lines"] or not _is_horizontal(block):
                continue
            raw = _block_text(block)
            if _is_references_heading(raw):
                return pages + _remaining_pages(doc, page_no + 1), paragraphs
            text = _join_lines(raw)
            if len(text) >= min_chars and _is_prose(text):
                x0, y0, x1, y1 = block["bbox"]
                paragraphs.append(Paragraph(text=text, page=page_no, bbox=(x0, y0, x1, y1)))
    return pages, paragraphs


def _remaining_pages(doc: fitz.Document, start: int) -> list[Page]:
    return [Page(width=p.rect.width, height=p.rect.height) for p in list(doc)[start:]]


def extract_paragraphs(pdf_bytes: bytes) -> list[str]:
    return [p.text for p in extract_layout(pdf_bytes)[1]]
