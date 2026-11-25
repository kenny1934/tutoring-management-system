"""Authenticated, read-only proxy to the Knowledge Base material provider."""
import hashlib
import hmac
import json
import os
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from starlette.background import BackgroundTask
from starlette.responses import StreamingResponse
from urllib.parse import quote
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from services.material_refinements import SearchRefinement

from auth.dependencies import get_current_user
from models import Tutor

router = APIRouter(prefix="/materials")


def request_materials(action: str, payload: dict, user: Tutor):
    base = os.getenv("MCKB_API_URL", "").rstrip("/")
    key = os.getenv("CSM_MATERIALS_BRIDGE_KEY", "")
    if not base or len(key) < 32:
        raise HTTPException(503, "Courseware search is not connected yet.")
    # The email is resolved by CSM authentication, never accepted from the browser.
    email = user.user_email.strip().lower()
    path = f"/api/integrations/csm/materials/{action}"
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    timestamp = str(int(time.time()))
    message = "\n".join(("csm-materials-v1", timestamp, email, "POST", path, hashlib.sha256(body).hexdigest()))
    headers = {"Content-Type": "application/json", "Accept-Encoding": "identity", "X-CSM-Email": email, "X-CSM-Timestamp": timestamp,
               "X-CSM-Signature": hmac.new(key.encode(), message.encode(), hashlib.sha256).hexdigest()}
    try:
        with httpx.Client(timeout=httpx.Timeout(20, connect=5), follow_redirects=False) as client:
            response = client.post(base + path, content=body, headers=headers)
    except httpx.HTTPError:
        raise HTTPException(503, "Courseware search is temporarily unavailable.") from None
    if response.status_code == 403:
        raise HTTPException(403, "Your Knowledge Base account needs access to this material source. Ask an administrator.")
    if response.status_code == 404 and action in ("preview", "resolve"):
        raise HTTPException(404, "This material is no longer available.")
    if response.status_code == 422:
        try:
            detail = response.json().get("detail")
        except (ValueError, AttributeError):
            detail = None
        if detail == "Use at most eight words in each word field. Put longer phrases in Exact phrase.":
            raise HTTPException(422, detail)
        raise HTTPException(422, "Choose a page within this document." if action == "preview" else "Check the courseware search filters.")
    if not response.is_success:
        raise HTTPException(503, "Courseware search is temporarily unavailable.")
    try:
        return response.json()
    except ValueError:
        raise HTTPException(503, "Courseware search returned an invalid response.") from None


class MaterialSearch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    q: str = Field(default="", max_length=256)
    refine: SearchRefinement | None = None
    share: str | None = None
    ext: str | None = Field(default=None, max_length=16)
    folder: str | None = Field(default=None, max_length=512)
    modified: str | None = None
    sort: str = "relevance"
    page: int = Field(default=1, ge=1, le=1000)
    page_size: int = Field(default=20, ge=1, le=50)


@router.get("/sources")
def sources(user: Tutor = Depends(get_current_user)):
    return request_materials("sources", {}, user)


@router.post("/search")
def search(data: MaterialSearch, user: Tutor = Depends(get_current_user)):
    if not data.q.strip() and not (data.refine and (data.refine.any_words.strip() or data.refine.exact_phrase.strip())):
        raise HTTPException(422, "Enter some words or an exact phrase to search for.")
    return request_materials("search", data.model_dump(mode="json", exclude_none=True), user)


@router.get("/{file_id}/preview")
def preview(file_id: int, q: str = Query(default="", max_length=256), page: int | None = Query(default=None, ge=1, le=100000), refine: str | None = Query(default=None, max_length=2048), user: Tutor = Depends(get_current_user)):
    if file_id <= 0:
        raise HTTPException(404, "This material is no longer available.")
    options = {}
    if refine is not None:
        try:
            options["refine"] = SearchRefinement.model_validate_json(refine).model_dump(mode="json", exclude_none=True)
        except (ValidationError, ValueError):
            raise HTTPException(422, "Check the courseware search filters.") from None
    return request_materials("preview", {"file_id": file_id, "q": q, **({"page": page} if page is not None else {}), **options}, user)


@router.get("/{file_id}/raw")
def original(file_id: int, request: Request, download: bool = False, user: Tutor = Depends(get_current_user)):
    base = os.getenv("MCKB_API_URL", "").rstrip("/")
    key = os.getenv("CSM_MATERIALS_BRIDGE_KEY", "")
    if not base or len(key) < 32:
        raise HTTPException(503, "Courseware search is not connected yet.")
    if file_id <= 0:
        raise HTTPException(404, "The original PDF is unavailable. Try opening through connected folders.")
    byte_range = request.headers.get("range")
    import re
    if byte_range and (len(byte_range) > 100 or not re.fullmatch(r"bytes=(?:[0-9]+-[0-9]*|-[0-9]+)", byte_range)):
        raise HTTPException(416, "Choose a single byte range.")
    path = "/api/integrations/csm/materials/original"
    body = json.dumps({"file_id": file_id, "range": byte_range}, separators=(",", ":")).encode()
    email = user.user_email.strip().lower()
    timestamp = str(int(time.time()))
    message = "\n".join(("csm-materials-v1", timestamp, email, "POST", path, hashlib.sha256(body).hexdigest()))
    headers = {"Content-Type": "application/json", "Accept-Encoding": "identity", "X-CSM-Email": email, "X-CSM-Timestamp": timestamp,
        "X-CSM-Signature": hmac.new(key.encode(), message.encode(), hashlib.sha256).hexdigest()}
    client = httpx.Client(timeout=httpx.Timeout(65, connect=5), follow_redirects=False)
    try:
        response = client.send(client.build_request("POST", base+path, content=body, headers=headers), stream=True)
    except httpx.HTTPError:
        client.close()
        raise HTTPException(503, "The original PDF service is temporarily unavailable.") from None
    def close():
        response.close()
        client.close()
    if response.status_code not in (200, 206) or response.headers.get("content-type", "").split(";")[0] != "application/pdf":
        status = response.status_code
        close()
        messages = {403: "Your Knowledge Base account needs access to this courseware.", 404: "The original PDF is unavailable. Try opening through connected folders.",
            409: "The original has changed. It needs reindexing before opening.", 415: "Original preview supports PDFs only.",
            416: "Requested data is outside this PDF."}
        raise HTTPException(status if status in messages else 503, messages.get(status, "The office PDF gateway is offline or not connected."))
    def chunks():
        try:
            yield from response.iter_bytes(128 * 1024)
        finally:
            close()
    forwarded = {key: response.headers[key] for key in ("content-length", "content-range", "accept-ranges", "etag", "content-disposition") if key in response.headers}
    if download:
        forwarded["content-disposition"] = re.sub(r"^[^;]+", "attachment", response.headers.get("content-disposition", f"inline; filename*=UTF-8''{quote(f'material-{file_id}.pdf')}"))
    forwarded["Cache-Control"] = "private, no-store"
    forwarded["Content-Encoding"] = "identity"
    forwarded["X-Content-Type-Options"] = "nosniff"
    return StreamingResponse(chunks(), status_code=response.status_code, media_type="application/pdf", headers=forwarded, background=BackgroundTask(close))


class ResolveMaterial(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str = Field(min_length=1, max_length=2048)


@router.post("/resolve")
def resolve(data: ResolveMaterial, user: Tutor = Depends(get_current_user)):
    return request_materials("resolve", {"path": data.path}, user)
