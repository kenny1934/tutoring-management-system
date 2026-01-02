"""
Paperless-ngx API proxy endpoints.
Provides search and thumbnail proxy for Paperless-ngx document management system.
"""
import os
import re
import time
import logging
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Query, Path
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Literal
import httpx

router = APIRouter()
logger = logging.getLogger(__name__)

# Configuration from environment
PAPERLESS_URL = os.getenv("PAPERLESS_URL", "")
PAPERLESS_TOKEN = os.getenv("PAPERLESS_TOKEN", "")

# Cache for tag names with TTL
_tag_cache: Dict[int, str] = {}
_tag_cache_expiry: float = 0
TAG_CACHE_TTL = 3600  # 1 hour

# Rate limiting: 100 requests per minute per endpoint
_request_counts: Dict[str, List[float]] = defaultdict(list)
RATE_LIMIT = 100
RATE_WINDOW = 60  # seconds


def check_rate_limit(endpoint: str) -> None:
    """Simple rate limiter - raises 429 if exceeded"""
    now = time.time()
    # Clean old entries outside the window
    _request_counts[endpoint] = [t for t in _request_counts[endpoint] if now - t < RATE_WINDOW]

    if len(_request_counts[endpoint]) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Try again later.")

    _request_counts[endpoint].append(now)


def get_paperless_headers() -> dict:
    """Get authorization headers for Paperless-ngx API"""
    if not PAPERLESS_TOKEN:
        raise HTTPException(status_code=503, detail="Paperless-ngx not configured")
    return {"Authorization": f"Token {PAPERLESS_TOKEN}"}


async def load_tag_cache(client: httpx.AsyncClient) -> None:
    """Load tag definitions from Paperless-ngx into cache with TTL"""
    global _tag_cache, _tag_cache_expiry

    # Check if cache is still valid
    if time.time() < _tag_cache_expiry:
        return

    try:
        response = await client.get(
            f"{PAPERLESS_URL}/api/tags/",
            params={"page_size": 1000},  # Get all tags
            headers=get_paperless_headers()
        )

        if response.status_code == 200:
            data = response.json()
            _tag_cache.clear()
            for tag in data.get("results", []):
                _tag_cache[tag["id"]] = tag["name"]
            _tag_cache_expiry = time.time() + TAG_CACHE_TTL
            logger.debug(f"Tag cache refreshed with {len(_tag_cache)} tags")
    except Exception as e:
        logger.warning(f"Failed to load tag cache: {e}")


def get_tag_names(tag_ids: List[int]) -> List[str]:
    """Convert tag IDs to names using cache"""
    return [_tag_cache.get(tid, str(tid)) for tid in tag_ids]


def convert_nas_path_to_alias(path: str) -> str:
    """
    Convert NAS UNC path to alias format.
    \\\\mmsa\\MSA Staff\\scan\\file.pdf -> [MSA Staff]\\scan\\file.pdf
    """
    if not path:
        return path

    # Match \\server\share\rest or \\\\server\\share\\rest (escaped backslashes)
    match = re.match(r'^\\\\[^\\]+\\([^\\]+)\\(.*)$', path)
    if match:
        share_name = match.group(1)  # e.g., "MSA Staff"
        rest_of_path = match.group(2)  # e.g., "scan\\file.pdf"
        return f"[{share_name}]\\{rest_of_path}"

    return path  # Return as-is if doesn't match pattern


def extract_custom_field(document: dict, field_name: str) -> Optional[str]:
    """Extract a custom field value from a Paperless document"""
    custom_fields = document.get("custom_fields", [])
    for field in custom_fields:
        # Custom fields can be structured as {field: id, value: ...} or {name: ..., value: ...}
        # We need to check the field definition to know which one
        if isinstance(field, dict):
            # Try to match by field name if available
            if field.get("name") == field_name:
                return field.get("value")
            # Also check the value directly for simple cases
            if "value" in field and isinstance(field.get("value"), str):
                # This might be the original_path field
                value = field.get("value")
                if "\\" in value or "/" in value:  # Looks like a path
                    return value
    return None


