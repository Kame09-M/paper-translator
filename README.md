# paper-translator

専門用語の説明と要約を備えた、多言語対応の論文翻訳支援アプリ
（Multilingual Paper Translation Assistant with Term Explanation and Summarization）

英語論文（PDF）を、元のレイアウトを保ったまま日本語などに翻訳し、論文全体の要約と、
読み手が選んだ語の「この論文での意味」の説明を付けて読解を助ける Web アプリです。
授業「Natural Language Processing with Deep Learning」（2026）の課題として作成しています。

> 開発中です。

## デモ動画・発表スライド

- デモ動画（スクリーンキャスト、約111MB）: [paper_translator_demo.webm](https://github.com/Kame09-M/paper-translator/releases/download/demo-2026-11-22/paper_translator_demo.webm)
- 発表スライド: [docs/presentation/paper_translator_slides.pptx](docs/presentation/paper_translator_slides.pptx)

動画は GitHub の 100MB 制限を超えるため、[リリース](https://github.com/Kame09-M/paper-translator/releases/tag/demo-2026-11-22)に添付しています。

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

ブラウザで表示された URL を開きます。API URL は自動で `http://localhost:8000` になります（変えるときは画面右上の「接続設定」）。

本番の翻訳モデルは Google Colab（GPU）で動かします。`notebooks/colab_server.ipynb` を上から実行し、
最後に表示される「アプリを開く」のリンクを開けば使えます（画面も Colab から配信され、API URL は自動で入ります）。
Gemini の API キーは画面右上の「接続設定」に入れます（このブラウザにだけ保存されます）。

## テスト

```bash
cd backend && pytest && ruff check .
cd frontend && npm run build && npm run lint
```

## 処理の流れ

1. PDF から本文を抽出し、段落に分ける
2. 直前の段落（文脈）を渡して、段落ごとに翻訳し、原文ページの段落の位置に訳を重ねて表示する
3. 翻訳と並行して、論文全体を [研究背景]〜[結論] の6項目で要約する
4. 分からない語を選択すると、その語のこの論文での意味を、論文中の段落を根拠に説明する

## 使用技術

- 翻訳: PLaMo 3 Translate（学習はせず、直前の段落を文脈として渡す）
- 用語説明・要約: Gemini（google-genai）
- PDF の段落と位置の抽出: PyMuPDF（AGPL-3.0）
- PDF の表示: pdf.js（Apache-2.0）。原文ページと、段落の位置に訳を重ねたページを並べる
- フロントエンド: Vite + React + TypeScript
- バックエンド: FastAPI（推論は Google Colab の GPU 上で実行し、cloudflared で公開）

## 限界

- 図・表・数式・見出しは訳さず、原文ページのまま表示する
- 訳文は段落の枠に収まるよう文字を小さくするため、長い段落では読みにくくなることがある
- 用語説明と要約は LLM の出力のため、誤りを含む場合があります
