# 設計書

迷ったらまずここを読む。決めたことが変わったら、ここも直す。

## 処理の流れ

```
PDF ──pdf.py──▶ 段落リスト
               ├─terms.py──▶ 用語集（用語・訳語・出現段落id）
               ├─translate.py（用語集＋直前の段落を渡す）──▶ 段落ごとの訳
               └─summarize.py（5段落ずつ要約 → 統合）──▶ 全体要約

用語クリック ──explain.py（出現段落の原文を根拠として渡す）──▶ 説明
```

`MOCK=1` のときは翻訳・訳語・説明・要約がダミーになる。PDF 抽出と用語抽出（頻度カウント）は MOCK でも本物が動く。

## API

型の正本は `backend/app/schemas.py` と `frontend/src/types.ts`。必ず同時に直す。

| メソッド | パス | 入力 | 出力 |
|---|---|---|---|
| GET | `/api/health` | なし | `{status, mock}` |
| POST | `/api/translate` | multipart: `file`（PDF）, `target_lang`（既定 `Japanese`） | `{target_lang, paragraphs[], glossary[], summary}` |
| POST | `/api/explain` | JSON: `{term, target_lang, contexts[]}` | `{term, explanation}` |

- `paragraphs[]`: `{id, source, translation}`
- `glossary[]`: `{term, translation, paragraph_ids[]}`
- 用語説明の根拠になる段落の原文は、フロントが `paragraph_ids` から集めて `contexts` に入れて送る

## 担当の境界

| ファイル | 担当 | 本番で差し替える関数 |
|---|---|---|
| `services/pdf.py` | 寺田 | `split_paragraphs`（見出し・参考文献の扱い） |
| `services/terms.py` | 寺田 | `decide_translations`（訳語の決め方）、必要なら `extract_terms` を KeyBERT に |
| `services/translate.py` | 寺田 | `translate_paragraph`（PLaMo 3 Translate） |
| `services/explain.py` | 市川 | `explain_term`（LLM API） |
| `services/summarize.py` | 市川 | `summarize_chunk` / `merge_summaries`（LLM API） |
| `frontend/` | 市川 | 全部 |

関数のシグネチャを変えずに中身だけ差し替えれば、相手の作業に影響しない。

## 未確認事項（推測で書かない）

- PLaMo 3 Translate: `apply_chat_template` の `glossary` / `context` 引数の形式、対応言語の一覧と言語名の書き方
- T4 での fp16 動作、transformers のバージョン
- Gemini 無料枠の上限とモデル名

## 評価

簡易でよい。1本の論文を用語集・文脈あり／なしで訳し、同じ用語の訳語の揺れを目で見比べる程度。

## 対象外

数式・図表・レイアウトの保持。
