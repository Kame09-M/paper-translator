"""環境変数による設定。MOCK=1 なら GPU・外部APIを使わずダミーで動く。"""

from __future__ import annotations

import os


def is_mock() -> bool:
    return os.environ.get("MOCK", "1") != "0"


def gemini_api_key(from_request: str | None = None) -> str | None:
    """Gemini の API キー。画面から送られたキーを優先し、無ければ環境変数 GEMINI_API_KEY。"""
    return from_request or os.environ.get("GEMINI_API_KEY") or None


def use_llm_mock(api_key: str | None = None) -> bool:
    """用語説明・要約（LLM API）をダミーにするか。MOCK=1 か API キーが無ければダミー。

    翻訳（GPU）と LLM API を別々に本物へ切り替えられるようにするため。
    """
    return is_mock() or gemini_api_key(api_key) is None
