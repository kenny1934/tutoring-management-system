"""Tests for the summer courseware scan/index endpoints."""

import pytest
from fastapi.testclient import TestClient

from main import app
from models import SummerCoursewareFile, SummerCoursewareScan, Tutor
from auth.dependencies import get_current_user
from tests.helpers import make_auth_token

# A valid cookie is required to clear the AuthGate middleware (which checks the
# JWT directly, independent of dependency overrides). The override below then
# drives which role the handler sees.
AUTH_COOKIE = {"access_token": make_auth_token(99)}

CHAPTER = "F1/SM701 有理數 Directed Numbers"
LISTING = [
    {"path": f"{CHAPTER}/SM_701_Directed_Numbers_C_e.pdf", "mtime_ms": 1720000000000},
    {"path": f"{CHAPTER}/SM_701_有理數_C_c.pdf"},
    {"path": f"{CHAPTER}/SM_701_Directed_Numbers_H_e.pdf"},
    {"path": f"{CHAPTER}/SM_701_有理數_H_c.pdf"},
    {"path": f"{CHAPTER}/Ans/SM_701_有理數_C_c_ans.pdf"},
    {"path": f"{CHAPTER}/Extra/SM_701_有理數_Extra_c.pdf"},
    {"path": f"{CHAPTER}/Parallel Version/Parallel-SM_701_有理數_C.pdf"},
    {"path": f"{CHAPTER}/Drafts/SM_701_有理數_C_c.pdf"},  # unknown subfolder
    {"path": f"{CHAPTER}/Raw/SM_701_有理數_C_c.pdf"},  # working folder
    {"path": "F4/SMSS05 集合與常用邏輯用語/SMSS05集合和常用邏輯用語.pdf"},  # skipped grade
]


def _as_role(role: str) -> Tutor:
    return Tutor(id=99, user_email="me@example.com", tutor_name="Me", role=role,
                 is_active_tutor=True)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _override_role(role: str):
    app.dependency_overrides[get_current_user] = lambda: _as_role(role)


def _scan(client, year=2026, files=LISTING, **extra):
    return client.post(
        "/api/summer/courseware/scan",
        json={"year": year, "root_name": "Finalised", "files": files, **extra},
        cookies=AUTH_COOKIE,
    )


def test_scan_requires_admin_write(client: TestClient):
    _override_role("Tutor")
    resp = _scan(client)
    assert resp.status_code == 403


def test_scan_classifies_and_accounts(client: TestClient):
    _override_role("Admin")
    resp = _scan(client)
    assert resp.status_code == 200
    data = resp.json()
    scan = data["scan"]
    assert scan["classified_count"] == 7
    assert scan["unclassified_count"] == 1
    assert scan["excluded_count"] == 1
    assert scan["skipped_grade_count"] == 1
    assert scan["total_files"] == 10
    assert scan["scanned_by"] == "me@example.com"
    # Default path prefix derives from year + picked folder name.
    assert scan["path_prefix"] == (
        "[Courseware Developer 中學]\\Secondary\\Summer Course\\2026 Summer\\Finalised"
    )

    assert len(data["files"]) == 7
    assert len(data["unclassified"]) == 1
    assert "Unexpected subfolder" in data["unclassified"][0]["unclassified_reason"]

    cw_e = next(f for f in data["files"] if f["doc_type"] == "CW"
                and f["lang"] == "e" and not f["is_answer"])
    assert cw_e["grade"] == "F1"
    assert cw_e["course_code"] == "701"
    assert cw_e["lesson_number"] == 1
    assert cw_e["topic_zh"] == "有理數"
    assert cw_e["topic_en"] == "Directed Numbers"
    assert cw_e["rel_path"] == f"{CHAPTER}\\SM_701_Directed_Numbers_C_e.pdf".replace("/", "\\")
    assert cw_e["file_mtime"] is not None  # converted from mtime_ms


def test_rescan_replaces_year_without_duplicates(client: TestClient, db_session):
    _override_role("Admin")
    assert _scan(client).status_code == 200
    resp = _scan(client, files=LISTING[:4])
    assert resp.status_code == 200
    assert len(resp.json()["files"]) == 4
    assert db_session.query(SummerCoursewareFile).count() == 4
    # Scan history is kept.
    assert db_session.query(SummerCoursewareScan).count() == 2


def test_rescan_leaves_other_years_untouched(client: TestClient, db_session):
    _override_role("Admin")
    assert _scan(client, year=2026).status_code == 200
    assert _scan(client, year=2027, files=LISTING[:4]).status_code == 200
    counts = {
        year: db_session.query(SummerCoursewareFile)
        .filter(SummerCoursewareFile.year == year).count()
        for year in (2026, 2027)
    }
    assert counts == {2026: 8, 2027: 4}


def test_wrong_folder_scan_keeps_previous_index(client: TestClient):
    """A scan with zero classifiable files is almost certainly a mis-pick —
    reject it instead of wiping the live index."""
    _override_role("Admin")
    assert _scan(client).status_code == 200
    resp = _scan(client, files=[{"path": "Holiday Photos/IMG_0001.jpg"}])
    assert resp.status_code == 400
    index = client.get("/api/summer/courseware/index", params={"year": 2026},
                       cookies=AUTH_COOKIE)
    assert len(index.json()["files"]) == 7


def test_empty_scan_rejected(client: TestClient):
    _override_role("Admin")
    assert _scan(client, files=[]).status_code == 400


def test_index_readable_by_tutors_and_filters_by_grade(client: TestClient):
    _override_role("Admin")
    files = LISTING + [{"path": "F2/SM801 代數的運算 Mixed Operations of Algebra/SM_801_代數的運算_C_c.pdf"}]
    assert _scan(client, files=files).status_code == 200

    _override_role("Tutor")
    resp = client.get("/api/summer/courseware/index",
                      params={"year": 2026, "grade": "F2"}, cookies=AUTH_COOKIE)
    assert resp.status_code == 200
    data = resp.json()
    assert [f["course_code"] for f in data["files"]] == ["801"]
    # Unclassified rows carry no grade, so a grade-filtered (lesson mode)
    # request naturally omits them.
    assert data["unclassified"] == []
    assert data["scan"]["classified_count"] == 8


def test_index_for_unscanned_year_is_empty(client: TestClient):
    _override_role("Tutor")
    resp = client.get("/api/summer/courseware/index", params={"year": 2031},
                      cookies=AUTH_COOKIE)
    assert resp.status_code == 200
    data = resp.json()
    assert data == {"year": 2031, "scan": None, "files": [], "unclassified": []}
