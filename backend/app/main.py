"""API。翻訳は1段落ずつ呼ぶ（論文1本を1回で訳すと十数分かかり、cloudflared の接続が切れるため）。

画面側の流れ:
1. POST /api/prepare で段落（ページ番号・位置つき）を受け取る
2. POST /api/summarize を並行して呼ぶ（[研究背景]〜[結論] の要約）
3. POST /api/translate-paragraph を段落ごとに順に呼ぶ（直前の段落の原文と訳を history に入れる）
4. 読み手が語を選んだら POST /api/explain で、その論文での意味を説明する

URL から読むときは、先に GET /api/fetch-pdf で PDF を受け取り、1 の /api/prepare に渡す
（ブラウザからは CORS で多くの論文サイトの PDF を直接取れないため、サーバーが代わりに取る）
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, Header, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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
from app.services import explain, fetch, pdf, summarize, translate

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


@app.get("/api/fetch-pdf")
def fetch_pdf(url: str = Query(..., max_length=2048)) -> Response:
    """論文の URL（arXiv の論文ページ、または PDF の URL）から PDF を取ってきて、そのまま返す。"""
    try:
        data, name = fetch.fetch_pdf(url)
    except fetch.FetchError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"X-Filename": name, "Access-Control-Expose-Headers": "X-Filename"},
    )


@app.post("/api/translate-paragraph", response_model=TranslateParagraphResponse)
def translate_paragraph(req: TranslateParagraphRequest) -> TranslateParagraphResponse:
    text = translate.translate_paragraph(
        req.text,
        req.target_lang,
        history=[(h.source, h.translation) for h in req.history],
    )
    return TranslateParagraphResponse(translation=text)


# 要約・用語説明の Gemini キーは、画面で入力したものをヘッダー X-Gemini-Api-Key で受け取る
# （無ければサーバーの環境変数 GEMINI_API_KEY）。キーはログにも応答にも出さない
# Python 3.9 の FastAPI は `str | None` を解釈できないので Optional を使う
GeminiKeyHeader = Optional[str]  # noqa: UP045


@app.post("/api/summarize", response_model=SummarizeResponse)
def summarize_paper(
    req: SummarizeRequest, x_gemini_api_key: GeminiKeyHeader = Header(default=None)
) -> SummarizeResponse:
    summary = summarize.summarize_paper(req.paragraphs, req.target_lang, api_key=x_gemini_api_key)
    return SummarizeResponse(summary=summary)


@app.post("/api/explain", response_model=ExplainResponse)
def explain_term(
    req: ExplainRequest, x_gemini_api_key: GeminiKeyHeader = Header(default=None)
) -> ExplainResponse:
    text = explain.explain_term(req.term, req.target_lang, req.contexts, api_key=x_gemini_api_key)
    return ExplainResponse(term=req.term, explanation=text)


def mount_frontend(target: FastAPI, dist: Path) -> bool:
    """ビルド済みの画面（frontend/dist）があれば "/" で配信する。API ルートより後に呼ぶこと。

    Colab から画面も一緒に配信すると、画面と API が同じ URL になり、API URL を手で入れなくてよい。
    dist が無ければ何もしない（手元の開発では Vite の dev サーバーで画面を出す）。
    """
    if not (dist / "index.html").is_file():
        return False
    target.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    return True


FRONTEND_DIST = Path(
    os.environ.get("FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist")
)
mount_frontend(app, FRONTEND_DIST)
