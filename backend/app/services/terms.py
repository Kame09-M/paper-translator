"""専門用語の抽出と用語集づくり。（担当: 寺田）

今は頻度カウントのみ。時間があれば KeyBERT に差し替える。
"""

from __future__ import annotations

import re
from collections import Counter

from app.schemas import GlossaryEntry

# 用語から外す語。機能語に加え、論文に頻出するが専門用語ではない一般語を入れている
# （Colab 実測で input / output / different / arxiv などが用語に混ざったため）
STOPWORDS = {
    "this", "that", "with", "from", "which", "these", "those", "have", "been", "were",
    "their", "there", "such", "than", "then", "also", "into", "over", "between", "each",
    "both", "more", "most", "other", "some", "only", "when", "where", "while", "based",
    "using", "used", "show", "shows", "shown", "however", "results", "result", "paper",
    "table", "figure", "section", "approach", "method", "methods", "model", "models",
    "work", "works", "input", "inputs", "output", "outputs", "different", "value",
    "values", "number", "numbers", "first", "second", "third", "same", "several",
    "many", "much", "well", "very", "would", "could", "should", "will", "they", "them",
    "what", "about", "after", "before", "because", "through", "during", "without",
    "within", "under", "above", "below", "since", "another", "make", "makes", "made",
    "given", "large", "small", "high", "lower", "higher", "better", "best", "even",
    "time", "times", "task", "tasks", "data", "case", "cases", "example",
    "propose", "proposed", "present", "describe", "described", "previous", "following",
    "single", "similar", "compared", "allows", "across", "here", "does", "done",
    "arxiv", "http", "https", "github", "google", "proceedings", "conference",
    "university", "journal", "preprint", "abstract", "introduction", "conclusion",
}  # fmt: skip

WORD_RE = re.compile(r"[A-Za-z][A-Za-z\-]{3,}")


def term_pattern(term: str) -> re.Pattern[str]:
    """用語にマッチする正規表現（複数形の -s / -es も同じ用語として扱う）。"""
    return re.compile(rf"\b{re.escape(term)}(?:e?s)?\b", re.IGNORECASE)


def _singular(word: str, counts: Counter[str]) -> str:
    for suffix in ("es", "s"):
        stem = word[: -len(suffix)]
        if word.endswith(suffix) and len(stem) >= 3 and stem in counts:
            return stem
    return word


def extract_terms(paragraphs: list[str], top_n: int = 20, min_count: int = 2) -> list[str]:
    counts: Counter[str] = Counter()
    for p in paragraphs:
        for w in WORD_RE.findall(p):
            w = w.lower().strip("-")
            if w not in STOPWORDS:
                counts[w] += 1
    # 単数形と複数形をまとめる（layer / layers）
    merged: Counter[str] = Counter()
    for w, c in counts.items():
        merged[_singular(w, counts)] += c
    return [w for w, c in merged.most_common(top_n) if c >= min_count]


def find_occurrences(term: str, paragraphs: list[str]) -> list[int]:
    pattern = term_pattern(term)
    return [i for i, p in enumerate(paragraphs) if pattern.search(p)]


def decide_translations(
    terms: list[str], target_lang: str, contexts: dict[str, str]
) -> dict[str, str]:
    """各用語の訳語を、最初に出てくる段落を文脈にして翻訳モデルで決める。

    用語単体で訳すと recurrent → 反復的な のように論文の意味から外れたため、文脈を渡す。
    """
    from app.services.translate import translate_text

    return {t: translate_text(t, target_lang, context=contexts.get(t)) for t in terms}


def build_glossary(paragraphs: list[str], target_lang: str) -> list[GlossaryEntry]:
    terms = extract_terms(paragraphs)
    occurrences = {t: find_occurrences(t, paragraphs) for t in terms}
    contexts = {t: paragraphs[ids[0]] for t, ids in occurrences.items() if ids}
    translations = decide_translations(terms, target_lang, contexts)
    return [
        GlossaryEntry(term=t, translation=translations[t], paragraph_ids=occurrences[t])
        for t in terms
        # 訳しても原語のままの語（固有名など）は、訳語をそろえる意味がないので外す
        if translations[t].strip().lower() != t.lower()
    ]
