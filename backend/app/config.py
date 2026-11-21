"""環境変数による設定。MOCK=1 なら GPU・外部APIを使わずダミーで動く。"""

from __future__ import annotations

import os


def is_mock() -> bool:
    return os.environ.get("MOCK", "1") != "0"


def gemini_api_key() -> str | None:
    return os.environ.get("GEMINI_API_KEY") or None


def use_llm_mock() -> bool:
    """用語説明・要約（LLM API）をダミーにするか。MOCK=1 か API キー未設定ならダミー。

    翻訳（GPU）と LLM API を別々に本物へ切り替えられるようにするため。
    """
    return is_mock() or gemini_api_key() is None
