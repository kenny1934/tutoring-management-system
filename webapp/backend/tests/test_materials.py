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
from services.material_http import close_material_client

KEY = "isolated-materials-key-at-least-32-characters"


@pytest.fixture
def client(monkeypatch):
    close_material_client()
    monkeypatch.setenv("CSM_MATERIALS_BRIDGE_KEY", KEY)
    monkeypatch.setenv("MCKB_API_URL", "https://knowledge.example.test")
    app = FastAPI()
    from services.material_timing import MaterialTimingMiddleware
    app.add_middleware(MaterialTimingMiddleware)
    app.include_router(materials.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(user_email="Tutor@Example.test")
    try:
        with TestClient(app) as browser:
            yield browser
    finally:
        close_material_client()


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


def test_missing_original_gives_an_opening_option_without_exposing_nas_details(client, monkeypatch):
    intercept(monkeypatch, lambda request: httpx.Response(404, json={"detail": "private NAS account or path"}))
    response = client.get('/api/materials/7/raw')
    assert response.status_code == 404
    assert 'connected folders' in response.json()['detail']
    assert 'private' not in response.text


def test_focused_preview_forwards_the_page_and_keeps_coverage(client, monkeypatch):
    def handler(request):
        assert json.loads(request.content) == {'file_id': 7, 'q': '4x^2-y^2', 'page': 16}
        return httpx.Response(200, json={'focused_page': 16, 'coverage': {'status': 'awaiting_ocr'}, 'chunks': []})
    intercept(monkeypatch, handler)
    response = client.get('/api/materials/7/preview', params={'q': '4x^2-y^2', 'page': 16})
    assert response.status_code == 200
    assert response.json()['coverage']['status'] == 'awaiting_ocr'
    assert client.get('/api/materials/7/preview?page=0').status_code == 422


def test_refinement_contract_keeps_search_and_preview_in_sync(client, monkeypatch):
    seen = []
    def handler(request):
        seen.append(json.loads(request.content))
        return httpx.Response(200, json={'results': [], 'total': 0, 'chunks': []})
    intercept(monkeypatch, handler)
    refine = {'match': 'any', 'exact_phrase': 'a term', 'search_in': 'content', 'modified_from': '2025-01-01', 'modified_to': '2025-12-31'}
    assert client.post('/api/materials/search', json={'q': 'fractions', 'refine': refine}).status_code == 200
    assert client.get('/api/materials/7/preview', params={'q': 'fractions', 'refine': json.dumps(refine), 'page': 16}).status_code == 200
    assert seen[0]['refine'] == seen[1]['refine']
    assert seen[0]['refine']['modified_from'] == '2025-01-01'
    assert seen[1]['page'] == 16


@pytest.mark.parametrize('refine', [{'match': 'wrong'}, {'search_in': 'director'}, {'modified_from': '2026-01-01', 'modified_to': '2025-01-01'}, {'any_words': 'x'*257}, {'email': 'other@example.test'}])
def test_refinements_are_validated_before_forwarding(client, refine):
    assert client.post('/api/materials/search', json={'q': 'algebra', 'refine': refine}).status_code == 422
    assert client.get('/api/materials/1/preview', params={'refine': json.dumps(refine)}).status_code == 422


def test_no_unbounded_empty_search(client, monkeypatch):
    intercept(monkeypatch, lambda request: httpx.Response(200, json={'results': []}))
    assert client.post('/api/materials/search', json={'q': '', 'refine': {'exclude_words': 'draft'}}).status_code == 422
    assert client.post('/api/materials/search', json={'q': '', 'refine': {'exact_phrase': 'a term'}}).status_code == 200


def test_word_limit_error_is_actionable_but_arbitrary_provider_messages_are_private(client, monkeypatch):
    detail = 'Use at most eight words in each word field. Put longer phrases in Exact phrase.'
    replies = iter([detail, 'private provider diagnostics'])
    intercept(monkeypatch, lambda request: httpx.Response(422, json={'detail': next(replies)}))
    assert client.post('/api/materials/search', json={'q': 'algebra', 'refine': {'exclude_words': 'many words'}}).json()['detail'] == detail
    assert 'private' not in client.get('/api/materials/1/preview').text


def test_drive_stripped_path_requires_one_accessible_exact_match(client, monkeypatch):
    seen = []
    def provider(action, payload, user):
        seen.append(payload["path"])
        assert action == "resolve"
        assert user.user_email == "Tutor@Example.test"
        if payload["path"].startswith("[Courseware Developer 中學]"):
            return {"file_id": 51, "filename": "Practice.pdf", "page_count": 3}
        raise materials.HTTPException(403 if payload["path"].startswith("[MSA Staff]") else 404)
    monkeypatch.setattr(materials, "request_materials", provider)
    response = client.post("/api/materials/resolve", json={"path": r"\Secondary\Practice.pdf"})
    assert response.status_code == 200
    assert response.json()["file_id"] == 51
    assert response.json()["nas_path"] == r"[Courseware Developer 中學]\Secondary\Practice.pdf"
    assert len(seen) == 3


def test_ambiguous_drive_stripped_path_is_not_guessed(client, monkeypatch):
    monkeypatch.setattr(materials, "request_materials", lambda *args: {"file_id": 7})
    assert client.post("/api/materials/resolve", json={"path": r"\Practice.pdf"}).status_code == 409


def test_drive_stripped_path_does_not_mask_provider_outage(client, monkeypatch):
    def provider(*args):
        raise materials.HTTPException(503)
    monkeypatch.setattr(materials, "request_materials", provider)
    assert client.post("/api/materials/resolve", json={"path": r"\Practice.pdf"}).status_code == 503


def test_drive_stripped_path_rejects_traversal_before_provider_lookup(client, monkeypatch):
    monkeypatch.setattr(materials, "request_materials", lambda *args: pytest.fail("Invalid path reached provider"))
    assert client.post("/api/materials/resolve", json={"path": r"\..\Practice.pdf"}).status_code == 404


def test_drive_stripped_path_preserves_access_denied_when_no_sources_are_available(client, monkeypatch):
    def provider(*args):
        raise materials.HTTPException(403)
    monkeypatch.setattr(materials, "request_materials", provider)
    assert client.post("/api/materials/resolve", json={"path": r"\Practice.pdf"}).status_code == 403


def test_provider_reuses_connections_without_forwarding_another_callers_cookie(client, monkeypatch):
    from services import material_http
    real_client = httpx.Client
    created = []
    seen = []

    def handler(request):
        seen.append((request.headers["X-CSM-Email"], request.headers.get("cookie")))
        return httpx.Response(200, json={"sources": []}, headers={"Set-Cookie": "session=private-provider-cookie; Path=/"})

    def factory(**kwargs):
        instance = real_client(transport=httpx.MockTransport(handler), **kwargs)
        created.append(instance)
        return instance

    monkeypatch.setattr(material_http.httpx, "Client", factory)
    materials.request_materials("sources", {}, SimpleNamespace(user_email="first@example.test"))
    materials.request_materials("sources", {}, SimpleNamespace(user_email="second@example.test"))
    assert len(created) == 1
    assert len(created[0].cookies) == 0
    assert seen == [("first@example.test", None), ("second@example.test", None)]
    close_material_client()
    assert created[0].is_closed


def test_provider_pool_closes_and_can_be_recreated(client, monkeypatch):
    from services.material_http import get_material_client
    intercept(monkeypatch, lambda request: httpx.Response(200, json={"sources": []}))
    first = get_material_client()
    close_material_client()
    second = get_material_client()
    assert first is not second and first.is_closed and not second.is_closed


def test_search_timings_separate_provider_and_search_without_private_data(client, monkeypatch):
    import re
    intercept(monkeypatch, lambda request: httpx.Response(200, json={"results": [], "took_ms": 1234}))
    response = client.post('/api/materials/search', json={"q": "private phrase"})
    header = response.headers['server-timing']
    metrics = dict(re.findall(r'(\w+);dur=([0-9.]+)', header))
    assert set(metrics) == {'csm_total', 'mckb_request', 'mckb_search'}
    assert float(metrics['mckb_search']) == 1234
    assert float(metrics['csm_total']) >= float(metrics['mckb_request'])
    assert 'private' not in header and 'example' not in header


def test_failed_search_still_reports_provider_time_and_next_request_is_independent(client, monkeypatch):
    intercept(monkeypatch, lambda request: httpx.Response(500) if request.url.path.endswith("/search") else httpx.Response(200, json={"sources": []}))
    failed = client.post('/api/materials/search', json={"q": "fractions"})
    assert failed.status_code == 503
    assert 'mckb_request;dur=' in failed.headers['server-timing']
    metadata = client.get('/api/materials/sources')
    assert metadata.status_code == 200
    assert 'mckb_search' not in metadata.headers['server-timing']


@pytest.mark.parametrize("duration", ["1234", -1, True, None])
def test_provider_timing_is_numeric_and_nonnegative(client, monkeypatch, duration):
    intercept(monkeypatch, lambda request: httpx.Response(200, json={"results": [], "took_ms": duration}))
    response = client.post('/api/materials/search', json={"q": "fractions"})
    assert response.status_code == 200
    assert 'mckb_search' not in response.headers['server-timing']


def test_folder_requests_keep_authenticated_identity_and_reject_extra_fields(client, monkeypatch):
    def handler(request):
        assert request.url.path.endswith('/materials/folders')
        assert request.headers['X-CSM-Email'] == 'tutor@example.test'
        assert json.loads(request.content) == {'share': 'center', 'folder': 'English/DSE', 'after': ''}
        return httpx.Response(200, json={'share': 'center', 'path': 'English/DSE', 'folders': [], 'next': None})
    intercept(monkeypatch, handler)
    assert client.post('/api/materials/folders', json={'share': 'center', 'folder': 'English/DSE'}).status_code == 200
    assert client.post('/api/materials/folders', json={'share': 'center', 'email': 'other@example.test'}).status_code == 422


def test_folder_browsing_can_use_an_empty_query_but_needs_source_and_folder(client, monkeypatch):
    intercept(monkeypatch, lambda request: httpx.Response(200, json={'results': [], 'total': 0}))
    assert client.post('/api/materials/search', json={'q': '', 'share': 'center', 'folder': 'English/DSE'}).status_code == 200
    assert client.post('/api/materials/search', json={'q': '', 'folder': 'English/DSE'}).status_code == 422
    assert client.post('/api/materials/search', json={'q': '', 'share': 'center'}).status_code == 422


def test_folder_aware_resolution_is_forwarded_only_when_requested(client, monkeypatch):
    seen = []
    def provider(action, payload, user):
        seen.append(payload)
        return {'kind': 'folder', 'share': 'center', 'folder': 'English/DSE'}
    monkeypatch.setattr(materials, 'request_materials', provider)
    response = client.post('/api/materials/resolve', json={'path': r'Z:\English\DSE', 'allow_folder': True})
    assert response.json() == {'kind': 'folder', 'share': 'center', 'folder': 'English/DSE'}
    assert seen == [{'path': r'Z:\English\DSE', 'allow_folder': True}]
    client.post('/api/materials/resolve', json={'path': r'Z:\English\Algebra.pdf'})
    assert 'allow_folder' not in seen[-1]
