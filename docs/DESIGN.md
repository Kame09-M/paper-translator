# 設計書

迷ったらまずここを読む。決めたことが変わったら、ここも直す。

## 処理の流れ

```
PDF ──pdf.py──▶ 段落リスト
               ├─terms.py──▶ 用語集（用語・訳語・出現段落id）
               ├─translate.py（その段落に出る用語＋直前の段落の原文と訳を渡す）──▶ 段落ごとの訳
               └─summarize.py（5段落ずつ要約 → 統合）──▶ 全体要約

用語クリック ──explain.py（出現段落の原文を根拠として渡す）──▶ 説明
```

- `MOCK=1`: 翻訳・訳語・説明・要約がすべてダミー。PDF 抽出と用語抽出（頻度カウント）は MOCK でも本物が動く
- `MOCK=0`: 翻訳と訳語が PLaMo 3 Translate になる（GPU 必須）。説明・要約は `GEMINI_API_KEY` があるときだけ本物（`config.use_llm_mock()`）

## PLaMo 3 Translate の使い方（モデルカードで確認済み）

- `apply_chat_template(messages, source_lang="en", target_lang="ja", glossary=..., context=...)`
- 言語は言語コード（`ja`, `en`, `zh-hans` など全53言語。モデルカードの Supported Languages）
- `glossary`: `[{"source": "attention", "target": "アテンション"}]`。その段落に出る用語だけ渡す
- 前の段落は「履歴」として渡す（`user`=原文, `assistant`=訳）。訳語・文体がそろう。今は直前1段落
- `context`: 文字列。今は未使用（論文タイトルなどを入れる余地あり）
- 入力全体＋出力で 32,768 トークン以内
- モデルは環境変数 `PLAMO_MODEL`（既定 `pfnet/plamo-3-translate-2b`）
- ライセンス: PLaMo Community License（学術・非商用は無料、登録不要）

## API

型の正本は `backend/app/schemas.py` と `frontend/src/types.ts`。必ず同時に直す。

| メソッド | パス | 入力 | 出力 |
|---|---|---|---|
| GET | `/api/health` | なし | `{status, mock}` |
| POST | `/api/translate` | multipart: `file`（PDF）, `target_lang`（言語コード、既定 `ja`） | `{target_lang, paragraphs[], glossary[], summary}` |
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

- T4（BF16 非対応）での fp16 動作。モデルカードは BF16 対応 GPU（L4 / A100 など）前提
- transformers のバージョン（モデルカードに指定なし。config.json の保存時は 4.57.1）
- 1段落の訳にかかる時間（論文1本＝約100段落）
- Gemini 無料枠の上限とモデル名

## 評価

簡易でよい。1本の論文を用語集・文脈あり／なしで訳し、同じ用語の訳語の揺れを目で見比べる程度。

## 対象外

数式・図表・レイアウトの保持。
