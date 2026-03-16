"""
Tests for saved reports CRUD endpoints.

Covers:
- POST /api/students/{id}/saved-reports (create)
- GET /api/students/{id}/saved-reports (list)
- GET /api/saved-reports/{id} (get by id)
- DELETE /api/saved-reports/{id} (delete)
- Auth, validation, auto-label generation
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models import Tutor, Student, SavedReport
from tests.helpers import make_auth_token


def _seed(db_session):
    """Seed a tutor and student."""
    tutor = Tutor(id=1, user_email="t@t.com", tutor_name="Mr T", role="Tutor", default_location="MSA")
    student = Student(id=1, student_name="Alice", grade="F4", school="Test School", home_location="MSA", school_student_id="1001")
    db_session.add_all([tutor, student])
    db_session.commit()


def _sample_report_data(mode="parent"):
    return {
        "student": {"student_name": "Alice", "grade": "F4"},
        "progress": {"student_id": 1, "attendance": {}},
        "config": {
            "mode": mode,
            "dateRangeLabel": "Jan 2026 — Mar 2026",
            "generatedBy": "Mr T",
        },
    }


class TestCreateSavedReport:
    def test_create_returns_id(self, client, db_session):
        _seed(db_session)
        token = make_auth_token(1)
        resp = client.post(
            "/api/students/1/saved-reports",
            json={"report_data": _sample_report_data()},
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert data["student_id"] == 1
        assert data["mode"] == "parent"
        assert data["date_range_label"] == "Jan 2026 — Mar 2026"

    def test_auto_generates_label(self, client, db_session):
        _seed(db_session)
        token = make_auth_token(1)
        resp = client.post(
            "/api/students/1/saved-reports",
            json={"report_data": _sample_report_data()},
            cookies={"access_token": token},
        )
        assert "Parent Report" in resp.json()["label"]
        assert "Jan 2026" in resp.json()["label"]

    def test_custom_label(self, client, db_session):
        _seed(db_session)
        token = make_auth_token(1)
        resp = client.post(
            "/api/students/1/saved-reports",
            json={"report_data": _sample_report_data(), "label": "Mid-year review"},
            cookies={"access_token": token},
        )
        assert resp.json()["label"] == "Mid-year review"

    def test_internal_mode_label(self, client, db_session):
        _seed(db_session)
        token = make_auth_token(1)
        resp = client.post(
            "/api/students/1/saved-reports",
            json={"report_data": _sample_report_data(mode="internal")},
            cookies={"access_token": token},
        )
        assert "Internal Report" in resp.json()["label"]

    def test_nonexistent_student_404(self, client, db_session):
        _seed(db_session)
        token = make_auth_token(1)
        resp = client.post(
            "/api/students/999/saved-reports",
            json={"report_data": _sample_report_data()},
            cookies={"access_token": token},
        )
        assert resp.status_code == 404

    def test_requires_auth(self, client, db_session):
        _seed(db_session)
        resp = client.post("/api/students/1/saved-reports", json={"report_data": {}})
        assert resp.status_code == 401


class TestListSavedReports:
    def test_list_empty(self, client, db_session):
        _seed(db_session)
        token = make_auth_token(1)
        resp = client.get("/api/students/1/saved-reports", cookies={"access_token": token})
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_returns_saved(self, client, db_session):
        _seed(db_session)
        token = make_auth_token(1)
        client.post("/api/students/1/saved-reports", json={"report_data": _sample_report_data()}, cookies={"access_token": token})
        client.post("/api/students/1/saved-reports", json={"report_data": _sample_report_data(mode="internal")}, cookies={"access_token": token})

        resp = client.get("/api/students/1/saved-reports", cookies={"access_token": token})
        assert resp.status_code == 200
        reports = resp.json()
        assert len(reports) == 2
        labels = [r["label"] for r in reports]
        assert any("Parent" in l for l in labels)
        assert any("Internal" in l for l in labels)

    def test_list_excludes_other_students(self, client, db_session):
        _seed(db_session)
        student2 = Student(id=2, student_name="Bob", grade="F5", school="Test", home_location="MSA", school_student_id="1002")
        db_session.add(student2)
        db_session.commit()
        token = make_auth_token(1)

        client.post("/api/students/1/saved-reports", json={"report_data": _sample_report_data()}, cookies={"access_token": token})
        client.post("/api/students/2/saved-reports", json={"report_data": _sample_report_data()}, cookies={"access_token": token})

        resp = client.get("/api/students/1/saved-reports", cookies={"access_token": token})
        assert len(resp.json()) == 1

    def test_list_no_report_data_blob(self, client, db_session):
        """List response should NOT include the large report_data blob."""
        _seed(db_session)
        token = make_auth_token(1)
        client.post("/api/students/1/saved-reports", json={"report_data": _sample_report_data()}, cookies={"access_token": token})

        resp = client.get("/api/students/1/saved-reports", cookies={"access_token": token})
        assert "report_data" not in resp.json()[0]


class TestGetSavedReport:
    def test_get_by_id(self, client, db_session):
        _seed(db_session)
        token = make_auth_token(1)
        create_resp = client.post("/api/students/1/saved-reports", json={"report_data": _sample_report_data()}, cookies={"access_token": token})
        report_id = create_resp.json()["id"]

        resp = client.get(f"/api/saved-reports/{report_id}", cookies={"access_token": token})
        assert resp.status_code == 200
        data = resp.json()
        assert data["report_data"]["config"]["mode"] == "parent"
        assert data["creator_name"] == "Mr T"

    def test_get_nonexistent_404(self, client, db_session):
        _seed(db_session)
        token = make_auth_token(1)
        resp = client.get("/api/saved-reports/999", cookies={"access_token": token})
        assert resp.status_code == 404

    def test_requires_auth(self, client, db_session):
        _seed(db_session)
        resp = client.get("/api/saved-reports/1")
        assert resp.status_code == 401


class TestDeleteSavedReport:
    def test_creator_can_delete(self, client, db_session):
        _seed(db_session)
        token = make_auth_token(1)
        create_resp = client.post("/api/students/1/saved-reports", json={"report_data": _sample_report_data()}, cookies={"access_token": token})
        report_id = create_resp.json()["id"]

        resp = client.delete(f"/api/saved-reports/{report_id}", cookies={"access_token": token})
        assert resp.status_code == 204

        # Verify deleted
        resp = client.get(f"/api/saved-reports/{report_id}", cookies={"access_token": token})
        assert resp.status_code == 404

    def test_non_creator_cannot_delete(self, client, db_session):
        _seed(db_session)
        tutor2 = Tutor(id=2, user_email="t2@t.com", tutor_name="Ms B", role="Tutor", default_location="MSA")
        db_session.add(tutor2)
        db_session.commit()

        token1 = make_auth_token(1)
        create_resp = client.post("/api/students/1/saved-reports", json={"report_data": _sample_report_data()}, cookies={"access_token": token1})
        report_id = create_resp.json()["id"]

        token2 = make_auth_token(2)
        resp = client.delete(f"/api/saved-reports/{report_id}", cookies={"access_token": token2})
        assert resp.status_code == 403

    def test_nonexistent_404(self, client, db_session):
        _seed(db_session)
        token = make_auth_token(1)
        resp = client.delete("/api/saved-reports/999", cookies={"access_token": token})
        assert resp.status_code == 404
