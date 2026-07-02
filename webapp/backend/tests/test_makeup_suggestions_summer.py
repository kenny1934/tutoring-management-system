"""
Tests for Summer-aware make-up suggestions (lesson-number matching).

Contract under test (test-first — endpoint changes not yet implemented):

GET /api/sessions/{id}/makeup-suggestions gains three fields on each
suggestion's `score_breakdown`, populated ONLY when the missed session is
Summer-linked (summer_session_id is set):

- matching_lesson_count (int, default 0):
    Number of active summer students in the candidate slot with the SAME
    GRADE as the missed student AND the same effective lesson number as
    the missed session. School is irrelevant; language stream stays a
    separate (existing) signal.

- slot_majority_lesson (int | null, default null):
    The dominant effective lesson number among same-grade summer students
    in the slot. Null when the slot has no same-grade summer students.
    Tie handling: if the missed session's lesson number is part of the
    tie, it wins (that is the lesson the student actually needs). A tie
    that does NOT include the missed lesson means the slot has no single
    identity → null ("Mixed"), so the badge never overstates one lesson.

- majority_lesson_count (int, default 0):
    How many same-grade summer students are on that majority lesson
    (drives the "Lesson 3 · N classmates" badge).

- missed_lesson (int | null, default null):
    The missed session's resolved lesson number, echoed on every
    suggestion so the frontend can highlight matches and detect the
    unassigned-lesson case without re-deriving backend resolution.

Effective lesson number resolution (mirrors summer_course._effective_lesson_number):
    session_log.lesson_number  →  SummerSession.lesson_number  →
    SummerLesson.lesson_number  →  None

Fallbacks:
- Missed session Summer-linked but effective lesson is None (unassigned
  ad-hoc make-up slot): matching_lesson_count stays 0 everywhere; majority
  fields are still populated for display.
- Missed session is Regular (no summer link): all three fields keep their
  defaults (0 / null / 0) even if candidate slots contain summer students.
  Regular flow is unchanged.
"""
import itertools
import pytest
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from models import (
    Enrollment,
    SessionLog,
    Student,
    SummerApplication,
    SummerCourseConfig,
    SummerCourseSlot,
    SummerLesson,
    SummerSession,
    Tutor,
)
from tests.helpers import make_auth_token


LOCATION = "MSA"
TIME_SLOT = "16:00 - 17:30"
# Candidate slots sit safely inside the 30-day search window regardless of
# HK-vs-UTC "today" skew.
CANDIDATE_DATE = date.today() + timedelta(days=7)

_seq = itertools.count(1)


# ============================================================================
# Fixtures & builders
# ============================================================================

@pytest.fixture
def tutor(db_session: Session) -> Tutor:
    """The missed session's own tutor."""
    t = Tutor(
        user_email="summer-tutor@test.com", tutor_name="Mr Summer Tutor",
        role="Tutor", default_location=LOCATION,
    )
    db_session.add(t)
    db_session.commit()
    return t


@pytest.fixture
def other_tutor(db_session: Session) -> Tutor:
    """A different tutor at the same location (candidate slots)."""
    t = Tutor(
        user_email="other-tutor@test.com", tutor_name="Ms Other Tutor",
        role="Tutor", default_location=LOCATION,
    )
    db_session.add(t)
    db_session.commit()
    return t


@pytest.fixture
def auth_cookie(db_session: Session, tutor: Tutor) -> dict:
    return {"access_token": make_auth_token(tutor.id)}


@pytest.fixture
def summer_config(db_session: Session) -> SummerCourseConfig:
    cfg = SummerCourseConfig(
        year=2026, title="Summer 2026",
        application_open_date=datetime(2026, 4, 1),
        application_close_date=datetime(2026, 5, 31),
        course_start_date=date(2026, 7, 2),
        course_end_date=date(2026, 8, 15),
        pricing_config={}, locations=[LOCATION],
        available_grades=["F1", "F2"], time_slots=[],
    )
    db_session.add(cfg)
    db_session.commit()
    return cfg


def _make_student(db: Session, grade: str = "F1", lang: str = "English") -> Student:
    n = next(_seq)
    s = Student(
        school_student_id=f"SUM{n:04d}", student_name=f"Student {n}",
        grade=grade, phone=str(90000000 + n), lang_stream=lang,
    )
    db.add(s)
    db.commit()
    return s


