"""PDF から本文を抽出して段落に分ける。（担当: 寺田）"""

from __future__ import annotations

import io
import re

from pypdf import PdfReader


def extract_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


# 参考文献の見出し行（「References」「7 References」「Bibliography」など、その語だけの行）
REFERENCES_HEADING_RE = re.compile(
    r"^\s*(\d+\.?\s*)?(references|bibliography)\s*$", re.IGNORECASE | re.MULTILINE
)


def strip_references(text: str) -> str:
    """参考文献の見出し以降（参考文献リストと、その後ろの付録）を切り捨てる。

    見出しが複数あれば最後のものを使う（本文中の同名の行で切りすぎないため）。
    """
    matches = list(REFERENCES_HEADING_RE.finditer(text))
    return text[: matches[-1].start()] if matches else text


SENTENCE_END_RE = re.compile(r"[.!?:]\)?(\s*\[[\d,\s\-–]+\])?$")


def _split_block(lines: list[str], width: int) -> list[list[str]]:
    """空行のない行の並びを段落に分ける。

    pypdf の出力には空行がほぼ無いので、「文末記号で終わり、かつ行幅より明らかに短い行」を
    段落の最後の行とみなす。
    """
    groups: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        current.append(line)
        if SENTENCE_END_RE.search(line) and len(line) < width * 0.8:
            groups.append(current)
            current = []
    if current:
        groups.append(current)
    return groups


def _join_lines(lines: list[str]) -> str:
    text = "\n".join(lines)
    text = re.sub(r"-\n(\w)", r"\1", text)  # 行末ハイフンでの単語分割を戻す
    return re.sub(r"\s*\n\s*", " ", text).strip()


def split_paragraphs(text: str, min_chars: int = 40) -> list[str]:
    """テキストを段落に分け、改行と行末ハイフンを整える。短すぎる断片（見出し等）は捨てる。

    参考文献の見出し以降は訳さないので捨てる。TODO: 図表キャプションの扱い
    """
    text = strip_references(text)
    all_lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not all_lines:
        return []
    # 行幅の目安: 長い方から数えて上位の行の長さ（本文の1行の長さ）
    lengths = sorted(len(ln) for ln in all_lines)
    width = lengths[int(len(lengths) * 0.75)]

    paragraphs = []
    for block in re.split(r"\n\s*\n", text):
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        for group in _split_block(lines, width):
            para = _join_lines(group)
            if len(para) >= min_chars:
                paragraphs.append(para)
    return paragraphs


def extract_paragraphs(pdf_bytes: bytes) -> list[str]:
    return split_paragraphs(extract_text(pdf_bytes))
