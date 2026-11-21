"""用語集と文脈付きの段落翻訳。（担当: 寺田）

本番は PLaMo 3 Translate（Transformers の chat template を使う）。
モデルカード（https://huggingface.co/pfnet/plamo-3-translate-8b）で確認済みの使い方:
- target_lang / source_lang は言語コード（"ja", "en" など）
- glossary は [{"source": 原語, "target": 訳語}, ...]
- context は文字列（周辺の文や状況の説明）
- 前の段落の原文と訳を user / assistant の履歴として渡すと、訳語や文体がそろう
- 入力全体＋出力で 32,768 トークン以内
"""

from __future__ import annotations

import os
from functools import lru_cache

from app.config import is_mock
from app.schemas import GlossaryEntry
from app.services.terms import term_pattern

MODEL_ID = os.environ.get("PLAMO_MODEL", "pfnet/plamo-3-translate-2b")
MAX_NEW_TOKENS = int(os.environ.get("MAX_NEW_TOKENS", "1024"))
HISTORY_PAIRS = 1  # 履歴として渡す直前の段落数


def _mock_translate(text: str, target_lang: str, glossary: list[GlossaryEntry]) -> str:
    # 用語集の訳語が効いていることが画面で分かるよう、用語だけ置き換える
    out = text
    for g in glossary:
        out = term_pattern(g.term).sub(g.translation, out)
    return f"[{target_lang}] {out}"


def glossary_for(text: str, glossary: list[GlossaryEntry]) -> list[dict[str, str]]:
    """その段落に出てくる用語だけをモデルの glossary 形式にする（入力トークンを節約）。"""
    return [
        {"source": g.term, "target": g.translation}
        for g in glossary
        if term_pattern(g.term).search(text)
    ]


def build_messages(text: str, history: list[tuple[str, str]]) -> list[dict[str, str]]:
    messages = []
    for src, tgt in history:
        messages.append({"role": "user", "content": src})
        messages.append({"role": "assistant", "content": tgt})
    messages.append({"role": "user", "content": text})
    return messages


@lru_cache(maxsize=1)
def _load():
    """モデルを1回だけ読み込む。GPU 環境（Colab）でのみ呼ばれる。"""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    # モデルカードは BF16 対応 GPU を前提にしている。T4（BF16 非対応）は fp16 で動作を実測確認済み
    dtype = (
        "bfloat16" if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else "float16"
    )
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID, trust_remote_code=True, dtype=dtype, device_map="auto"
    )
    return tokenizer, model


def _generate(
    messages: list[dict[str, str]],
    target_lang: str,
    glossary: list[dict[str, str]] | None = None,
    context: str | None = None,
    max_new_tokens: int = MAX_NEW_TOKENS,
) -> str:
    tokenizer, model = _load()
    kwargs = {}
    if glossary:
        kwargs["glossary"] = glossary
    if context:
        kwargs["context"] = context
    inputs = tokenizer.apply_chat_template(
        messages,
        source_lang="en",
        target_lang=target_lang,
        add_generation_prompt=True,
        return_dict=True,
        return_tensors="pt",
        **kwargs,
    ).to(model.device)
    output = model.generate(**inputs, do_sample=False, max_new_tokens=max_new_tokens)
    return tokenizer.decode(
        output[0, inputs["input_ids"].shape[1] :], skip_special_tokens=True
    ).strip()


def translate_text(text: str, target_lang: str, context: str | None = None) -> str:
    """用語集・履歴なしで短いテキスト（用語単体など）を訳す。context は解釈の参考にする文。"""
    if is_mock():
        return f"〈{text}〉"
    return _generate(
        [{"role": "user", "content": text}], target_lang, context=context, max_new_tokens=32
    )


def translate_paragraph(
    text: str,
    target_lang: str,
    glossary: list[GlossaryEntry],
    history: list[tuple[str, str]] | None = None,
    context: str | None = None,
) -> str:
    if is_mock():
        return _mock_translate(text, target_lang, glossary)
    return _generate(
        build_messages(text, history or []),
        target_lang,
        glossary=glossary_for(text, glossary),
        context=context,
    )


def translate_paragraphs(
    paragraphs: list[str], target_lang: str, glossary: list[GlossaryEntry]
) -> list[str]:
    results: list[str] = []
    for i, p in enumerate(paragraphs):
        start = max(0, i - HISTORY_PAIRS)
        history = list(zip(paragraphs[start:i], results[start:i]))  # 直前の段落の原文と訳
        results.append(translate_paragraph(p, target_lang, glossary, history))
    return results