def _make_summer_session(
    db: Session,
    config: SummerCourseConfig,
    grade: str = "F1",
    ss_lesson_number: int | None = None,
    base_lesson_number: int | None = None,
) -> SummerSession:
    """Application → slot → (optional lesson) → SummerSession chain.

    ss_lesson_number sets the per-student override on SummerSession;
    base_lesson_number sets the slot-level SummerLesson default.
    """
    n = next(_seq)
    app = SummerApplication(
        config_id=config.id, reference_code=f"REF{n:05d}",
        student_name=f"Applicant {n}", grade=grade,
        application_status="Enrolled",
    )
    slot = SummerCourseSlot(
        config_id=config.id, slot_day="Monday",
        time_slot=TIME_SLOT, location=LOCATION, grade=grade,
    )
    db.add_all([app, slot])
    db.commit()

    lesson = None
    if base_lesson_number is not None:
        lesson = SummerLesson(
            slot_id=slot.id, lesson_date=CANDIDATE_DATE,
            lesson_number=base_lesson_number,
        )
        db.add(lesson)
        db.commit()

    ss = SummerSession(
        application_id=app.id, slot_id=slot.id,
        lesson_id=lesson.id if lesson else None,
        lesson_number=ss_lesson_number,
        session_status="Confirmed",
    )
    db.add(ss)
    db.commit()
    return ss


def _summer_link(
    db: Session,
    config: SummerCourseConfig | None,
    grade: str,
    lesson: int | None,
    lesson_via: str,
) -> tuple[int | None, int | None]:
    """(summer_session_id, session_log lesson_number) for a lesson_via mode.

    lesson_via controls where the lesson number lives, to exercise the
    effective-lesson resolution chain:
      "log"            → session_log.lesson_number
      "summer_session" → session_log NULL, SummerSession.lesson_number
      "summer_lesson"  → session_log NULL, SummerSession NULL, SummerLesson base
      "none"           → not summer-linked at all (Regular student)
    """
    if lesson_via == "none":
        return None, None
    assert config is not None, "summer-linked session needs the config fixture"
    if lesson_via == "log":
        return _make_summer_session(db, config, grade=grade).id, lesson
    if lesson_via == "summer_session":
        return _make_summer_session(db, config, grade=grade, ss_lesson_number=lesson).id, None
    if lesson_via == "summer_lesson":
        return _make_summer_session(db, config, grade=grade, base_lesson_number=lesson).id, None
    raise ValueError(lesson_via)


def _add_candidate(
    db: Session,
    tutor: Tutor,
    config: SummerCourseConfig | None = None,
    *,
    grade: str = "F1",
    lang: str = "English",
    lesson: int | None = None,
    lesson_via: str = "log",  # see _summer_link
    status: str = "Scheduled",
    slot_date: date = CANDIDATE_DATE,
    time_slot: str = TIME_SLOT,
) -> SessionLog:
    """One student occupying the candidate slot (date + time + tutor)."""
    student = _make_student(db, grade=grade, lang=lang)
    summer_session_id, log_lesson = _summer_link(db, config, grade, lesson, lesson_via)

    row = SessionLog(
        student_id=student.id, tutor_id=tutor.id,
        session_date=slot_date, time_slot=time_slot, location=LOCATION,
        session_status=status,
        summer_session_id=summer_session_id, lesson_number=log_lesson,
    )
    db.add(row)
    db.commit()
    return row


def _make_missed_session(
    db: Session,
    tutor: Tutor,
    config: SummerCourseConfig | None,
    *,
    grade: str = "F1",
    lesson: int | None = 3,
    lesson_via: str = "log",  # see _summer_link
    enrollment_type: str = "Summer",
) -> SessionLog:
    """The 'Pending Make-up' session the suggestions are requested for."""
    student = _make_student(db, grade=grade)
    enrollment = Enrollment(
        student_id=student.id, tutor_id=tutor.id,
        assigned_day="Monday", assigned_time=TIME_SLOT, location=LOCATION,
        lessons_paid=8, payment_date=date.today(),
        first_lesson_date=date.today() - timedelta(days=14),
        payment_status="Paid", enrollment_type=enrollment_type,
    )
    db.add(enrollment)
    db.commit()

    summer_session_id, log_lesson = _summer_link(db, config, grade, lesson, lesson_via)

    row = SessionLog(
        enrollment_id=enrollment.id,
        student_id=student.id, tutor_id=tutor.id,
        session_date=date.today() - timedelta(days=3),
        time_slot=TIME_SLOT, location=LOCATION,
        session_status="Rescheduled - Pending Make-up",
        summer_session_id=summer_session_id, lesson_number=log_lesson,
    )
    db.add(row)
    db.commit()
    return row


