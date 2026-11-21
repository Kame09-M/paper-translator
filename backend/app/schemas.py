"""API の型。変更するときは frontend/src/types.ts も必ず同時に直す。"""

from __future__ import annotations

from pydantic import BaseModel


class Paragraph(BaseModel):
    id: int
    source: str
    translation: str


class GlossaryEntry(BaseModel):
    term: str
    translation: str
    paragraph_ids: list[int]  # 用語が出現する段落の id（用語説明の根拠に使う）


class TranslateResponse(BaseModel):
    target_lang: str
    paragraphs: list[Paragraph]
    glossary: list[GlossaryEntry]
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
