# paper-translator

専門用語の説明と要約を備えた、多言語対応の論文翻訳支援アプリ
（Multilingual Paper Translation Assistant with Term Explanation and Summarization）

英語論文（PDF）を日本語などに翻訳し、専門用語の訳語を論文全体でそろえたうえで、
用語ごとの簡易説明と論文全体の要約を付けて読解を助ける Web アプリです。
授業「Natural Language Processing with Deep Learning」（2026）の課題として作成しています。

> 開発中です。セットアップ手順は実装に合わせて追記します。

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
- フロントエンド: Vite + React + TypeScript
- バックエンド: FastAPI（推論は Google Colab の GPU 上で実行し、cloudflared で公開）

## 限界

- 数式・図表・レイアウトの保持は対象外
- 用語説明と要約は LLM の出力のため、誤りを含む場合があります
