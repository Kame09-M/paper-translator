"""読み手が選んだ語の、その論文での意味を説明する。（担当: 市川）

根拠として、その語が出てくる段落（原文。あれば訳も）を画面から受け取る。
"""

from __future__ import annotations

from app.config import use_llm_mock
from app.services import llm
from app.services.summarize import LANG_NAMES

SYSTEM = """あなたは学術論文の読解を助ける専門家です。
読み手が論文中で分からなかった語について、その語が「この論文で」何を意味しているかを説明してください。
- 渡された段落を根拠にし、一般的な意味よりこの論文での使われ方を優先する
- 段落から分からないことは推測せず、分からないと書く
- {lang} で、2〜4文で書く。前置きや見出しは書かない"""


def explain_term(term: str, target_lang: str, contexts: list[str]) -> str:
    if use_llm_mock():
        return f"（ダミー説明）「{term}」は本文中で {len(contexts)} 段落に出てくる語です。"
    system = SYSTEM.format(lang=LANG_NAMES.get(target_lang, target_lang))
    passages = "\n\n".join(f"段落{i + 1}:\n{c}" for i, c in enumerate(contexts)) or "（なし）"
    user = f"分からなかった語: {term}\n\nこの語が出てくる段落:\n{passages}"
    return llm.generate(system, user, max_tokens=1024)
