"""環境変数による設定。MOCK=1 なら GPU・外部APIを使わずダミーで動く。"""

from __future__ import annotations

import os


def is_mock() -> bool:
    return os.environ.get("MOCK", "1") != "0"


def gemini_api_key() -> str | None:
    return os.environ.get("GEMINI_API_KEY") or None