class DocumentResult(BaseModel):
    id: int
    title: str
    original_path: Optional[str] = None
    converted_path: Optional[str] = None
    tags: List[str] = []
    created: Optional[str] = None
    correspondent: Optional[str] = None


class SearchResponse(BaseModel):
    results: List[DocumentResult]
    count: int
    has_more: bool = False


@router.get("/paperless/search", response_model=SearchResponse)
async def search_documents(
    query: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    search_mode: Literal["all", "title", "content", "advanced"] = Query("all", description="Search mode"),
    tag_ids: Optional[str] = Query(None, description="Comma-separated tag IDs to filter by"),
    tag_match_mode: Literal["all", "any"] = Query("all", description="Tag matching: 'all' (AND) or 'any' (OR)")
):
    """
    Search Paperless-ngx for documents and return results with converted paths.

    Search modes:
    - all: Search in title and content (default)
    - title: Search only in document titles
    - content: Search only in document content
    - advanced: Pass query directly to Paperless (Whoosh syntax)

    Tag matching:
    - all: Document must have ALL selected tags (AND)
    - any: Document must have ANY of the selected tags (OR)
    """
    check_rate_limit("search")

    if not PAPERLESS_URL:
        raise HTTPException(status_code=503, detail="Paperless-ngx URL not configured")

    # Build the search query based on mode
    if search_mode == "title":
        search_query = f"title:{query}"
    elif search_mode == "content":
        search_query = f"content:{query}"
    elif search_mode == "advanced":
        search_query = query  # Pass through as-is for Whoosh syntax
    else:
        search_query = query  # Default: search all

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Load tag cache first
            await load_tag_cache(client)

            # Build search params - request one extra to check for more results
            # Paperless uses page/page_size, so calculate page from offset
            page = (offset // limit) + 1
            search_params = {"query": search_query, "page_size": limit, "page": page}

            # Add tag filtering if specified
            if tag_ids:
                # Parse comma-separated tag IDs with validation
                try:
                    tag_id_list = [int(tid.strip()) for tid in tag_ids.split(",") if tid.strip()]
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid tag IDs format - must be comma-separated integers")
                if tag_id_list:
                    if tag_match_mode == "all":
                        # AND: Must have ALL selected tags
                        search_params["tags__id__all"] = ",".join(str(tid) for tid in tag_id_list)
                    else:
                        # OR: Must have ANY of selected tags
                        search_params["tags__id__in"] = ",".join(str(tid) for tid in tag_id_list)

            # Search documents
            response = await client.get(
                f"{PAPERLESS_URL}/api/documents/",
                params=search_params,
                headers=get_paperless_headers()
            )

            if response.status_code == 401:
                raise HTTPException(status_code=401, detail="Paperless-ngx authentication failed")

            if response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"Paperless-ngx returned status {response.status_code}"
                )

            data = response.json()

            # Also need to fetch custom field definitions to know field names
            # But for now, we'll try to extract paths from custom_fields directly

            results = []
            for doc in data.get("results", []):
                # Try to get original_path from custom fields
                original_path = None
                custom_fields = doc.get("custom_fields", [])

                # Custom fields in Paperless are returned as list of {field: id, value: ...}
                # We need to find the one with our original_path field
                for cf in custom_fields:
                    if isinstance(cf, dict) and "value" in cf:
                        value = cf.get("value")
                        # Check if this looks like a file path
                        if isinstance(value, str) and ("\\" in value or value.startswith("//")):
                            original_path = value
                            break

                # Get tag names from cache
                tag_ids = doc.get("tags", [])
                tag_names = get_tag_names(tag_ids)

                results.append(DocumentResult(
                    id=doc["id"],
                    title=doc.get("title", "Untitled"),
                    original_path=original_path,
                    converted_path=convert_nas_path_to_alias(original_path) if original_path else None,
                    tags=tag_names,
                    created=doc.get("created"),
                    correspondent=None  # Would need another lookup
                ))

            total_count = data.get("count", len(results))
            # Check if there are more results beyond current page
            has_more = (offset + len(results)) < total_count

            return SearchResponse(
                results=results,
                count=total_count,
                has_more=has_more
            )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Paperless-ngx request timed out")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Cannot reach Paperless-ngx: {str(e)}")


