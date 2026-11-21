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


def test_split_paragraphs_drops_references_and_after():
    text = (
        "The model works well on every task we tried.\n\n"
        "References\n"
        "[1] Jimmy Lei Ba, Jamie Ryan Kiros, and Geoffrey E Hinton. Layer normalization.\n\n"
        "A Appendix: attention visualizations of the encoder layers."
    )
    assert pdf.split_paragraphs(text) == ["The model works well on every task we tried."]


def test_split_paragraphs_keeps_references_word_inside_sentence():
    text = "References to prior work are given in the related work section."
    assert pdf.split_paragraphs(text) == [text]


def test_extract_terms_counts_and_filters_stopwords():
    paras = ["Attention and attention again.", "This attention uses embeddings and embeddings."]
    found = terms.extract_terms(paras)
    assert found[0] == "attention"
    assert "embeddings" in found
    assert "this" not in found


def test_find_occurrences_is_word_bounded_and_matches_plural():
    paras = ["attention here", "no match", "self-attention counts", "attentions too", "attentive"]
    assert terms.find_occurrences("attention", paras) == [0, 2, 3]


def test_extract_terms_merges_plurals_and_skips_generic_words():
    paras = [
        "The encoder layer maps the input to the output.",
        "Each layer has two layers inside. The encoder output is different.",
    ]
    found = terms.extract_terms(paras)
    assert "layer" in found and "layers" not in found
    assert "encoder" in found
    for generic in ("input", "output", "different"):
        assert generic not in found


def test_build_glossary_drops_terms_left_untranslated(monkeypatch):
    def fake(terms_, target_lang, contexts):
        assert contexts["encoder"].startswith("The encoder")  # 最初の出現段落を文脈に渡す
        return {"encoder": "エンコーダ", "arxivish": "arxivish"}

    monkeypatch.setattr(terms, "extract_terms", lambda ps: ["encoder", "arxivish"])
    monkeypatch.setattr(terms, "decide_translations", fake)
    glossary = terms.build_glossary(["The encoder arxivish.", "encoder again"], "ja")
    assert [(g.term, g.translation, g.paragraph_ids) for g in glossary] == [
        ("encoder", "エンコーダ", [0, 1])
    ]


def test_summarize_empty():
    assert summarize.summarize_paper([], "ja") == ""
