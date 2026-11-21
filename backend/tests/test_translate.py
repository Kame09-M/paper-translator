"""translate.py の本番経路を、偽のモデルで確かめる（GPU 不要）。"""

from __future__ import annotations

from app.schemas import GlossaryEntry
from app.services import translate


class FakeIds:
    shape = (1, 3)


class FakeInputs(dict):
    def to(self, device):
        return self


class FakeOutput:
    def __getitem__(self, idx):
        return "generated-ids"


class FakeTokenizer:
    def __init__(self):
        self.calls = []

    def apply_chat_template(self, messages, **kwargs):
        self.calls.append({"messages": messages, **kwargs})
        return FakeInputs(input_ids=FakeIds())

    def decode(self, ids, skip_special_tokens):
        return f" 訳{len(self.calls)} "


class FakeModel:
    device = "cpu"

    def generate(self, **kwargs):
        return FakeOutput()


def _use_fake(monkeypatch):
    tok = FakeTokenizer()
    monkeypatch.setenv("MOCK", "0")
    monkeypatch.setattr(translate, "_load", lambda: (tok, FakeModel()))
    return tok


def test_translate_paragraphs_passes_glossary_and_history(monkeypatch):
    tok = _use_fake(monkeypatch)
    glossary = [
        GlossaryEntry(term="attention", translation="注意機構", paragraph_ids=[0, 1]),
        GlossaryEntry(term="encoder", translation="エンコーダ", paragraph_ids=[1]),
    ]
    out = translate.translate_paragraphs(
        ["Attention is all you need.", "The encoder uses attention."], "ja", glossary
    )

    assert out == ["訳1", "訳2"]
    first, second = tok.calls
    # 1段落目: 履歴なし、その段落に出る用語だけ
    assert first["messages"] == [{"role": "user", "content": "Attention is all you need."}]
    assert first["glossary"] == [{"source": "attention", "target": "注意機構"}]
    assert first["target_lang"] == "ja"
    # 2段落目: 直前の段落の原文と訳が履歴に入る
    assert second["messages"] == [
        {"role": "user", "content": "Attention is all you need."},
        {"role": "assistant", "content": "訳1"},
        {"role": "user", "content": "The encoder uses attention."},
    ]
    assert {g["source"] for g in second["glossary"]} == {"attention", "encoder"}


def test_glossary_omitted_when_no_term_appears(monkeypatch):
    tok = _use_fake(monkeypatch)
    glossary = [GlossaryEntry(term="decoder", translation="デコーダ", paragraph_ids=[])]
    translate.translate_paragraph("Nothing relevant here.", "ja", glossary)
    assert "glossary" not in tok.calls[0]
