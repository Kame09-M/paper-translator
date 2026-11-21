# paper-translator

英語論文（PDF）をレイアウトを保ったまま日本語などに翻訳し、論文全体の要約と、読み手が選んだ語の説明を付けるアプリ。
大学の授業（NLP with DL）の課題。2人・1日開発。GitHub で公開する。

## 構成
- backend/: FastAPI。app/services/ に pdf.py, translate.py, explain.py, summarize.py, llm.py
- frontend/: Vite + React + TypeScript
- notebooks/colab_server.ipynb: Colab(GPU) でモデルとAPIを起動し、cloudflared で公開
- docs/DESIGN.md: 設計書。迷ったらまず読む

## 動かし方
- MOCK=1 でGPUなし・外部APIなしで動く（ダミー翻訳）。開発とテストは基本これ
- backend: `cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements-dev.txt && MOCK=1 uvicorn app.main:app --reload --port 8000`
- Python は 3.9 でも動くように書く（各ファイル先頭に `from __future__ import annotations`）
- テスト: `cd backend && pytest` / lint: `ruff check .`
- frontend: `cd frontend && npm install && npm run dev`（APIのURLは画面上部の入力欄）
- コミット前に pytest, ruff check, `npm run build` が通ること

## 約束
- API の型は backend/app/schemas.py と frontend/src/types.ts を必ず同時に直す
- 翻訳は PLaMo 3 Translate（既存モデル、学習はしない）。用語集は使わず、直前の段落を履歴として渡す。
  モデルカードに書かれていないことは推測せず、確認する
- 要約・用語説明は Gemini（llm.py）。GEMINI_API_KEY が無ければダミー
- 言語は言語コード（ja, en など）で渡す。PLaMo の使い方は docs/DESIGN.md にまとめた（モデルカード確認済み）
- 未確認事項: transformers のバージョン、Gemini 無料枠の上限と既定モデル（gemini-3.5-flash-lite）が無料枠で使えるか
- モデル重み・PDF・.env・APIキーはコミットしない（公開リポジトリ）
- 担当外のファイルは勝手に変えない。変える必要があれば、理由を説明して止まる
- ブランチは feat/<名前>-<内容>。小さくコミットし、30〜60分ごとに main へマージする
- 評価は簡易でよい（観点は docs/DESIGN.md の「評価」。要相談）。評価用の仕組みは作り込まない

## 担当
- 寺田: backend の pdf.py / translate.py、notebooks/、requirements*.txt
- 市川: frontend/ 全部、explain.py、summarize.py（要約）、llm.py
- 共有: schemas.py, types.ts, main.py（変更は小さく、先に相手に伝える）
- 2人で: 動作確認、README、レポート
