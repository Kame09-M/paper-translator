# paper-translator

英語論文（PDF）を日本語などに翻訳し、専門用語の訳語統一・用語説明・論文全体の要約を付けるアプリ。
大学の授業（NLP with DL）の課題。2人・1日開発。GitHub で公開する。

## 構成
- backend/: FastAPI。app/services/ に pdf.py, terms.py, translate.py, explain.py, summarize.py
- frontend/: Vite + React + TypeScript
- notebooks/colab_server.ipynb: Colab(GPU) でモデルとAPIを起動し、cloudflared で公開
- docs/DESIGN.md: 設計書。迷ったらまず読む

## 動かし方
- MOCK=1 でGPUなし・外部APIなしで動く（ダミー翻訳）。開発とテストは基本これ
- backend: `cd backend && pip install -r requirements-dev.txt && MOCK=1 uvicorn app.main:app --reload --port 8000`
- テスト: `cd backend && pytest` / lint: `ruff check .`
- frontend: `cd frontend && npm install && npm run dev`（APIのURLは画面上部の入力欄）
- コミット前に pytest, ruff check, `npm run build` が通ること

## 約束
- API の型は backend/app/schemas.py と frontend/src/types.ts を必ず同時に直す
- 翻訳は PLaMo 3 Translate（既存モデル、学習はしない）。用語集は apply_chat_template の
  glossary 引数、文脈は context 引数で渡す。モデルカードに書かれていないことは推測せず、確認する
- 未確認事項: T4 での fp16 動作、transformers のバージョン、Gemini 無料枠の上限とモデル名
- モデル重み・PDF・.env・APIキーはコミットしない（公開リポジトリ）
- 担当外のファイルは勝手に変えない。変える必要があれば、理由を説明して止まる
- ブランチは feat/<名前>-<内容>。小さくコミットし、30〜60分ごとに main へマージする
- 評価は簡易でよい（用語集あり/なしの訳を1本の論文で見比べる程度）。評価用の仕組みは作り込まない

## 担当
- 寺田: backend の pdf.py / terms.py / translate.py、notebooks/、requirements*.txt
- 市川: frontend/ 全部、explain.py、summarize.py（要約）
- 共有: schemas.py, types.ts, main.py（変更は小さく、先に相手に伝える）
- 2人で: 動作確認、README、レポート
