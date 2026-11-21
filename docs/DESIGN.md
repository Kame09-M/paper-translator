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

翻訳は**1段落ずつ**呼ぶ。論文1本（約100段落）は T4 で約17分かかり、1回の呼び出しでは
cloudflared の接続が切れる（約100秒）ため。1回を短くし、訳せた段落から画面に出す。

| メソッド | パス | 入力 | 出力 | 時間の目安 |
|---|---|---|---|---|
| GET | `/api/health` | なし | `{status, mock}` | |
| POST | `/api/prepare` | multipart: `file`（PDF）, `target_lang`（言語コード、既定 `ja`） | `{target_lang, paragraphs[], glossary[]}` | 数秒 |
| POST | `/api/translate-paragraph` | JSON: `{text, target_lang, glossary[], history[]}` | `{translation}` | 約10秒 |
| POST | `/api/summarize` | JSON: `{target_lang, paragraphs[]}`（原文） | `{summary}` | LLM API 次第 |
| POST | `/api/explain` | JSON: `{term, target_lang, contexts[]}` | `{term, explanation}` | LLM API 次第 |

- `paragraphs[]`（prepare の出力）: `{id, source}`
- `glossary[]`: `{term, translation, paragraph_ids[]}`
- `history[]`: `{source, translation}`。直前の段落の原文と訳。画面が前の段落の結果を入れて送る
- 画面の流れ: prepare → summarize を並行で開始 → translate-paragraph を段落順に呼ぶ
- 用語説明の根拠になる段落の原文は、画面が `paragraph_ids` から集めて `contexts` に入れて送る
- 用語は複数形（-s / -es）も同じ用語として扱う（`terms.term_pattern`。画面のハイライトも同じ規則）

## 担当の境界

| ファイル | 担当 | 本番で差し替える関数 |
|---|---|---|
| `services/pdf.py` | 寺田 | `split_paragraphs`（見出し・参考文献の扱い） |
| `services/terms.py` | 寺田 | 訳語は最初の出現段落を文脈にして翻訳モデルで決める。必要なら `extract_terms` を KeyBERT に |
| `services/translate.py` | 寺田 | `translate_paragraph`（PLaMo 3 Translate） |
| `services/explain.py` | 市川 | `explain_term`（LLM API） |
| `services/summarize.py` | 市川 | `summarize_chunk` / `merge_summaries`（LLM API） |
| `frontend/` | 市川 | 全部 |

関数のシグネチャを変えずに中身だけ差し替えれば、相手の作業に影響しない。

## 未確認事項（推測で書かない）

- transformers のバージョン（モデルカードに指定なし。config.json の保存時は 4.57.1）
- Gemini 無料枠の上限とモデル名

## 実測（2026-11-21, Colab T4, plamo-3-translate-2b, fp16）

- T4 の fp16 で動作し、訳は自然な日本語になる（モデルカードでは未保証だが実測で確認）
- 1段落あたり約 10.5 秒 → 論文1本（約100段落）で約 17 分。用語集 20 語の訳語決定は約 5 秒
- 用語集は効く（attention → 注意機構 が全段落でそろう）。ただし用語単体訳の質が悪いと訳を悪くする
  （recurrent → 反復的な、positions → ポジション）。一般語（input, output, different など）も用語に混ざる

## 評価

簡易でよい。1本の論文を用語集・文脈あり／なしで訳し、同じ用語の訳語の揺れを目で見比べる程度。

## 対象外

数式・図表・レイアウトの保持。
