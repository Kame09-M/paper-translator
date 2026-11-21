from __future__ import annotations

from app.services import pdf, summarize, terms


def test_split_paragraphs_joins_lines_and_hyphens():
    text = (
        "This is a para-\ngraph that spans\nmultiple lines of text.\n\n"
        "short\n\n"
        "Another paragraph that is long enough to keep."
    )
    assert pdf.split_paragraphs(text) == [
        "This is a paragraph that spans multiple lines of text.",
        "Another paragraph that is long enough to keep.",
    ]


def test_extract_terms_counts_and_filters_stopwords():
    paras = ["Attention and attention again.", "This attention uses embeddings and embeddings."]
    found = terms.extract_terms(paras)
    assert found[0] == "attention"
    assert "embeddings" in found
    assert "this" not in found


def test_find_occurrences_is_word_bounded():
    paras = ["attention here", "no match", "self-attention counts", "attentions do not"]
    assert terms.find_occurrences("attention", paras) == [0, 2]


def test_summarize_empty():
    assert summarize.summarize_paper([], "Japanese") == ""
