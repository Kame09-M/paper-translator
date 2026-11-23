"""URL から PDF を取る処理。ネットにはつながず、名前解決と通信を偽物に差し替えて確かめる。"""

from __future__ import annotations

import io
import socket
import urllib.error

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import fetch

client = TestClient(app)


@pytest.mark.parametrize(
    "url, expected",
    [
        ("https://arxiv.org/abs/1706.03762", "https://arxiv.org/pdf/1706.03762"),
        ("https://arxiv.org/abs/1706.03762v7", "https://arxiv.org/pdf/1706.03762v7"),
        ("http://arxiv.org/pdf/1706.03762.pdf", "https://arxiv.org/pdf/1706.03762"),
        ("https://www.arxiv.org/abs/2301.00001/", "https://arxiv.org/pdf/2301.00001"),
        ("https://arxiv.org/abs/cs/0112017", "https://arxiv.org/pdf/cs/0112017"),
        ("  https://example.com/paper.pdf ", "https://example.com/paper.pdf"),
    ],
)
def test_normalize_url(url, expected):
    assert fetch.normalize_url(url) == expected


def fake_dns(ip: str):
    def getaddrinfo(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443))]

    return getaddrinfo


class FakeResponse(io.BytesIO):
    def __init__(self, data: bytes, url: str):
        super().__init__(data)
        self._url = url

    def geturl(self):
        return self._url


@pytest.fixture
def public_site(monkeypatch):
    """名前解決は公開アドレスを返し、通信は opened に積んだ応答を順に返す。"""
    monkeypatch.setattr(fetch.socket, "getaddrinfo", fake_dns("93.184.216.34"))
    responses = []

    def open_(req, timeout):
        r = responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r

    monkeypatch.setattr(fetch._opener, "open", open_)
    return responses


@pytest.mark.parametrize("ip", ["127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "::1"])
def test_rejects_private_addresses(monkeypatch, ip):
    monkeypatch.setattr(fetch.socket, "getaddrinfo", fake_dns(ip))
    with pytest.raises(fetch.FetchError):
        fetch.fetch_pdf("https://internal.example/paper.pdf")


@pytest.mark.parametrize("url", ["file:///etc/passwd", "ftp://example.com/a.pdf", "not a url"])
def test_rejects_non_http(url):
    with pytest.raises(fetch.FetchError):
        fetch.fetch_pdf(url)


def test_fetches_pdf_and_names_file(public_site, sample_pdf):
    public_site.append(FakeResponse(sample_pdf, "https://arxiv.org/pdf/1706.03762"))
    data, name = fetch.fetch_pdf("https://arxiv.org/abs/1706.03762")
    assert data == sample_pdf
    assert name == "1706.03762.pdf"


def test_rejects_html(public_site):
    public_site.append(FakeResponse(b"<html>login</html>", "https://example.com/paper"))
    with pytest.raises(fetch.FetchError, match="PDF ではありません"):
        fetch.fetch_pdf("https://example.com/paper")


def test_rejects_too_large(public_site, monkeypatch):
    monkeypatch.setattr(fetch, "MAX_BYTES", 10)
    public_site.append(FakeResponse(b"%PDF-" + b"x" * 20, "https://example.com/a.pdf"))
    with pytest.raises(fetch.FetchError, match="大きすぎ"):
        fetch.fetch_pdf("https://example.com/a.pdf")


def test_does_not_follow_redirect_to_private_address(public_site, monkeypatch):
    redirect = urllib.error.HTTPError(
        "https://example.com/a.pdf", 302, "Found", {"Location": "http://169.254.169.254/"}, None
    )
    public_site.append(redirect)
    calls = []

    def dns(host, port, *args, **kwargs):
        calls.append(host)
        ip = "169.254.169.254" if host == "169.254.169.254" else "93.184.216.34"
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 80))]

    monkeypatch.setattr(fetch.socket, "getaddrinfo", dns)
    with pytest.raises(fetch.FetchError, match="取得できません"):
        fetch.fetch_pdf("https://example.com/a.pdf")
    assert calls == ["example.com", "169.254.169.254"]


def test_forbidden_site_has_friendly_message(public_site):
    error = urllib.error.HTTPError("https://example.com/a.pdf", 403, "Forbidden", {}, None)
    public_site.append(error)
    with pytest.raises(fetch.FetchError, match="許可していません"):
        fetch.fetch_pdf("https://example.com/a.pdf")


def test_endpoint_returns_pdf(monkeypatch, sample_pdf):
    monkeypatch.setattr(fetch, "fetch_pdf", lambda url: (sample_pdf, "1706.03762.pdf"))
    res = client.get("/api/fetch-pdf", params={"url": "https://arxiv.org/abs/1706.03762"})
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert res.headers["x-filename"] == "1706.03762.pdf"
    assert res.content == sample_pdf


def test_endpoint_reports_fetch_error(monkeypatch):
    def fail(url):
        raise fetch.FetchError("このアドレスからは取得できません")

    monkeypatch.setattr(fetch, "fetch_pdf", fail)
    res = client.get("/api/fetch-pdf", params={"url": "http://127.0.0.1/"})
    assert res.status_code == 400
    assert res.json()["detail"] == "このアドレスからは取得できません"
