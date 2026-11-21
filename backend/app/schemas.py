"""API の型。変更するときは frontend/src/types.ts も必ず同時に直す。"""

from __future__ import annotations

from pydantic import BaseModel


class SourceParagraph(BaseModel):
    id: int
    source: str
    page: int  # 0 始まりのページ番号
    bbox: list[float]  # 段落の位置 [x0, y0, x1, y1]。単位は pt、ページの左上が原点


class PageSize(BaseModel):
    width: float  # pt
    height: float


class GlossaryEntry(BaseModel):
    term: str
    translation: str
    paragraph_ids: list[int]  # 用語が出現する段落の id（用語説明の根拠に使う）


class PrepareResponse(BaseModel):
    target_lang: str
    pages: list[PageSize]  # 全ページ（訳す段落がないページも含む）
    paragraphs: list[SourceParagraph]
    glossary: list[GlossaryEntry]


class HistoryPair(BaseModel):
    source: str
    translation: str


class TranslateParagraphRequest(BaseModel):
    text: str
    target_lang: str
    glossary: list[GlossaryEntry]
    history: list[HistoryPair] = []  # 直前の段落の原文と訳（訳語・文体をそろえるため）


class TranslateParagraphResponse(BaseModel):
    translation: str


class SummarizeRequest(BaseModel):
    target_lang: str
    paragraphs: list[str]  # 原文の段落


class SummarizeResponse(BaseModel):
    summary: str


class ExplainRequest(BaseModel):
    term: str
    target_lang: str
    contexts: list[str]  # 用語が出現する段落の原文


class ExplainResponse(BaseModel):
    term: str
    explanation: str


class HealthResponse(BaseModel):
    status: str
    mock: bool
