"""論文の URL から PDF を取ってくる。（担当: 市川）

ブラウザからは CORS のため多くの論文サイトの PDF を直接取れない（arXiv 以外は許可していない）ので、
サーバーが代わりに取る。Colab のサーバーは公開 URL で誰でも呼べるため、次の安全策を入れる:
- http / https だけを受け付ける
- 社内・ローカルのアドレス（127.0.0.1, 10.x, 169.254.x など）には取りに行かない
  （リダイレクト先も確かめる）
- PDF（先頭が %PDF）以外と、大きすぎるファイルは断る
"""

from __future__ import annotations

import ipaddress
import re
import socket
import urllib.error
import urllib.request
from urllib.parse import urljoin, urlparse

MAX_BYTES = 50 * 1024 * 1024  # 50 MB
TIMEOUT = 30  # 秒
MAX_REDIRECTS = 5
USER_AGENT = "Mozilla/5.0 (compatible; paper-translator)"

ARXIV_RE = re.compile(
    r"^https?://(?:www\.|export\.)?arxiv\.org/(?:abs|pdf)/([^?#]+?)(?:\.pdf)?/?(?:[?#].*)?$",
    re.IGNORECASE,
)


class FetchError(Exception):
    """利用者に見せてよい理由つきの失敗。"""


def normalize_url(url: str) -> str:
    """論文ページの URL を PDF の URL にする（今は arXiv の /abs/ → /pdf/ だけ）。"""
    url = url.strip()
    m = ARXIV_RE.match(url)
    if m:
        return f"https://arxiv.org/pdf/{m.group(1)}"
    return url


def _check_public(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise FetchError("http:// か https:// で始まる URL を入力してください")
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or 0, proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        raise FetchError("サイトが見つかりませんでした。URL を確認してください") from e
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise FetchError("このアドレスからは取得できません")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """リダイレクトは自分で追う（行き先も _check_public で確かめるため）。"""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def _open(url: str):
    for _ in range(MAX_REDIRECTS + 1):
        _check_public(url)
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            return _opener.open(req, timeout=TIMEOUT)
        except urllib.error.HTTPError as e:
            location = e.headers.get("Location")
            if e.code in (301, 302, 303, 307, 308) and location:
                url = urljoin(url, location)
                continue
            if e.code in (401, 403):
                raise FetchError(
                    "このサイトは自動での取得を許可していません（ログインや購読が必要な場合もあります）"
                ) from e
            if e.code == 404:
                raise FetchError("ページが見つかりませんでした。URL を確認してください") from e
            raise FetchError(f"サイトからエラーが返りました（{e.code}）") from e
        except urllib.error.URLError as e:
            raise FetchError("サイトに接続できませんでした") from e
    raise FetchError("リダイレクトが多すぎます")


def fetch_pdf(url: str) -> tuple[bytes, str]:
    """URL の PDF を取ってきて (中身, ファイル名) を返す。PDF でなければ FetchError。"""
    url = normalize_url(url)
    with _open(url) as res:
        data = res.read(MAX_BYTES + 1)
        final_url = res.geturl()
    if len(data) > MAX_BYTES:
        raise FetchError("PDF が大きすぎます（50 MB まで）")
    if not data.startswith(b"%PDF"):
        raise FetchError(
            "この URL は PDF ではありませんでした。"
            "論文の PDF の URL か、arXiv の論文ページの URL を入力してください"
        )
    name = urlparse(final_url).path.rstrip("/").rsplit("/", 1)[-1] or "paper"
    if not name.lower().endswith(".pdf"):
        name += ".pdf"
    return data, name
