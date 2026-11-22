# 設計書

迷ったらまずここを読む。決めたことが変わったら、ここも直す。

## 処理の流れ

```
PDF ──pdf.py──▶ 段落リスト（ページ番号・位置つき）
               ├─translate.py（直前の段落の原文と訳を履歴として渡す。用語集は使わない）──▶ 段落ごとの訳
               └─summarize.py（論文全体を1回で Gemini に渡す）──▶ [研究背景]〜[結論] の要約

語を選択 →「この用語のこの論文での意味を説明」──explain.py（選んだ位置の段落＋その語を含む段落）──▶ 説明
```

- 2026-11-21 方針変更: 自動の用語集（頻度で用語を選び訳語を固定）は選ぶ語のセンスが悪かったのでやめた。
  訳は素直に訳し、分からない語は読み手が選んで説明させる
- `MOCK=1`: 翻訳・説明・要約がすべてダミー。PDF 抽出は MOCK でも本物が動く
- `MOCK=0`: 翻訳が PLaMo 3 Translate になる（GPU 必須）。説明・要約は `GEMINI_API_KEY` があるときだけ本物（`config.use_llm_mock()`）

## 要約の形式（summarize.py のプロンプト）

```
[研究背景] [研究目的] [方法] [結果] [考察] [結論]
- 各項目を箇条書きにして300字以内で出力する
```

## Gemini の使い方（google-genai。PyPI の README・AI Studio のドキュメントで 2026-11 確認）

- `genai.Client()` は環境変数 `GEMINI_API_KEY` を読む。呼び出しは `client.models.generate_content`（`llm.py`）
  （新しい interactions API もあるが、Python 3.9 で入る 1.47 には無いので両方にある generate_content を使う）
- モデルは環境変数 `GEMINI_MODEL`（既定 `gemini-3.5-flash-lite`。Stable。`gemini-2.5-*` は廃止予定）

## PLaMo 3 Translate の使い方（モデルカードで確認済み）

- `apply_chat_template(messages, source_lang="en", target_lang="ja", context=...)`
- 言語は言語コード（`ja`, `en`, `zh-hans` など全53言語。モデルカードの Supported Languages）
- `glossary` 引数（用語集）もあるが、今は使わない（上の方針変更）
- 前の段落は「履歴」として渡す（`user`=原文, `assistant`=訳）。訳語・文体がそろう。今は直前1段落
- `context`: 文字列。今は未使用（論文タイトルなどを入れる余地あり）
- 入力全体＋出力で 32,768 トークン以内
- モデルは環境変数 `PLAMO_MODEL`（既定 `pfnet/plamo-3-translate-2b`）
- ライセンス: PLaMo Community License（学術・非商用は無料、登録不要）

## 配信（Colab）

- Colab で画面をビルドし（`npm run build`、Node は `nodejs-wheel`）、FastAPI が `frontend/dist` を `/` で配信する（`main.mount_frontend`）
- 画面と API が同じ URL になるので、ビルドした画面の API URL の既定値は `window.location.origin`。手元の dev サーバーでは `http://localhost:8000`
- Gemini のキーは画面で入力し、ヘッダー `X-Gemini-Api-Key` で要約・説明のときだけ送る（無ければ環境変数 `GEMINI_API_KEY`）

## API

型の正本は `backend/app/schemas.py` と `frontend/src/types.ts`。必ず同時に直す。

翻訳は**1段落ずつ**呼ぶ。論文1本（約100段落）は T4 で約17分かかり、1回の呼び出しでは
cloudflared の接続が切れる（約100秒）ため。1回を短くし、訳せた段落から画面に出す。

| メソッド | パス | 入力 | 出力 | 時間の目安 |
|---|---|---|---|---|
| GET | `/api/health` | なし | `{status, mock}` | |
| GET | `/api/fetch-pdf?url=…` | クエリ: `url`（arXiv の論文ページか PDF の URL） | PDF の中身（`application/pdf`、ファイル名はヘッダー `X-Filename`） | 数秒 |
| POST | `/api/prepare` | multipart: `file`（PDF）, `target_lang`（言語コード、既定 `ja`） | `{target_lang, pages[], paragraphs[]}` | 数秒 |
| POST | `/api/translate-paragraph` | JSON: `{text, target_lang, history[]}` | `{translation}` | 約10秒 |
| POST | `/api/summarize` | JSON: `{target_lang, paragraphs[]}`（原文） | `{summary}`（6項目のテキスト） | LLM API 次第 |
| POST | `/api/explain` | JSON: `{term, target_lang, contexts[]}` | `{term, explanation}` | LLM API 次第 |

