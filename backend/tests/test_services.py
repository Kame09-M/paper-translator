from __future__ import annotations

from app.services import pdf, summarize, terms


def _two_column_pdf(pages: list[list[tuple[float, float, str]]]) -> bytes:
    """(x, y, text) を各ページの指定位置に書いた PDF を作る（左上原点・pt）。"""
    import fitz

    doc = fitz.open()
    for items in pages:
        page = doc.new_page(width=612, height=792)
        for x, y, text in items:
            page.insert_textbox(fitz.Rect(x, y, x + 230, y + 200), text, fontsize=9)
    return doc.tobytes()


LONG_LEFT = (
    "The left column paragraph talks about recurrent net-\nworks and their sequential nature."
)
LONG_RIGHT = "The right column paragraph explains why attention removes recurrence entirely."


def test_extract_layout_splits_columns_with_page_and_bbox():
    data = _two_column_pdf([[(50, 100, LONG_LEFT), (330, 100, LONG_RIGHT)]])
    pages, paras = pdf.extract_layout(data)
    assert pages == [pdf.Page(width=612, height=792)]
    assert [p.text for p in paras] == [
        "The left column paragraph talks about recurrent networks and their sequential nature.",
        LONG_RIGHT,
    ]
    left, right = paras
    assert left.page == right.page == 0
    assert left.bbox[2] < right.bbox[0]  # 左の列の右端 < 右の列の左端
    assert 95 <= left.bbox[1] <= 115


def test_extract_layout_skips_short_blocks():
    data = _two_column_pdf([[(50, 80, "1 Introduction"), (50, 120, LONG_RIGHT)]])
    _, paras = pdf.extract_layout(data)
    assert [p.text for p in paras] == [LONG_RIGHT]


def test_extract_layout_skips_tables_formulas_and_author_blocks():
    table = "GNMT + RL [38] 24.6 39.92 2.3 · 1019 1.4 · 1020"
    formula = "MultiHead(Q, K, V) = Concat(head1, ..., headh) WO"
    author = "Ashish Vaswani Google Brain avaswani@google.com"
    data = _two_column_pdf(
        [[(50, 50, table), (50, 150, formula), (50, 250, author), (50, 350, LONG_RIGHT)]]
    )
    _, paras = pdf.extract_layout(data)
    assert [p.text for p in paras] == [LONG_RIGHT]


def test_is_prose_block_rejects_table_with_names():
    # 人名が多い表は単語の割合では文章に見えるが、短い行が並ぶので表とみなす
    table = "Parser\nTraining\nWSJ 23 F1\nVinyals & Kaiser el al.\nPetrov et al. (2006)\nWSJ only"
    assert not pdf.is_prose_block(table)
    assert pdf.is_prose_block("A normal paragraph line that is long enough\nand continues here.")


def test_extract_layout_drops_references_and_after():
    data = _two_column_pdf(
        [
            [(50, 100, LONG_RIGHT), (50, 300, "References\n[1] Jimmy Ba. Layer normalization.")],
            [(50, 100, "Appendix: attention visualizations of the encoder layers.")],
        ]
    )
    pages, paras = pdf.extract_layout(data)
    assert len(pages) == 2
    assert [p.text for p in paras] == [LONG_RIGHT]


def test_extract_layout_keeps_references_word_inside_sentence():
    text = "References to prior work are given in the related work section."
    _, paras = pdf.extract_layout(_two_column_pdf([[(50, 100, text)]]))
    assert [p.text for p in paras] == [text]


def test_extract_paragraphs_returns_texts():
    assert pdf.extract_paragraphs(_two_column_pdf([[(50, 100, LONG_RIGHT)]])) == [LONG_RIGHT]


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


def test_merge_split_blocks_joins_paragraph_cut_mid_sentence():
    # 新しい PyMuPDF は1つの段落を途中で2ブロックに分けることがある（行間 12pt の2行 + 1行）
    blocks = [
        pdf.Block(bbox=(124, 73, 488, 99), raw="Provided attribution,\nGoogle grants"),
        pdf.Block(bbox=(270, 101, 340, 113), raw="scholarly works."),
    ]
    merged = pdf.merge_split_blocks(blocks)
    assert merged == [
        pdf.Block(
            bbox=(124, 73, 488, 113),
            raw="Provided attribution,\nGoogle grants\nscholarly works.",
        )
    ]


def test_merge_split_blocks_keeps_separate_paragraphs():
    blocks = [
        pdf.Block(bbox=(108, 100, 504, 124), raw="First paragraph ends here.\nSecond line."),
        pdf.Block(bbox=(108, 126, 504, 150), raw="Next paragraph starts.\nAnd continues."),
        pdf.Block(bbox=(108, 170, 300, 180), raw="3.1 Encoder and Decoder Stacks"),  # 見出し
        # 左の列の末尾（文の途中）と、右の列の先頭は横に重ならないのでつなげない
        pdf.Block(bbox=(108, 190, 300, 214), raw="Left column ends in the\nmiddle of a"),
        pdf.Block(bbox=(330, 215, 504, 239), raw="right column block\nstarts here."),
        # 表のキャプションと、すぐ下の表本体はつなげない（訳で表を隠さないため）
        pdf.Block(bbox=(108, 300, 504, 310), raw="Table 4: Results on Section 23 of WSJ (F1)"),
        pdf.Block(bbox=(108, 312, 504, 400), raw="Parser Training WSJ 23 F1\n88.3 90.4 91.7 92.1"),
    ]
    assert pdf.merge_split_blocks(blocks) == blocks
