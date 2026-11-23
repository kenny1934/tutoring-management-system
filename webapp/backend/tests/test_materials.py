"""Provider checks use only an isolated router and mocked HTTP."""
import hashlib
import hmac
import json
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from auth.dependencies import get_current_user
from routers import materials

KEY = "isolated-materials-key-at-least-32-characters"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("CSM_MATERIALS_BRIDGE_KEY", KEY)
    monkeypatch.setenv("MCKB_API_URL", "https://knowledge.example.test")
    app = FastAPI()
    app.include_router(materials.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(user_email="Tutor@Example.test")
    with TestClient(app) as browser:
        yield browser


def intercept(monkeypatch, handler):
    real_client = httpx.Client
    monkeypatch.setattr(materials.httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))


def test_proxy_binds_authenticated_email_path_and_body(client, monkeypatch):
    def handler(request):
        assert request.headers["X-CSM-Email"] == "tutor@example.test"
        message = "\n".join(("csm-materials-v1", request.headers["X-CSM-Timestamp"], "tutor@example.test", "POST", request.url.path, hashlib.sha256(request.content).hexdigest()))
        assert request.headers["X-CSM-Signature"] == hmac.new(KEY.encode(), message.encode(), hashlib.sha256).hexdigest()
        assert json.loads(request.content)["q"] == "分數"
        return httpx.Response(200, json={"results": [], "total": 0})
    intercept(monkeypatch, handler)
    assert client.post("/api/materials/search", json={"q": "分數"}).status_code == 200


def test_browser_cannot_override_identity(client):
    assert client.post("/api/materials/search", json={"q": "fractions", "email": "owner@example.test"}).status_code == 422


@pytest.mark.parametrize("status,expected", [(401, 503), (403, 403), (500, 503), (302, 503)])
def test_upstream_failure_does_not_expose_response(client, monkeypatch, status, expected):
    intercept(monkeypatch, lambda request: httpx.Response(status, text="private upstream diagnostics"))
    response = client.get("/api/materials/sources")
    assert response.status_code == expected
    assert "private" not in response.text


def test_unconfigured_provider_is_actionable(client, monkeypatch):
    monkeypatch.delenv("MCKB_API_URL")
    response = client.get("/api/materials/sources")
    assert response.status_code == 503
    assert "not connected" in response.json()["detail"]


def test_original_proxy_preserves_pdf_range_without_exposing_upstream_credentials(client, monkeypatch):
    def handler(request):
        assert json.loads(request.content) == {'file_id': 7, 'range': 'bytes=0-4'}
        return httpx.Response(206, content=b'%PDF-', headers={'Content-Type': 'application/pdf', 'Content-Range': 'bytes 0-4/100', 'Accept-Ranges': 'bytes', 'Content-Disposition': "inline; filename*=UTF-8''worksheet.pdf"})
    intercept(monkeypatch, handler)
    response = client.get('/api/materials/7/raw', headers={'Range': 'bytes=0-4'})
    assert response.status_code == 206 and response.content == b'%PDF-'
    assert response.headers['content-range'] == 'bytes 0-4/100'
    assert response.headers['cache-control'] == 'private, no-store'
    assert 'x-csm-signature' not in response.headers
    assert client.get('/api/materials/7/raw', headers={'Range': 'bytes=0-4,9-10'}).status_code == 416