def _get_suggestions(client, auth_cookie, session_id: int) -> list[dict]:
    resp = client.get(
        f"/api/sessions/{session_id}/makeup-suggestions",
        cookies=auth_cookie,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _find_slot(suggestions: list[dict], tutor_id: int,
               slot_date: date = CANDIDATE_DATE,
               time_slot: str = TIME_SLOT) -> dict:
    matches = [
        s for s in suggestions
        if s["tutor_id"] == tutor_id
        and s["session_date"] == slot_date.isoformat()
        and s["time_slot"] == time_slot
    ]
    assert len(matches) == 1, f"expected exactly one slot, got {len(matches)}"
    return matches[0]


# ============================================================================
# Lesson counting & majority within a candidate slot
# ============================================================================

class TestSummerLessonBreakdown:
    """Missed session: Summer, F1, lesson 3."""

    def test_uniform_same_lesson_slot(
        self, client, db_session, tutor, other_tutor, summer_config, auth_cookie
    ):
        """Slot where every F1 summer student is on the missed lesson:
        all of them count as matches and as the majority."""
        missed = _make_missed_session(db_session, tutor, summer_config, lesson=3)
        for _ in range(3):
            _add_candidate(db_session, other_tutor, summer_config, lesson=3)

        slot = _find_slot(_get_suggestions(client, auth_cookie, missed.id), other_tutor.id)
        b = slot["score_breakdown"]
        assert b["missed_lesson"] == 3
        assert b["matching_lesson_count"] == 3
        assert b["slot_majority_lesson"] == 3
        assert b["majority_lesson_count"] == 3

    def test_mixed_slot_majority_equals_missed_lesson(
        self, client, db_session, tutor, other_tutor, summer_config, auth_cookie
    ):
        """3 students on lesson 3, 1 on lesson 5 → majority is lesson 3;
        the badge count reflects the majority (3), matching the missed lesson."""
        missed = _make_missed_session(db_session, tutor, summer_config, lesson=3)
        for _ in range(3):
            _add_candidate(db_session, other_tutor, summer_config, lesson=3)
        _add_candidate(db_session, other_tutor, summer_config, lesson=5)

        slot = _find_slot(_get_suggestions(client, auth_cookie, missed.id), other_tutor.id)
        b = slot["score_breakdown"]
        assert b["matching_lesson_count"] == 3
        assert b["slot_majority_lesson"] == 3
        assert b["majority_lesson_count"] == 3

    def test_majority_differs_from_missed_lesson(
        self, client, db_session, tutor, other_tutor, summer_config, auth_cookie
    ):
        """Missed lesson 3, but the slot is dominated by lesson 5:
        the badge shows the slot's real identity (lesson 5), while
        matching_lesson_count still reports the 1 lesson-3 classmate."""
        missed = _make_missed_session(db_session, tutor, summer_config, lesson=3)
        _add_candidate(db_session, other_tutor, summer_config, lesson=3)
        for _ in range(3):
            _add_candidate(db_session, other_tutor, summer_config, lesson=5)

        slot = _find_slot(_get_suggestions(client, auth_cookie, missed.id), other_tutor.id)
        b = slot["score_breakdown"]
        assert b["matching_lesson_count"] == 1
        assert b["slot_majority_lesson"] == 5
        assert b["majority_lesson_count"] == 3

    def test_other_grades_are_excluded_from_lesson_pool(
        self, client, db_session, tutor, other_tutor, summer_config, auth_cookie
    ):
        """Same level only: F2 students on the right lesson number are a
        different course's lesson 3 — they must not count, neither for
        matching nor for the majority badge."""
        missed = _make_missed_session(db_session, tutor, summer_config, grade="F1", lesson=3)
        # Two F2 students on "lesson 3" and one on lesson 5
        _add_candidate(db_session, other_tutor, summer_config, grade="F2", lesson=3)
        _add_candidate(db_session, other_tutor, summer_config, grade="F2", lesson=3)
        _add_candidate(db_session, other_tutor, summer_config, grade="F2", lesson=5)
        # One F1 student on lesson 3
        _add_candidate(db_session, other_tutor, summer_config, grade="F1", lesson=3)

        slot = _find_slot(_get_suggestions(client, auth_cookie, missed.id), other_tutor.id)
        b = slot["score_breakdown"]
        assert b["matching_lesson_count"] == 1
        assert b["slot_majority_lesson"] == 3
        assert b["majority_lesson_count"] == 1  # F1 pool only

    def test_slot_with_only_other_grade_summer_students(
        self, client, db_session, tutor, other_tutor, summer_config, auth_cookie
    ):
        """A purely-F2 summer slot has no lesson identity for an F1 student:
        majority is null, but the slot is still suggested (boost, not filter)."""
        missed = _make_missed_session(db_session, tutor, summer_config, grade="F1", lesson=3)
        _add_candidate(db_session, other_tutor, summer_config, grade="F2", lesson=3)
        _add_candidate(db_session, other_tutor, summer_config, grade="F2", lesson=3)

        slot = _find_slot(_get_suggestions(client, auth_cookie, missed.id), other_tutor.id)
        b = slot["score_breakdown"]
        assert b["missed_lesson"] == 3
        assert b["matching_lesson_count"] == 0
        assert b["slot_majority_lesson"] is None
        assert b["majority_lesson_count"] == 0

    def test_tie_prefers_missed_lesson(
        self, client, db_session, tutor, other_tutor, summer_config, auth_cookie
    ):
        """2 on lesson 3 vs 2 on lesson 5, missed lesson 3:
        the tie resolves toward the lesson the student actually needs."""
        missed = _make_missed_session(db_session, tutor, summer_config, lesson=3)
        for _ in range(2):
            _add_candidate(db_session, other_tutor, summer_config, lesson=3)
        for _ in range(2):
            _add_candidate(db_session, other_tutor, summer_config, lesson=5)

        slot = _find_slot(_get_suggestions(client, auth_cookie, missed.id), other_tutor.id)
        b = slot["score_breakdown"]
        assert b["slot_majority_lesson"] == 3
        assert b["majority_lesson_count"] == 2
        assert b["matching_lesson_count"] == 2

    def test_tie_without_missed_lesson_is_mixed(
        self, client, db_session, tutor, other_tutor, summer_config, auth_cookie
    ):
        """2 on lesson 5 vs 2 on lesson 7, missed lesson 1 (not in the tie):
        both options are equally unhelpful and the slot has no single
        identity, so no majority is reported — the card shows no lesson
        badge rather than overstating one lesson."""
        missed = _make_missed_session(db_session, tutor, summer_config, lesson=1)
        for _ in range(2):
            _add_candidate(db_session, other_tutor, summer_config, lesson=5)
        for _ in range(2):
            _add_candidate(db_session, other_tutor, summer_config, lesson=7)

        slot = _find_slot(_get_suggestions(client, auth_cookie, missed.id), other_tutor.id)
        b = slot["score_breakdown"]
        assert b["slot_majority_lesson"] is None
        assert b["majority_lesson_count"] == 0
        assert b["matching_lesson_count"] == 0

    def test_regular_only_slot_still_suggested_without_lesson_fields(
        self, client, db_session, tutor, other_tutor, summer_config, auth_cookie
    ):
        """During summer, slots holding only Regular students stay in the
        list (ranked lower by the frontend), with empty lesson fields."""
        missed = _make_missed_session(db_session, tutor, summer_config, lesson=3)
        _add_candidate(db_session, other_tutor, lesson_via="none", grade="F1")
        _add_candidate(db_session, other_tutor, lesson_via="none", grade="F1")

        slot = _find_slot(_get_suggestions(client, auth_cookie, missed.id), other_tutor.id)
        b = slot["score_breakdown"]
        assert b["matching_lesson_count"] == 0
        assert b["slot_majority_lesson"] is None
        assert b["majority_lesson_count"] == 0
        # Existing signals unaffected: two F1 students still match on grade.
        assert b["matching_grade_count"] == 2

    def test_makeup_class_rows_count_toward_lessons(
        self, client, db_session, tutor, other_tutor, summer_config, auth_cookie
    ):
        """A summer student already rebooked into this slot as 'Make-up Class'
        carries their lesson number with them (booking moves the summer
        linkage onto the make-up row) and must count."""
        missed = _make_missed_session(db_session, tutor, summer_config, lesson=3)
        _add_candidate(db_session, other_tutor, summer_config, lesson=3, status="Make-up Class")
        _add_candidate(db_session, other_tutor, summer_config, lesson=3, status="Scheduled")

        slot = _find_slot(_get_suggestions(client, auth_cookie, missed.id), other_tutor.id)
        b = slot["score_breakdown"]
        assert b["matching_lesson_count"] == 2
        assert b["slot_majority_lesson"] == 3
        assert b["majority_lesson_count"] == 2


# ============================================================================
# Effective lesson number resolution (candidate side)
# ============================================================================

class TestEffectiveLessonResolution:
    """Candidate rows may hold the lesson number at different levels of the
    summer chain; all must resolve like _effective_lesson_number does."""

    def test_null_log_lesson_resolves_from_summer_session_override(
        self, client, db_session, tutor, other_tutor, summer_config, auth_cookie
    ):
        missed = _make_missed_session(db_session, tutor, summer_config, lesson=3)
        _add_candidate(
            db_session, other_tutor, summer_config,
            lesson=3, lesson_via="summer_session",
        )

        slot = _find_slot(_get_suggestions(client, auth_cookie, missed.id), other_tutor.id)
        b = slot["score_breakdown"]
        assert b["matching_lesson_count"] == 1
        assert b["slot_majority_lesson"] == 3

    def test_null_log_lesson_resolves_from_summer_lesson_base(
        self, client, db_session, tutor, other_tutor, summer_config, auth_cookie
    ):
        missed = _make_missed_session(db_session, tutor, summer_config, lesson=3)
        _add_candidate(
            db_session, other_tutor, summer_config,
            lesson=3, lesson_via="summer_lesson",
        )

        slot = _find_slot(_get_suggestions(client, auth_cookie, missed.id), other_tutor.id)
        b = slot["score_breakdown"]
        assert b["matching_lesson_count"] == 1
        assert b["slot_majority_lesson"] == 3

    def test_log_lesson_wins_over_summer_session_value(
        self, client, db_session, tutor, other_tutor, summer_config, auth_cookie
    ):
        """Precedence: a live session_log override beats the frozen
        SummerSession value (student was moved to different material)."""
        missed = _make_missed_session(db_session, tutor, summer_config, lesson=3)
        # SummerSession says lesson 5, but the live row was edited to lesson 3
        ss = _make_summer_session(db_session, summer_config, grade="F1", ss_lesson_number=5)
        student = _make_student(db_session, grade="F1")
        db_session.add(SessionLog(
            student_id=student.id, tutor_id=other_tutor.id,
            session_date=CANDIDATE_DATE, time_slot=TIME_SLOT, location=LOCATION,
            session_status="Scheduled",
            summer_session_id=ss.id, lesson_number=3,
        ))
        db_session.commit()

        slot = _find_slot(_get_suggestions(client, auth_cookie, missed.id), other_tutor.id)
        b = slot["score_breakdown"]
        assert b["matching_lesson_count"] == 1
        assert b["slot_majority_lesson"] == 3

    def test_summer_linked_row_with_no_resolvable_lesson(
        self, client, db_session, tutor, other_tutor, summer_config, auth_cookie
    ):
        """Unassigned ad-hoc candidate (lesson null at every level) sits in
        the slot but contributes no lesson identity."""
        missed = _make_missed_session(db_session, tutor, summer_config, lesson=3)
        _add_candidate(
            db_session, other_tutor, summer_config,
            lesson=None, lesson_via="summer_session",
        )
        _add_candidate(db_session, other_tutor, summer_config, lesson=3)

        slot = _find_slot(_get_suggestions(client, auth_cookie, missed.id), other_tutor.id)
        b = slot["score_breakdown"]
        assert b["matching_lesson_count"] == 1
        assert b["slot_majority_lesson"] == 3
        assert b["majority_lesson_count"] == 1


# ============================================================================
# Missed-session modes (summer without lesson, summer via chain, regular)
# ============================================================================

class TestMissedSessionModes:

    def test_missed_lesson_resolved_via_summer_chain(
        self, client, db_session, tutor, other_tutor, summer_config, auth_cookie
    ):
        """The missed row itself may hold lesson_number only on its
        SummerSession (log value null) — resolution applies to it too."""
        missed = _make_missed_session(
            db_session, tutor, summer_config,
            lesson=4, lesson_via="summer_session",
        )
        _add_candidate(db_session, other_tutor, summer_config, lesson=4)
        _add_candidate(db_session, other_tutor, summer_config, lesson=2)

        slot = _find_slot(_get_suggestions(client, auth_cookie, missed.id), other_tutor.id)
        b = slot["score_breakdown"]
        assert b["missed_lesson"] == 4
        assert b["matching_lesson_count"] == 1
        # Tie between lessons 4 and 2 (one student each) → prefer missed lesson 4
        assert b["slot_majority_lesson"] == 4
        assert b["majority_lesson_count"] == 1

    def test_missed_session_without_lesson_number_falls_back(
        self, client, db_session, tutor, other_tutor, summer_config, auth_cookie
    ):
        """Ad-hoc make-up origin with no lesson assigned anywhere: nothing to
        match (count 0), but the majority badge still describes the slot."""
        missed = _make_missed_session(
            db_session, tutor, summer_config,
            lesson=None, lesson_via="summer_session",
        )
        for _ in range(2):
            _add_candidate(db_session, other_tutor, summer_config, lesson=6)

        slot = _find_slot(_get_suggestions(client, auth_cookie, missed.id), other_tutor.id)
        b = slot["score_breakdown"]
        assert b["missed_lesson"] is None
        assert b["matching_lesson_count"] == 0
        assert b["slot_majority_lesson"] == 6
        assert b["majority_lesson_count"] == 2

    def test_regular_makeup_is_unaffected(
        self, client, db_session, tutor, other_tutor, summer_config, auth_cookie
    ):
        """Regular missed session: lesson fields stay at their defaults even
        when the candidate slot is full of same-grade summer students —
        the Summer logic must not leak into the Regular flow."""
        missed = _make_missed_session(
            db_session, tutor, None,
            lesson_via="none", enrollment_type="Regular",
        )
        for _ in range(3):
            _add_candidate(db_session, other_tutor, summer_config, lesson=3)

        slot = _find_slot(_get_suggestions(client, auth_cookie, missed.id), other_tutor.id)
        b = slot["score_breakdown"]
        assert b["missed_lesson"] is None
        assert b["matching_lesson_count"] == 0
        assert b["slot_majority_lesson"] is None
        assert b["majority_lesson_count"] == 0


# ============================================================================
# Existing behaviour preserved
# ============================================================================

class TestExistingBehaviourPreserved:

    def test_existing_breakdown_fields_intact_for_summer(
        self, client, db_session, tutor, summer_config, auth_cookie
    ):
        """Summer mode adds fields; it must not disturb the existing raw
        signals (same tutor, grade/lang counts, capacity)."""
        missed = _make_missed_session(db_session, tutor, summer_config, lesson=3)
        # Candidate slot with the SAME tutor, two F1 English students on lesson 3
        _add_candidate(db_session, tutor, summer_config, lesson=3, lang="English")
        _add_candidate(db_session, tutor, summer_config, lesson=3, lang="English")

        slot = _find_slot(_get_suggestions(client, auth_cookie, missed.id), tutor.id)
        b = slot["score_breakdown"]
        assert b["is_same_tutor"] is True
        assert b["matching_grade_count"] == 2
        assert b["matching_lang_count"] == 2
        assert b["current_students"] == 2
        assert slot["available_spots"] == 6
        assert b["matching_lesson_count"] == 2

    def test_own_slot_excluded_and_full_slots_skipped(
        self, client, db_session, tutor, other_tutor, summer_config, auth_cookie
    ):
        """Existing exclusions still hold under Summer mode: slots already
        containing the student are skipped, full slots (8) never appear."""
        missed = _make_missed_session(db_session, tutor, summer_config, lesson=3)

        # Slot A contains the missed student themself → excluded
        db_session.add(SessionLog(
            student_id=missed.student_id, tutor_id=other_tutor.id,
            session_date=CANDIDATE_DATE, time_slot="14:00 - 15:30",
            location=LOCATION, session_status="Scheduled",
        ))
        db_session.commit()

        # Slot B is full (8 students on lesson 3) → excluded at DB level
        for _ in range(8):
            _add_candidate(
                db_session, other_tutor, summer_config,
                lesson=3, time_slot="10:00 - 11:30",
            )

        suggestions = _get_suggestions(client, auth_cookie, missed.id)
        slots_seen = {(s["session_date"], s["time_slot"], s["tutor_id"]) for s in suggestions}
        assert (CANDIDATE_DATE.isoformat(), "14:00 - 15:30", other_tutor.id) not in slots_seen
        assert (CANDIDATE_DATE.isoformat(), "10:00 - 11:30", other_tutor.id) not in slots_seen
