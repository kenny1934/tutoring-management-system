"""Tests for the curriculum suggestion endpoint.

The endpoint reads raw tables and views (academic_weeks, the curriculum
tables, the migration-125 consensus/pacing views, the migration-036
popularity view) that have no ORM models, so the fixtures create minimal
SQLite equivalents — views become plain tables with the same columns.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from main import app
from models import CalendarEvent, Student, Tutor
from auth.dependencies import get_current_user
from routers import curriculum
from tests.helpers import make_auth_token

AUTH_COOKIE = {"access_token": make_auth_token(99)}

ALIAS_C = "Center\\Courseware (Chi)\\new_math7-9EX"
ALIAS_E = "Center\\Courseware (Eng)\\new_math7-9EX"

RAW_TABLES = [
    """CREATE TABLE academic_weeks (
        id INTEGER PRIMARY KEY, academic_year VARCHAR(20), week_number INT,
        week_start_date DATE, week_end_date DATE)""",
    """CREATE TABLE curriculum_concepts (
        id INTEGER PRIMARY KEY, kind VARCHAR(20), name_en VARCHAR(255),
        name_zh VARCHAR(255), grade VARCHAR(50), parent_id INT,
        display_order INT)""",
    """CREATE TABLE concept_code_aliases (
        id INTEGER PRIMARY KEY, concept_id INT, code_space VARCHAR(12),
        code VARCHAR(12))""",
    """CREATE TABLE school_topic_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, school VARCHAR(255),
        grade VARCHAR(50), lang_stream VARCHAR(50), academic_year VARCHAR(20),
        week_number INT, concept_id INT, source VARCHAR(20),
        confidence DECIMAL(3,2), is_revision BOOLEAN, source_ref VARCHAR(500))""",
    """CREATE TABLE courseware_concepts (
        id INTEGER PRIMARY KEY, concept_id INT, file_path VARCHAR(500),
        file_basename VARCHAR(255), role VARCHAR(20), lang VARCHAR(1),
        source VARCHAR(20), confidence DECIMAL(3,2))""",
    """CREATE TABLE school_week_topic_consensus (
        school VARCHAR(255), grade VARCHAR(50), lang_stream VARCHAR(50),
        academic_year VARCHAR(20), week_number INT, concept_id INT,
        weight DECIMAL(10,2), source_count INT, sources TEXT, rank_in_week INT)""",
    """CREATE TABLE school_concept_pacing (
        school VARCHAR(255), grade VARCHAR(50), lang_stream VARCHAR(50),
        concept_id INT, years_observed INT, mean_week DECIMAL(4,1),
        min_week INT, max_week INT, week_spread DECIMAL(4,1),
        total_weight DECIMAL(10,2))""",
    """CREATE TABLE courseware_popularity_summary (
        filename VARCHAR(255), normalized_paths TEXT, used_by TEXT,
        assignment_count INT, unique_student_count INT,
        earliest_use DATE, latest_use DATE)""",
]


@pytest.fixture(autouse=True)
def _setup(db_session):
    # conftest only drops ORM tables between tests; these raw ones persist in
    # the shared in-memory DB, so recreate them fresh each time.
    for ddl in RAW_TABLES:
        table_name = ddl.split("(", 1)[0].split()[-1]
        db_session.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
        db_session.execute(text(ddl))

    db_session.execute(text("""
        INSERT INTO academic_weeks (academic_year, week_number, week_start_date, week_end_date) VALUES
        ('2025-2026', 10, '2025-11-03', '2025-11-09'),
        ('2025-2026', 11, '2025-11-10', '2025-11-16'),
        ('2025-2026', 12, '2025-11-17', '2025-11-23')
    """))
    db_session.execute(text("""
        INSERT INTO curriculum_concepts (id, kind, name_en, name_zh, grade, display_order) VALUES
        (1, 'chapter', 'Linear Equations in One Unknown', NULL, 'F1', 4),
        (2, 'chapter', 'Percentage(I)', NULL, 'F1', 5),
        (3, 'chapter', 'Introduction to Algebra', NULL, 'F1', 3)
    """))
    db_session.execute(text("""
        INSERT INTO concept_code_aliases (concept_id, code_space, code) VALUES
        (1, 'HK_NEW', '704'), (1, 'HK_OLD', '703'),
        (2, 'HK_NEW', '705'), (3, 'HK_NEW', '703')
    """))
    db_session.execute(text(f"""
        INSERT INTO courseware_concepts
            (concept_id, file_path, file_basename, role, lang, source, confidence) VALUES
        (1, '{ALIAS_E}\\704_EX1_e.pdf',  '704_EX1_e.pdf',  'exercise', 'e', 'code', 1.0),
        (1, '{ALIAS_E}\\704_EX2_e.pdf',  '704_EX2_e.pdf',  'exercise', 'e', 'code', 1.0),
        (1, '{ALIAS_E}\\704_Rev_e.pdf',  '704_Rev_e.pdf',  'revision', 'e', 'code', 1.0),
        (1, '{ALIAS_C}\\704_EX1_c.pdf',  '704_EX1_c.pdf',  'exercise', 'c', 'code', 1.0),
        (1, 'Weekly\\704_EX1_e',         '704_EX1_e',      'exercise', 'e', 'code', 1.0),
        (1, 'C:\\Users\\someone\\704_private.pdf', '704_private.pdf', 'exercise', 'e', 'code', 1.0),
        (2, '{ALIAS_E}\\705_EX1_e.pdf',  '705_EX1_e.pdf',  'exercise', 'e', 'code', 1.0)
    """))
    db_session.execute(text("""
        INSERT INTO courseware_popularity_summary
            (filename, assignment_count, unique_student_count) VALUES
        ('704_EX1_e', 40, 20), ('704_EX2_e', 90, 45), ('704_Rev_e', 10, 8),
        ('705_EX1_e', 5, 3)
    """))
    curriculum._popularity_cache["loaded_at"] = 0.0
    curriculum._popularity_cache["map"] = {}

    db_session.add(Student(id=1, student_name="Amy", school="SRL-E", grade="F1", lang_stream="E"))
    db_session.add(Student(id=2, student_name="Ben", school="SRL-E", grade="F4", lang_stream="E"))
    db_session.add(Student(id=3, student_name="Cat", school=None, grade="F1", lang_stream="E"))
    db_session.commit()

    app.dependency_overrides[get_current_user] = lambda: Tutor(
        id=99, user_email="me@example.com", tutor_name="Me", role="Tutor",
        is_active_tutor=True,
    )
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _consensus_row(db, week, concept_id, weight, year="2025-2026",
                   school="SRL-E", grade="F1", stream="E",
                   sources="assignment,prep_folder"):
    db.execute(text("""
        INSERT INTO school_week_topic_consensus
            (school, grade, lang_stream, academic_year, week_number, concept_id,
             weight, source_count, sources, rank_in_week)
        VALUES (:school, :grade, :stream, :year, :week, :cid, :w, 2, :sources, 1)
    """), {"school": school, "grade": grade, "stream": stream, "year": year,
           "week": week, "cid": concept_id, "w": weight, "sources": sources})
    db.commit()


def _get(client, student_id=1, date="2025-11-12"):
    return client.get(
        "/api/curriculum/suggestions",
        params={"student_id": student_id, "date": date},
        cookies=AUTH_COOKIE,
    )


def test_unknown_student_404(client: TestClient):
    assert _get(client, student_id=999).status_code == 404


def test_senior_grade_returns_reason(client: TestClient):
    body = _get(client, student_id=2).json()
    assert body["reason"] == "unsupported_grade"
    assert body["suggestions"] == []


def test_no_school_returns_reason(client: TestClient):
    assert _get(client, student_id=3).json()["reason"] == "no_school"


def test_date_outside_academic_weeks(client: TestClient):
    assert _get(client, date="2030-01-01").json()["reason"] == "no_academic_week"


def test_no_timeline_returns_reason(client: TestClient):
    body = _get(client).json()
    assert body["tier"] == "none"
    assert body["reason"] == "no_timeline"
    assert body["week_number"] == 11


def test_this_year_tier_ranks_files(client: TestClient, db_session):
    _consensus_row(db_session, week=11, concept_id=1, weight=3.0)
    _consensus_row(db_session, week=10, concept_id=2, weight=1.0)

    body = _get(client).json()
    assert body["tier"] == "this_year"
    assert body["revision_mode"] is False
    assert [s["concept_id"] for s in body["suggestions"]] == [1, 2]

    top = body["suggestions"][0]
    assert top["why"]["sources"] == ["assignment", "prep_folder"]
    assert top["why"]["weeks_observed"] == [11]

    files = top["files"]
    basenames = [f["file_basename"] for f in files]
    # English stream: 'e' files first; the weekly no-extension copy of
    # 704_EX1 is deduped into the canonical row; unattributable and revision
    # files rank behind exercises; popularity breaks the EX1/EX2 tie.
    assert basenames[0] == "704_EX2_e.pdf"          # exercise, pop 90
    assert basenames[1] == "704_EX1_e.pdf"          # exercise, pop 40
    assert "704_EX1_e" not in basenames             # deduped into .pdf variant
    assert "704_private.pdf" not in basenames       # not alias-form -> unusable
    assert files[0]["file_path"].startswith("Center\\")
    assert files[0]["assignment_count"] == 90
    # 'c' file ranks after all 'e' files
    assert basenames.index("704_EX1_c.pdf") > basenames.index("704_Rev_e.pdf")


def test_exam_window_prefers_revision(client: TestClient, db_session):
    _consensus_row(db_session, week=11, concept_id=1, weight=3.0)
    db_session.add(CalendarEvent(
        event_id="evt1", title="F1 Math Test", school="SRL-E", grade="F1",
        event_type="Test", start_date=__import__("datetime").date(2025, 11, 20),
    ))
    db_session.commit()

    body = _get(client).json()
    assert body["revision_mode"] is True
    assert body["upcoming_exam"]["title"] == "F1 Math Test"
    assert body["suggestions"][0]["files"][0]["file_basename"] == "704_Rev_e.pdf"


def test_last_year_fallback(client: TestClient, db_session):
    _consensus_row(db_session, week=12, concept_id=1, weight=2.0, year="2024-2025")

    body = _get(client).json()
    assert body["tier"] == "last_year"
    assert body["suggestions"][0]["concept_id"] == 1


def test_pacing_fallback(client: TestClient, db_session):
    db_session.execute(text("""
        INSERT INTO school_concept_pacing
            (school, grade, lang_stream, concept_id, years_observed, mean_week,
             min_week, max_week, week_spread, total_weight)
        VALUES ('SRL-E', 'F1', 'E', 3, 2, 12.0, 10, 14, 1.5, 4.2)
    """))
    db_session.commit()

    body = _get(client).json()
    assert body["tier"] == "pacing"
    top = body["suggestions"][0]
    assert top["concept_id"] == 3
    assert top["why"]["mean_week"] == 12.0
    assert top["why"]["years_observed"] == 2
    # Concept 3 has no usable files yet: still surfaced, with its name.
    assert top["name_en"] == "Introduction to Algebra"
    assert top["files"] == []


def test_week_decay_prefers_current_week(client: TestClient, db_session):
    # Concept 2 has more raw weight but two weeks ago; concept 1 is current.
    _consensus_row(db_session, week=11, concept_id=1, weight=2.0)
    _consensus_row(db_session, week=9, concept_id=2, weight=4.0)

    body = _get(client).json()
    # week 9 is outside the w-2..w decay window's DB filter lower bound (9)
    # but 2.0*1.0 > 4.0*0.35, so the current-week concept still wins.
    assert body["suggestions"][0]["concept_id"] == 1


def test_requires_auth(client: TestClient):
    resp = client.get("/api/curriculum/suggestions", params={"student_id": 1})
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Concept vocabulary
# ---------------------------------------------------------------------------

def test_list_concepts_with_codes(client: TestClient):
    body = client.get("/api/curriculum/concepts", cookies=AUTH_COOKIE).json()
    assert len(body) == 3
    # ordered by display_order: Algebra (3) before Linear Equations (4)
    assert [c["id"] for c in body] == [3, 1, 2]
    linear = next(c for c in body if c["id"] == 1)
    assert {(a["code_space"], a["code"]) for a in linear["codes"]} == {
        ("HK_NEW", "704"), ("HK_OLD", "703")}


# ---------------------------------------------------------------------------
# Free search
# ---------------------------------------------------------------------------

def _search(client, **params):
    return client.get("/api/curriculum/search", params=params, cookies=AUTH_COOKIE)


def test_search_requires_some_filter(client: TestClient):
    assert _search(client).status_code == 400


def test_search_by_code_ranks_exact_match_first(client: TestClient):
    # '703' is an exact code on concept 1 (HK_OLD) AND concept 3 (HK_NEW):
    # both code matches come before any name matches.
    body = _search(client, q="703").json()
    assert [c["concept_id"] for c in body["concepts"]] == [1, 3]
    files = body["concepts"][0]["files"]
    assert files and files[0]["file_path"].startswith("Center\\")


def test_search_by_name(client: TestClient):
    body = _search(client, q="Percentage").json()
    assert [c["concept_id"] for c in body["concepts"]] == [2]
    assert body["concepts"][0]["evidence"] is None


def test_search_by_school_scope(client: TestClient, db_session):
    _consensus_row(db_session, week=10, concept_id=1, weight=3.0)
    _consensus_row(db_session, week=11, concept_id=2, weight=1.0)

    body = _search(client, school="SRL-E", grade="F1",
                   academic_year="2025-2026", week_from=1, week_to=20).json()
    assert body["academic_year"] == "2025-2026"
    assert [c["concept_id"] for c in body["concepts"]] == [1, 2]
    assert body["concepts"][0]["evidence"]["weight"] == 3.0
    assert body["concepts"][0]["evidence"]["weeks_observed"] == [10]


def test_search_concept_plus_scope_annotates_evidence(client: TestClient, db_session):
    _consensus_row(db_session, week=10, concept_id=1, weight=3.0)

    body = _search(client, q="Linear", school="SRL-E", grade="F1",
                   academic_year="2025-2026").json()
    assert body["concepts"][0]["concept_id"] == 1
    assert body["concepts"][0]["evidence"]["weight"] == 3.0


def test_search_role_filter(client: TestClient):
    body = _search(client, concept_id=1, role="revision").json()
    basenames = [f["file_basename"] for f in body["concepts"][0]["files"]]
    assert basenames == ["704_Rev_e.pdf"]


# ---------------------------------------------------------------------------
# Flywheel observations
# ---------------------------------------------------------------------------

def _confirm(client, **overrides):
    payload = {"student_id": 1, "concept_id": 1, "session_date": "2025-11-12"}
    payload.update(overrides)
    return client.post("/api/curriculum/observations", json=payload, cookies=AUTH_COOKIE)


def test_confirm_creates_observation(client: TestClient, db_session):
    resp = _confirm(client)
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] is True
    assert body["week_number"] == 11
    row = db_session.execute(text(
        "SELECT school, grade, lang_stream, source, confidence, is_revision, source_ref "
        "FROM school_topic_observations WHERE id = :id"), {"id": body["id"]}).fetchone()
    assert (row.school, row.grade, row.lang_stream) == ("SRL-E", "F1", "E")
    assert row.source == "tutor_confirm"
    assert float(row.confidence) == 1.0
    assert not row.is_revision
    assert row.source_ref.startswith("tutor:99:student:1:")


def test_confirm_is_idempotent_per_tutor_week(client: TestClient, db_session):
    first = _confirm(client).json()
    second = _confirm(client).json()
    assert second["created"] is False
    assert second["id"] == first["id"]
    count = db_session.execute(text(
        "SELECT COUNT(*) FROM school_topic_observations")).scalar()
    assert count == 1


def test_accept_suggestion_lower_confidence(client: TestClient, db_session):
    body = _confirm(client, action="accept_suggestion").json()
    conf = db_session.execute(text(
        "SELECT confidence FROM school_topic_observations WHERE id = :id"),
        {"id": body["id"]}).scalar()
    assert float(conf) == 0.7


def test_confirm_feeds_suggestions_via_consensus(client: TestClient, db_session):
    """A tutor confirm becomes visible timeline evidence (the flywheel).

    SQLite has no consensus VIEW, so mirror what migration 125 derives from
    the observation the confirm just inserted."""
    body = _confirm(client, is_revision=False).json()
    obs = db_session.execute(text(
        "SELECT school, grade, lang_stream, academic_year, week_number, concept_id, confidence "
        "FROM school_topic_observations WHERE id = :id"), {"id": body["id"]}).fetchone()
    _consensus_row(db_session, week=obs.week_number, concept_id=obs.concept_id,
                   weight=float(obs.confidence), year=obs.academic_year,
                   school=obs.school, grade=obs.grade, stream=obs.lang_stream,
                   sources="tutor_confirm")
    sugg = _get(client).json()
    assert sugg["tier"] == "this_year"
    assert sugg["suggestions"][0]["concept_id"] == obs.concept_id
    assert sugg["suggestions"][0]["why"]["sources"] == ["tutor_confirm"]


def test_confirm_guards(client: TestClient):
    assert _confirm(client, student_id=999).status_code == 404
    assert _confirm(client, concept_id=999).status_code == 404
    assert _confirm(client, student_id=3).status_code == 400          # no school
    assert _confirm(client, session_date="2030-01-01").status_code == 400  # no week


def test_delete_own_confirmation_only(client: TestClient, db_session):
    body = _confirm(client).json()
    # someone else's confirm
    db_session.execute(text("""
        INSERT INTO school_topic_observations
            (school, grade, lang_stream, academic_year, week_number, concept_id,
             source, confidence, is_revision, source_ref)
        VALUES ('SRL-E', 'F1', 'E', '2025-2026', 11, 2,
                'tutor_confirm', 1.0, 0, 'tutor:42:student:1:confirm')
    """))
    other_id = db_session.execute(text("SELECT MAX(id) FROM school_topic_observations")).scalar()
    # backfilled row is never deletable
    db_session.execute(text("""
        INSERT INTO school_topic_observations
            (school, grade, lang_stream, academic_year, week_number, concept_id,
             source, confidence, is_revision, source_ref)
        VALUES ('SRL-E', 'F1', 'E', '2025-2026', 11, 2, 'sheet', 0.85, 0, 'x')
    """))
    backfill_id = db_session.execute(text("SELECT MAX(id) FROM school_topic_observations")).scalar()
    db_session.commit()

    assert client.delete(f"/api/curriculum/observations/{body['id']}",
                         cookies=AUTH_COOKIE).status_code == 200
    assert client.delete(f"/api/curriculum/observations/{other_id}",
                         cookies=AUTH_COOKIE).status_code == 403
    assert client.delete(f"/api/curriculum/observations/{backfill_id}",
                         cookies=AUTH_COOKIE).status_code == 404
    remaining = db_session.execute(text(
        "SELECT COUNT(*) FROM school_topic_observations")).scalar()
    assert remaining == 2


# ---------------------------------------------------------------------------
# Explorer data
# ---------------------------------------------------------------------------

def test_timeline(client: TestClient, db_session):
    _consensus_row(db_session, week=10, concept_id=1, weight=3.0)
    _consensus_row(db_session, week=10, concept_id=2, weight=1.0)
    db_session.execute(text("""
        INSERT INTO school_topic_observations
            (school, grade, lang_stream, academic_year, week_number, concept_id,
             source, confidence, is_revision, source_ref)
        VALUES ('SRL-E', 'F1', 'E', '2025-2026', 10, 1, 'sheet', 0.85, 0, 'x')
    """))
    db_session.execute(text("""
        INSERT INTO school_concept_pacing
            (school, grade, lang_stream, concept_id, years_observed, mean_week,
             min_week, max_week, week_spread, total_weight)
        VALUES ('SRL-E', 'F1', 'E', 1, 3, 10.5, 9, 12, 1.1, 6.0)
    """))
    db_session.commit()

    # rank comes from the seeded rank_in_week (helper always writes 1); the
    # endpoint passes it through, so both concepts appear under week 10.
    db_session.execute(text(
        "UPDATE school_week_topic_consensus SET rank_in_week = 2 WHERE concept_id = 2"))
    db_session.commit()

    body = client.get("/api/curriculum/timeline", params={
        "school": "SRL-E", "grade": "F1", "lang_stream": "E",
        "academic_year": "2025-2026",
    }, cookies=AUTH_COOKIE).json()
    assert body["academic_year"] == "2025-2026"
    assert body["years_available"] == ["2025-2026"]
    assert len(body["weeks"]) == 1
    wk = body["weeks"][0]
    assert wk["week_number"] == 10
    assert [c["concept_id"] for c in wk["concepts"]] == [1, 2]
    assert wk["concepts"][0]["name_en"] == "Linear Equations in One Unknown"
    assert body["pacing"][0]["mean_week"] == 10.5


def test_coverage(client: TestClient, db_session):
    db_session.execute(text("""
        INSERT INTO school_topic_observations
            (school, grade, lang_stream, academic_year, week_number, concept_id,
             source, confidence, is_revision, source_ref)
        VALUES
        ('SRL-E', 'F1', 'E', '2025-2026', 10, 1, 'sheet', 0.85, 0, 'x'),
        ('SRL-E', 'F1', 'E', '2025-2026', 11, 1, 'tutor_confirm', 1.0, 0, 'tutor:99:student:1:confirm'),
        ('PCMS', 'F2', 'C', '2024-2025', 5, 2, 'assignment', 0.7, 0, 'y')
    """))
    db_session.commit()

    body = client.get("/api/curriculum/coverage", cookies=AUTH_COOKIE).json()
    assert len(body) == 2
    srl = next(r for r in body if r["school"] == "SRL-E")
    assert srl["weeks_observed"] == 2
    assert srl["total_weight"] == 1.85
    assert srl["tutor_confirms"] == 1
