from __future__ import annotations

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.config import is_mock
from app.schemas import (
    ExplainRequest,
    ExplainResponse,
    HealthResponse,
    Paragraph,
    TranslateResponse,
)
from app.services import explain, pdf, summarize, terms, translate

app = FastAPI(title="paper-translator")

# フロントはローカル、API は Colab（cloudflared の URL）なので全オリジンを許可する
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", mock=is_mock())


@app.post("/api/translate", response_model=TranslateResponse)
async def translate_pdf(
    file: UploadFile = File(...), target_lang: str = Form("ja")
) -> TranslateResponse:
    data = await file.read()
    try:
        paragraphs = pdf.extract_paragraphs(data)
    except Exception as e:  # 壊れたPDFなど
        raise HTTPException(status_code=400, detail=f"PDF を読めませんでした: {e}") from e
    if not paragraphs:
        raise HTTPException(status_code=400, detail="PDF から本文を抽出できませんでした")

    glossary = terms.build_glossary(paragraphs, target_lang)
    translations = translate.translate_paragraphs(paragraphs, target_lang, glossary)
    summary = summarize.summarize_paper(paragraphs, target_lang)
    return TranslateResponse(
        target_lang=target_lang,
        paragraphs=[
            Paragraph(id=i, source=s, translation=t)
            for i, (s, t) in enumerate(zip(paragraphs, translations))
        ],
        glossary=glossary,
        summary=summary,
    )


@app.post("/api/explain", response_model=ExplainResponse)
def explain_term(req: ExplainRequest) -> ExplainResponse:
    text = explain.explain_term(req.term, req.target_lang, req.contexts)
    return ExplainResponse(term=req.term, explanation=text)
