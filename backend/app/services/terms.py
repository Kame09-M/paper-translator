"""専門用語の抽出と用語集づくり。（担当: 寺田）

今は頻度カウントのみ。時間があれば KeyBERT に差し替える。
"""

from __future__ import annotations

import re
from collections import Counter

from app.config import is_mock
from app.schemas import GlossaryEntry

# 最小限のストップワード。必要に応じて増やす
STOPWORDS = {
    "this", "that", "with", "from", "which", "these", "those", "have", "been", "were",
    "their", "there", "such", "than", "then", "also", "into", "over", "between", "each",
    "both", "more", "most", "other", "some", "only", "when", "where", "while", "based",
    "using", "used", "show", "shows", "shown", "however", "results", "paper", "table",
    "figure", "section", "approach", "method", "methods", "model", "models", "work",
}  # fmt: skip

WORD_RE = re.compile(r"[A-Za-z][A-Za-z\-]{3,}")


def extract_terms(paragraphs: list[str], top_n: int = 20, min_count: int = 2) -> list[str]:
    counts: Counter[str] = Counter()
    for p in paragraphs:
        for w in WORD_RE.findall(p):
            w = w.lower().strip("-")
            if w not in STOPWORDS:
                counts[w] += 1
    return [w for w, c in counts.most_common(top_n) if c >= min_count]


def find_occurrences(term: str, paragraphs: list[str]) -> list[int]:
    pattern = re.compile(rf"\b{re.escape(term)}\b", re.IGNORECASE)
    return [i for i, p in enumerate(paragraphs) if pattern.search(p)]


def decide_translations(terms: list[str], target_lang: str) -> dict[str, str]:
    """各用語の訳語を決める。

    TODO(本番): 決め方を決める（翻訳モデルで用語単体を訳す / LLM に文脈付きで聞く など）
    """
    if is_mock():
        return {t: f"〈{t}〉" for t in terms}
    raise NotImplementedError("訳語の決め方は未実装")


def build_glossary(paragraphs: list[str], target_lang: str) -> list[GlossaryEntry]:
    terms = extract_terms(paragraphs)
    translations = decide_translations(terms, target_lang)
    return [
        GlossaryEntry(
            term=t, translation=translations[t], paragraph_ids=find_occurrences(t, paragraphs)
        )
        for t in terms
    ]