class TagInfo(BaseModel):
    id: int
    name: str


class TagsResponse(BaseModel):
    tags: List[TagInfo]


@router.get("/paperless/tags", response_model=TagsResponse)
async def get_tags():
    """
    Get all available tags from Paperless-ngx.
    Returns a list of tag IDs and names for filtering.
    """
    if not PAPERLESS_URL:
        raise HTTPException(status_code=503, detail="Paperless-ngx URL not configured")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{PAPERLESS_URL}/api/tags/",
                params={"page_size": 1000},  # Get all tags
                headers=get_paperless_headers()
            )

            if response.status_code == 401:
                raise HTTPException(status_code=401, detail="Paperless-ngx authentication failed")

            if response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"Paperless-ngx returned status {response.status_code}"
                )

            data = response.json()
            tags = [
                TagInfo(id=tag["id"], name=tag["name"])
                for tag in data.get("results", [])
            ]

            return TagsResponse(tags=tags)

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Paperless-ngx request timed out")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Cannot reach Paperless-ngx: {str(e)}")


@router.get("/paperless/thumbnail/{document_id}")
async def get_thumbnail(document_id: int = Path(..., gt=0, description="Document ID")):
    """
    Proxy thumbnail image from Paperless-ngx.
    Returns the PNG thumbnail of the document.
    """
    check_rate_limit("thumbnail")

    if not PAPERLESS_URL:
        raise HTTPException(status_code=503, detail="Paperless-ngx URL not configured")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{PAPERLESS_URL}/api/documents/{document_id}/thumb/",
                headers=get_paperless_headers()
            )

            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="Document not found")

            if response.status_code == 401:
                raise HTTPException(status_code=401, detail="Paperless-ngx authentication failed")

            if response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"Paperless-ngx returned status {response.status_code}"
                )

            # Return the image with proper content type
            content_type = response.headers.get("content-type", "image/png")
            return Response(
                content=response.content,
                media_type=content_type,
                headers={"Cache-Control": "public, max-age=3600"}  # Cache for 1 hour
            )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Paperless-ngx request timed out")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Cannot reach Paperless-ngx: {str(e)}")


@router.get("/paperless/preview/{document_id}")
async def get_preview(document_id: int = Path(..., gt=0, description="Document ID")):
    """
    Proxy full PDF preview from Paperless-ngx.
    Returns the PDF document for inline viewing.
    """
    check_rate_limit("preview")

    if not PAPERLESS_URL:
        raise HTTPException(status_code=503, detail="Paperless-ngx URL not configured")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(
                f"{PAPERLESS_URL}/api/documents/{document_id}/preview/",
                headers=get_paperless_headers()
            )

            if response.status_code == 404:
                raise HTTPException(status_code=404, detail="Document not found")

            if response.status_code == 401:
                raise HTTPException(status_code=401, detail="Paperless-ngx authentication failed")

            if response.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"Paperless-ngx returned status {response.status_code}"
                )

            # Return the PDF with proper content type for inline viewing
            content_type = response.headers.get("content-type", "application/pdf")
            return Response(
                content=response.content,
                media_type=content_type,
                headers={
                    "Content-Disposition": "inline",
                    "Cache-Control": "public, max-age=3600"
                }
            )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Paperless-ngx request timed out")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Cannot reach Paperless-ngx: {str(e)}")


@router.get("/paperless/status")
async def check_paperless_status():
    """
    Check if Paperless-ngx is configured and reachable.
    """
    if not PAPERLESS_URL:
        return {"configured": False, "reachable": False, "error": "PAPERLESS_URL not set"}

    if not PAPERLESS_TOKEN:
        return {"configured": False, "reachable": False, "error": "PAPERLESS_TOKEN not set"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{PAPERLESS_URL}/api/",
                headers=get_paperless_headers()
            )

            if response.status_code == 200:
                return {"configured": True, "reachable": True, "url": PAPERLESS_URL}
            elif response.status_code == 401:
                return {"configured": True, "reachable": True, "error": "Invalid token"}
            else:
                return {"configured": True, "reachable": True, "error": f"Status {response.status_code}"}

    except httpx.RequestError as e:
        return {"configured": True, "reachable": False, "error": str(e)}