- `fetch-pdf`: URL から読むときに使う。ブラウザからは CORS で多くの論文サイトの PDF を直接取れない
  （2026-11-22 に調べた範囲では arXiv だけが許可）ので、サーバーが代わりに取り、画面はそれを `/api/prepare` に渡す。
  arXiv の `/abs/…` は `/pdf/…` に直す。Colab のサーバーは公開 URL で誰でも呼べるので、http/https 以外・
  社内やローカルのアドレス（リダイレクト先も）・PDF 以外・50 MB 超は断る（`services/fetch.py`）。
  OpenReview（403）や PubMed Central（確認ページが返る）、購読が必要な出版社からは取れない
- `pages[]`（prepare の出力）: `{width, height}`（pt）。全ページ分
- `paragraphs[]`（prepare の出力）: `{id, source, page, bbox}`。`bbox` は `[x0, y0, x1, y1]`（pt、ページ左上が原点）
- 段落は PyMuPDF のテキストブロック。訳すのは文章のブロックだけ（見出し・表・数式・著者欄・References 以降は含めない）
- 画面は元の PDF を pdf.js で描き、段落の位置に訳を重ねる（図・表・数式は原文ページのまま残る）
- `history[]`: `{source, translation}`。直前の段落の原文と訳。画面が前の段落の結果を入れて送る
- 画面の流れ: prepare → summarize を並行で開始 → translate-paragraph を段落順に呼ぶ
- 語の選択: 原文は pdf.js のテキスト層、訳は重ねた訳文で選べる。選ぶとボタンが出る
- `contexts[]`（explain の入力）: 画面が集める。選んだ位置の段落を先頭に、その語を原文か訳に含む段落を最大3つ。
  訳があれば「原文: … / 訳: …」の形（`frontend/src/selection.ts` の `buildContexts`）

## 担当の境界

| ファイル | 担当 | 本番で差し替える関数 |
|---|---|---|
| `services/pdf.py` | 寺田 | `extract_layout`（段落の位置・訳す範囲の判定） |
| `services/translate.py` | 寺田 | `translate_paragraph`（PLaMo 3 Translate） |
| `services/explain.py` | 市川 | `explain_term`（LLM API） |
| `services/summarize.py` | 市川 | `summarize_paper`（LLM API） |
| `services/llm.py` | 市川 | `generate`（Gemini 呼び出し） |
| `services/fetch.py` | 市川 | `fetch_pdf`（URL から PDF を取る） |
| `frontend/` | 市川 | 全部 |

関数のシグネチャを変えずに中身だけ差し替えれば、相手の作業に影響しない。

## 未確認事項（推測で書かない）

- Gemini 無料枠の上限、既定モデル `gemini-3.5-flash-lite` が無料枠で使えるか（実際のキーで確認する）

## transformers のバージョン（2026-11-22）

- `transformers==5.23.0` に固定（`requirements-gpu.txt`）。モデルカードに指定はない
- 5.24.0 では訳が最初の語の繰り返しになる（例: `TransformerTransformer…`、`こんにちは。こんにちは。…`）。
  5.24 から `generate` がキャッシュを `cache` という名前で渡すが、PLaMo の `prepare_inputs_for_generation`
  は `past_key_values` で受け取るため、毎ステップでキャッシュが空になり、直前の1トークンしか見えない
- 上げるときは、PLaMo 側（`modeling_plamo.py`）が `cache` に対応したことを確かめてから

## 実測（2026-11-21, Colab T4, plamo-3-translate-2b, fp16）

- T4 の fp16 で動作し、訳は自然な日本語になる（モデルカードでは未保証だが実測で確認）
- 1段落あたり約 10.5 秒 → 論文1本（約100段落）で約 17 分。用語集 20 語の訳語決定は約 5 秒
- 用語集は効く（attention → 注意機構 が全段落でそろう）。ただし用語単体訳の質が悪いと訳を悪くする
  （recurrent → 反復的な、positions → ポジション）。一般語（input, output, different など）も用語に混ざる

## 評価

簡易でよい。用語集をやめたので、評価の観点は要相談（例: 文脈（直前の段落）あり／なしの訳の比較、
要約が6項目・各300字以内に収まるか、選んだ語の説明がその論文での意味になっているかを数語で目視）。

## 対象外

図・表・数式・見出しの翻訳（原文ページのまま表示する）。
