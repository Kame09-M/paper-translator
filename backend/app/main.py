"""API。翻訳は1段落ずつ呼ぶ（論文1本を1回で訳すと十数分かかり、cloudflared の接続が切れるため）。

画面側の流れ:
1. POST /api/prepare で段落（ページ番号・位置つき）を受け取る
2. POST /api/summarize を並行して呼ぶ（[研究背景]〜[結論] の要約）
3. POST /api/translate-paragraph を段落ごとに順に呼ぶ（直前の段落の原文と訳を history に入れる）
4. 読み手が語を選んだら POST /api/explain で、その論文での意味を説明する
"""

from __future__ import annotations

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.config import is_mock
from app.schemas import (
    ExplainRequest,
    ExplainResponse,
    HealthResponse,
    PageSize,
    PrepareResponse,
    SourceParagraph,
    SummarizeRequest,
    SummarizeResponse,
    TranslateParagraphRequest,
    TranslateParagraphResponse,
)
from app.services import explain, pdf, summarize, translate

app = FastAPI(title="paper-translator")

# フロントはローカル、API は Colab（cloudflared の URL）なので全オリジンを許可する
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", mock=is_mock())


@app.post("/api/prepare", response_model=PrepareResponse)
async def prepare(file: UploadFile = File(...), target_lang: str = Form("ja")) -> PrepareResponse:
    data = await file.read()
    try:
        pages, paragraphs = pdf.extract_layout(data)
    except Exception as e:  # 壊れたPDFなど
        raise HTTPException(status_code=400, detail=f"PDF を読めませんでした: {e}") from e
    if not paragraphs:
        raise HTTPException(status_code=400, detail="PDF から本文を抽出できませんでした")

    return PrepareResponse(
        target_lang=target_lang,
        pages=[PageSize(width=p.width, height=p.height) for p in pages],
        paragraphs=[
            SourceParagraph(id=i, source=p.text, page=p.page, bbox=list(p.bbox))
            for i, p in enumerate(paragraphs)
        ],
    )


@app.post("/api/translate-paragraph", response_model=TranslateParagraphResponse)
def translate_paragraph(req: TranslateParagraphRequest) -> TranslateParagraphResponse:
    text = translate.translate_paragraph(
        req.text,
        req.target_lang,
        history=[(h.source, h.translation) for h in req.history],
    )
    return TranslateParagraphResponse(translation=text)


@app.post("/api/summarize", response_model=SummarizeResponse)
def summarize_paper(req: SummarizeRequest) -> SummarizeResponse:
    return SummarizeResponse(summary=summarize.summarize_paper(req.paragraphs, req.target_lang))


@app.post("/api/explain", response_model=ExplainResponse)
def explain_term(req: ExplainRequest) -> ExplainResponse:
    text = explain.explain_term(req.term, req.target_lang, req.contexts)
    return ExplainResponse(term=req.term, explanation=text)
