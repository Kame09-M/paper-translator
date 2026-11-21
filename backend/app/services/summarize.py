"""論文全体の要約。決まった6項目の形式で、論文全体を1回で LLM に渡して作る。（担当: 市川）"""

from __future__ import annotations

from app.config import use_llm_mock
from app.services import llm

HEADINGS = ["[研究背景]", "[研究目的]", "[方法]", "[結果]", "[考察]", "[結論]"]

SYSTEM = """あなたは学術論文を読み手向けに要約する専門家です。
渡された論文の本文だけを根拠に要約し、本文に書かれていないことは書かないでください。

#出力形式
[研究背景]
[研究目的]
[方法]
[結果]
[考察]
[結論]

#出力条件
- 各項目を箇条書きにして300字以内で出力する。
- 箇条書きは「- 」で始める。見出しと箇条書き以外は出力しない。
- {lang} で書く。"""

LANG_NAMES = {
    "ja": "日本語",
    "en": "英語",
    "zh-hans": "簡体字中国語",
    "zh-hant": "繁体字中国語",
    "ko": "韓国語",
    "fr": "フランス語",
    "de": "ドイツ語",
    "es": "スペイン語",
}


def _mock_summary(paragraphs: list[str]) -> str:
    lines = []
    for h in HEADINGS:
        lines += [h, f"- （ダミー）{paragraphs[0][:40]}…"]
    return "\n".join(lines)


def summarize_paper(paragraphs: list[str], target_lang: str) -> str:
    if not paragraphs:
        return ""
    if use_llm_mock():
        return _mock_summary(paragraphs)
    system = SYSTEM.format(lang=LANG_NAMES.get(target_lang, target_lang))
    return llm.generate(system, "\n\n".join(paragraphs), max_tokens=4096)
