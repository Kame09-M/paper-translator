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


def test_split_paragraphs_without_blank_lines():
    # pypdf の実際の出力の形（空行なし。段落の最終行は文末記号で終わり、短い）
    full = "x" * 90
    text = "\n".join(
        [
            "1 Introduction",
            f"Recurrent neural networks {full}",
            f"in particular, have been firmly established {full}",
            "architectures [38, 24, 15].",
            f"Recurrent models typically factor computation {full}",
            "constraint of sequential computation, however, remains.",
        ]
    )
    paras = pdf.split_paragraphs(text)
    assert len(paras) == 2
    assert "Recurrent neural networks" in paras[0]  # 見出しの扱いは TODO
    assert paras[0].endswith("architectures [38, 24, 15].")
    assert paras[1].endswith("however, remains.")


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
    assert summarize.summarize_paper([], "ja") == ""
