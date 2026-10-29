"""Assistant links remain available as staff records. Tutors can prepare
exercises for other tutors with or without a link, while ratings and
read-only roles retain their restrictions.
"""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from constants import today_hk
from main import app
from models import SessionExercise, SessionLog, Student, Tutor, TutorAssistant
from auth.dependencies import get_current_user, reject_read_only, require_admin_write
from tests.helpers import make_auth_token

AUTH_COOKIE = {"access_token": make_auth_token(99)}
SAVE_URL = "/api/sessions/200/exercises"
BULK_URL = "/api/sessions/bulk-assign-exercises"


@pytest.fixture
def signed_in():
    """Signs in as whichever tutor the test sets. Tutor 3 to start with."""
    me = Tutor(id=3, user_email="new@example.com", tutor_name="New Tutor", role="Tutor", is_active_tutor=True)
    for dependency in (get_current_user, reject_read_only, require_admin_write):
        app.dependency_overrides[dependency] = lambda: me
    yield me
    for dependency in (get_current_user, reject_read_only, require_admin_write):
        app.dependency_overrides.pop(dependency, None)


@pytest.fixture
def lessons(db_session: Session):
    db_session.add_all([
        Tutor(id=2, user_email="lead@example.com", tutor_name="Lead Tutor", role="Tutor", is_active_tutor=True),
        Tutor(id=3, user_email="new@example.com", tutor_name="New Tutor", role="Tutor", is_active_tutor=True),
        Tutor(id=4, user_email="other@example.com", tutor_name="Other Tutor", role="Tutor", is_active_tutor=True),
        Student(id=1, student_name="Test Student", school_student_id="STU001", grade="F2"),
    ])
    for session_id, tutor_id in ((200, 2), (201, 2), (202, 4)):
        db_session.add(SessionLog(
            id=session_id, student_id=1, tutor_id=tutor_id, session_date=date.today(),
            time_slot="15:00 - 16:30", session_status="Scheduled", location="Main Center",
        ))
    db_session.commit()


def _link(db: Session, until: date | None = None):
    db.add(TutorAssistant(assistant_tutor_id=3, lead_tutor_id=2, effective_until=until))
    db.commit()


def _save_cw(client: TestClient):
    return client.put(
        SAVE_URL,
        json={"exercise_type": "CW", "exercises": [{"exercise_type": "CW", "pdf_name": "C.pdf"}]},
        cookies=AUTH_COOKIE,
    )


def _bulk(client: TestClient, session_ids: list[int]):
    return client.post(
        BULK_URL,
        json={"session_ids": session_ids, "exercise_type": "CW", "pdf_name": "C.pdf"},
        cookies=AUTH_COOKIE,
    )


def _cw_files(db: Session) -> list[tuple[int, str]]:
    db.expire_all()
    return sorted((ex.session_id, ex.pdf_name) for ex in db.query(SessionExercise))


class TestSavingExercises:
    def test_an_assistant_can_add_classwork_to_the_lead_tutors_lesson(self, client, db_session, lessons, signed_in):
        _link(db_session)

        assert _save_cw(client).status_code == 200
        assert _cw_files(db_session) == [(200, "C.pdf")]

    def test_a_tutor_without_a_link_can_prepare_exercises(self, client, db_session, lessons, signed_in):
        assert _save_cw(client).status_code == 200
        assert _cw_files(db_session) == [(200, "C.pdf")]

    def test_a_link_still_works_on_its_last_day(self, client, db_session, lessons, signed_in):
        _link(db_session, until=today_hk())

        assert _save_cw(client).status_code == 200

    def test_an_expired_link_does_not_block_exercise_preparation(self, client, db_session, lessons, signed_in):
        _link(db_session, until=today_hk() - timedelta(days=1))

        assert _save_cw(client).status_code == 200

    def test_the_lead_can_also_prepare_the_assistants_exercises(self, client, db_session, lessons, signed_in):
        _link(db_session)
        db_session.add(SessionLog(
            id=203, student_id=1, tutor_id=3, session_date=date.today(),
            time_slot="15:00 - 16:30", session_status="Scheduled", location="Main Center",
        ))
        db_session.commit()
        signed_in.id = 2

        resp = client.put(
            "/api/sessions/203/exercises",
            json={"exercise_type": "CW", "exercises": [{"exercise_type": "CW", "pdf_name": "C.pdf"}]},
            cookies=AUTH_COOKIE,
        )
        assert resp.status_code == 200
        assert _cw_files(db_session) == [(203, "C.pdf")]

    def test_an_assistant_cannot_rate_the_lesson(self, client, db_session, lessons, signed_in):
        _link(db_session)

        resp = client.patch(
            "/api/sessions/200/rate", json={"performance_rating": "⭐⭐⭐", "notes": "x"}, cookies=AUTH_COOKIE,
        )
        assert resp.status_code == 403
        db_session.expire_all()
        assert db_session.get(SessionLog, 200).performance_rating is None


