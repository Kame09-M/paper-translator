# paper-translator

専門用語の説明と要約を備えた、多言語対応の論文翻訳支援アプリ
（Multilingual Paper Translation Assistant with Term Explanation and Summarization）

英語論文（PDF）を日本語などに翻訳し、専門用語の訳語を論文全体でそろえたうえで、
用語ごとの簡易説明と論文全体の要約を付けて読解を助ける Web アプリです。
授業「Natural Language Processing with Deep Learning」（2026）の課題として作成しています。

> 開発中です。

## 動かし方（ローカル・MOCK）

GPU も API キーもなしで、ダミー翻訳で画面まで動きます。

```bash
# バックエンド（Python 3.9 以上）
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
MOCK=1 uvicorn app.main:app --reload --port 8000

# フロントエンド（別ターミナル、Node 20 以上）
cd frontend
npm install
npm run dev
```

ブラウザで表示された URL を開き、画面上部の「API URL」に `http://localhost:8000` を入れます。

本番の翻訳モデルは Google Colab（GPU）で動かします。`notebooks/colab_server.ipynb` を参照してください。

## テスト

```bash
cd backend && pytest && ruff check .
cd frontend && npm run build && npm run lint
```

## 処理の流れ

1. PDF から本文を抽出し、段落に分ける
2. 英語の専門用語を抽出し、訳語を決めて用語集にする
3. 用語集と直前の段落（文脈）を渡して、段落ごとに翻訳する
4. 段落のまとまりごとに要約し、それらをまとめて論文全体の要約を作る
5. 用語をクリックすると、訳語と簡易説明（論文中の文脈を根拠に生成）を表示する

## 使用技術

- 翻訳: PLaMo 3 Translate（学習はせず、用語集と文脈をプロンプトで渡す）
- 用語抽出: 頻度カウント / KeyBERT
- 用語説明・要約: LLM API（Gemini など）
- PDF の段落と位置の抽出: PyMuPDF（AGPL-3.0）
- PDF の表示: pdf.js（Apache-2.0）。原文ページと、段落の位置に訳を重ねたページを並べる
- フロントエンド: Vite + React + TypeScript
- バックエンド: FastAPI（推論は Google Colab の GPU 上で実行し、cloudflared で公開）

## 限界

- 図・表・数式・見出しは訳さず、原文ページのまま表示する
- 訳文は段落の枠に収まるよう文字を小さくするため、長い段落では読みにくくなることがある
- 用語説明と要約は LLM の出力のため、誤りを含む場合があります
