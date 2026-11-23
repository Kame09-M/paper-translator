"""LLM API（Gemini）の呼び出し。要約と用語説明から使う。

google-genai の使い方（PyPI の README・AI Studio のドキュメントで 2026-11 確認）:
- キーは画面から送られたもの（なければ環境変数 GEMINI_API_KEY）を `genai.Client(api_key=...)` に渡す
- `client.models.generate_content(model, contents, config=GenerateContentConfig(system_instruction,
  max_output_tokens))` → `.text`。新しい interactions API もあるが、Python 3.9 で入る版（1.47）には
  無いので、両方の版にある generate_content を使う
- モデルは環境変数 GEMINI_MODEL（既定 gemini-3.5-flash-lite。Stable、無料枠あり）。
  上限の数字は公式ドキュメントになく AI Studio で確認する（docs/DESIGN.md）
"""

from __future__ import annotations

import os
from functools import lru_cache

from app.config import gemini_api_key

MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")


@lru_cache(maxsize=4)
def _client(api_key: str):
    from google import genai

    return genai.Client(api_key=api_key)


def generate(system: str, user: str, max_tokens: int, api_key: str | None = None) -> str:
    from google.genai import types

    response = _client(gemini_api_key(api_key)).models.generate_content(
        model=MODEL,
        contents=user,
        config=types.GenerateContentConfig(system_instruction=system, max_output_tokens=max_tokens),
    )
    return (response.text or "").strip()