class TestBulkAssign:
    def test_bulk_assign_allows_another_tutors_lesson(self, client, db_session, lessons, signed_in):
        assert _bulk(client, [200]).status_code == 200
        assert _cw_files(db_session) == [(200, "C.pdf")]

    @pytest.mark.parametrize("role", ["Supervisor", "Guest"])
    def test_read_only_roles_cannot_bulk_assign(self, client, db_session, lessons, signed_in, role):
        app.dependency_overrides.pop(reject_read_only)
        signed_in.role = role
        assert _bulk(client, [200, 202]).status_code == 403
        assert _cw_files(db_session) == []

    def test_an_assistant_can_bulk_assign_to_the_lead_tutors_lessons(self, client, db_session, lessons, signed_in):
        _link(db_session)

        assert _bulk(client, [200, 201]).status_code == 200
        assert _cw_files(db_session) == [(200, "C.pdf"), (201, "C.pdf")]

    def test_bulk_assign_allows_a_mix_of_assisted_and_other_tutors(self, client, db_session, lessons, signed_in):
        _link(db_session)

        resp = _bulk(client, [200, 202])
        assert resp.status_code == 200
        assert _cw_files(db_session) == [(200, "C.pdf"), (202, "C.pdf")]

    def test_an_admin_can_bulk_assign_to_anybody(self, client, db_session, lessons, signed_in):
        signed_in.role = "Admin"

        assert _bulk(client, [200, 202]).status_code == 200


class TestEditingTheLinks:
    @pytest.fixture
    def as_admin(self, db_session, signed_in):
        db_session.add(Tutor(id=99, user_email="admin@example.com", tutor_name="Admin", role="Admin", is_active_tutor=True))
        db_session.commit()
        signed_in.id, signed_in.role, signed_in.user_email = 99, "Admin", "admin@example.com"

    def _put(self, client, assisting):
        return client.put("/api/tutors/3", json={"assisting": assisting}, cookies=AUTH_COOKIE)

    def test_an_admin_sets_up_a_link(self, client, db_session, lessons, as_admin):
        resp = self._put(client, [{"lead_tutor_id": 2, "effective_until": "2026-12-31"}])

        assert resp.status_code == 200, resp.text
        assert resp.json()["assisting"] == [{"lead_tutor_id": 2, "effective_until": "2026-12-31"}]
        row = db_session.query(TutorAssistant).one()
        assert (row.assistant_tutor_id, row.lead_tutor_id, row.created_by) == (3, 2, "admin@example.com")

    def test_saving_the_same_link_again_changes_its_end_date(self, client, db_session, lessons, as_admin):
        _link(db_session)

        resp = self._put(client, [{"lead_tutor_id": 2, "effective_until": "2026-12-31"}])

        assert resp.status_code == 200, resp.text
        db_session.expire_all()
        assert [r.effective_until for r in db_session.query(TutorAssistant)] == [date(2026, 12, 31)]

    def test_an_empty_list_removes_the_link(self, client, db_session, lessons, as_admin):
        _link(db_session)

        assert self._put(client, []).status_code == 200
        db_session.expire_all()
        assert db_session.query(TutorAssistant).count() == 0

    def test_a_link_to_themselves_is_dropped(self, client, db_session, lessons, as_admin):
        resp = self._put(client, [{"lead_tutor_id": 3}, {"lead_tutor_id": 2}])

        assert [row["lead_tutor_id"] for row in resp.json()["assisting"]] == [2]

    def test_an_unknown_lead_tutor_is_refused(self, client, db_session, lessons, as_admin):
        assert self._put(client, [{"lead_tutor_id": 555}]).status_code == 400
