"""translate.py の本番経路を、偽のモデルで確かめる（GPU 不要）。"""

from __future__ import annotations

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


def test_translate_paragraphs_passes_history_without_glossary(monkeypatch):
    tok = _use_fake(monkeypatch)
    out = translate.translate_paragraphs(
        ["Attention is all you need.", "The encoder uses attention."], "ja"
    )

    assert out == ["訳1", "訳2"]
    first, second = tok.calls
    # 1段落目: 履歴なし。用語集は渡さない
    assert first["messages"] == [{"role": "user", "content": "Attention is all you need."}]
    assert "glossary" not in first
    assert first["target_lang"] == "ja"
    # 2段落目: 直前の段落の原文と訳が履歴に入る
    assert second["messages"] == [
        {"role": "user", "content": "Attention is all you need."},
        {"role": "assistant", "content": "訳1"},
        {"role": "user", "content": "The encoder uses attention."},
    ]


class FakeGenModel:
    """prepare_inputs_for_generation が受け取った past_key_values を記録する。"""

    def __init__(self):
        self.received = []

    def prepare_inputs_for_generation(self, input_ids, past_key_values=None, **kwargs):
        self.received.append((past_key_values, kwargs))
        return {"input_ids": input_ids, "past_key_values": past_key_values}


def test_cache_kwarg_is_passed_as_past_key_values():
    # transformers 5.24 以降: キャッシュが `cache` で来ても PLaMo の past_key_values に届く
    model = FakeGenModel()
    translate.pass_cache_as_past_key_values(model)
    out = model.prepare_inputs_for_generation("ids", cache="CACHE", next_sequence_length=1)
    assert out["past_key_values"] == "CACHE"
    assert model.received == [("CACHE", {"next_sequence_length": 1})]


def test_past_key_values_kwarg_still_works():
    # transformers 5.23 以前: これまで通り past_key_values で来る
    model = FakeGenModel()
    translate.pass_cache_as_past_key_values(model)
    out = model.prepare_inputs_for_generation("ids", past_key_values="PKV")
    assert out["past_key_values"] == "PKV"
