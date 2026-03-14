"""
Tests for report shares endpoints.

Covers:
- Create share (POST /api/report-shares)
- View share (GET /api/report-shares/{token})
- Revoke share (DELETE /api/report-shares/{token})
- Dedup logic (reuse recent share for same student)
- Expired share returns 404
- Sensitive field stripping
- mode=internal rejection
"""
import pytest
from datetime import datetime, timedelta
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from models import Tutor, ReportShare
from tests.helpers import make_auth_token


def _sample_report_data(student_name: str = "Test Student") -> dict:
    return {
        "student": {
            "student_name": student_name,
            "grade": "F4",
            "school": "Test School",
            "phone": "12345678",
            "id": 99,
            "home_location": "MSA",
        },
        "config": {"mode": "parent"},
        "progress": {"attendance": {"attended": 10}},
    }


class TestCreateReportShare:
    """POST /api/report-shares"""

    def _create_tutor(self, db_session, tutor_id: int = 1) -> Tutor:
        tutor = Tutor(
            id=tutor_id,
            user_email="tutor@test.com",
            tutor_name="Test Tutor",
            role="Tutor",
            default_location="MSA",
        )
        db_session.add(tutor)
        db_session.commit()
        return tutor

    def test_create_share_returns_token(self, client, db_session):
        """Should return a token and expiry date."""
        self._create_tutor(db_session)
        token = make_auth_token(1)

        resp = client.post(
            "/api/report-shares",
            json={"report_data": _sample_report_data()},
            cookies={"access_token": token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert "expires_at" in data
        assert len(data["token"]) == 36  # UUID format

    def test_strips_sensitive_fields(self, client, db_session):
        """Sensitive student fields (id, phone, home_location, etc.) should be stripped."""
        self._create_tutor(db_session)
        token = make_auth_token(1)

        report_data = _sample_report_data()
        report_data["student"]["contacts"] = [{"phone": "999"}]
        report_data["student"]["is_staff_referral"] = True
        report_data["student"]["staff_referral_notes"] = "secret"

        resp = client.post(
            "/api/report-shares",
            json={"report_data": report_data},
            cookies={"access_token": token},
        )
        assert resp.status_code == 200

        # Verify stored data has sensitive fields stripped
        share = db_session.query(ReportShare).first()
        student_data = share.report_data["student"]
        assert "id" not in student_data
        assert "phone" not in student_data
        assert "home_location" not in student_data
        assert "contacts" not in student_data
        assert "is_staff_referral" not in student_data
        assert "staff_referral_notes" not in student_data
        # Non-sensitive fields preserved
        assert student_data["student_name"] == "Test Student"
        assert student_data["grade"] == "F4"

    def test_rejects_internal_mode(self, client, db_session):
        """mode=internal should be rejected with 400."""
        self._create_tutor(db_session)
        token = make_auth_token(1)

        report_data = _sample_report_data()
        report_data["config"]["mode"] = "internal"

        resp = client.post(
            "/api/report-shares",
            json={"report_data": report_data},
            cookies={"access_token": token},
        )
        assert resp.status_code == 400
        assert "internal" in resp.json()["detail"].lower()

    def test_dedup_reuses_recent_share_by_student_id(self, client, db_session):
        """Creating two shares for the same student_id within 5 min should return same token."""
        self._create_tutor(db_session)
        token = make_auth_token(1)

        payload = {
            "report_data": _sample_report_data(),
            "student_id": 42,
        }

        resp1 = client.post("/api/report-shares", json=payload, cookies={"access_token": token})
        resp2 = client.post("/api/report-shares", json=payload, cookies={"access_token": token})

        assert resp1.status_code == 200
        assert resp2.status_code == 200
        assert resp1.json()["token"] == resp2.json()["token"]

    def test_dedup_reuses_by_student_name_fallback(self, client, db_session):
        """Dedup should fall back to student_name match when no student_id."""
        self._create_tutor(db_session)
        token = make_auth_token(1)

        payload = {"report_data": _sample_report_data("Alice")}

        resp1 = client.post("/api/report-shares", json=payload, cookies={"access_token": token})
        resp2 = client.post("/api/report-shares", json=payload, cookies={"access_token": token})

        assert resp1.json()["token"] == resp2.json()["token"]

    def test_different_students_get_different_tokens(self, client, db_session):
        """Different student_ids should not be deduped."""
        self._create_tutor(db_session)
        token = make_auth_token(1)

        resp1 = client.post(
            "/api/report-shares",
            json={"report_data": _sample_report_data(), "student_id": 1},
            cookies={"access_token": token},
        )
        resp2 = client.post(
            "/api/report-shares",
            json={"report_data": _sample_report_data(), "student_id": 2},
            cookies={"access_token": token},
        )

        assert resp1.json()["token"] != resp2.json()["token"]

    def test_stores_student_id(self, client, db_session):
        """student_id from request should be stored on the share."""
        self._create_tutor(db_session)
        token = make_auth_token(1)

        resp = client.post(
            "/api/report-shares",
            json={"report_data": _sample_report_data(), "student_id": 77},
            cookies={"access_token": token},
        )
        assert resp.status_code == 200

        share = db_session.query(ReportShare).first()
        assert share.student_id == 77

    def test_expiry_clamped_to_max(self, client, db_session):
        """expires_in_days > 90 should be clamped to 90."""
        self._create_tutor(db_session)
        token = make_auth_token(1)

        resp = client.post(
            "/api/report-shares",
            json={"report_data": _sample_report_data(), "expires_in_days": 365},
            cookies={"access_token": token},
        )
        assert resp.status_code == 200

        share = db_session.query(ReportShare).first()
        delta = share.expires_at - share.created_at
        assert delta.days <= 91  # 90 days + some seconds

    def test_requires_auth(self, client, db_session):
        """Should return 401 without auth cookie."""
        resp = client.post(
            "/api/report-shares",
            json={"report_data": _sample_report_data()},
        )
        assert resp.status_code == 401


class TestViewReportShare:
    """GET /api/report-shares/{token}"""

    def _seed_share(self, db_session, **overrides) -> ReportShare:
        defaults = dict(
            token="test-token-123",
            report_data=_sample_report_data(),
            created_by=1,
            expires_at=datetime.utcnow() + timedelta(days=30),
            view_count=0,
        )
        defaults.update(overrides)
        tutor = db_session.query(Tutor).first()
        if not tutor:
            tutor = Tutor(
                id=1, user_email="t@t.com", tutor_name="T", role="Tutor", default_location="MSA",
            )
            db_session.add(tutor)
        share = ReportShare(**defaults)
        db_session.add(share)
        db_session.commit()
        return share

    def test_view_share_returns_data(self, client, db_session):
        """Should return report_data, created_at, expires_at."""
        share = self._seed_share(db_session)

        resp = client.get(f"/api/report-shares/{share.token}")
        assert resp.status_code == 200
        data = resp.json()
        assert "report_data" in data
        assert "created_at" in data
        assert "expires_at" in data
        assert data["report_data"]["student"]["student_name"] == "Test Student"

    def test_view_increments_count(self, client, db_session):
        """Each view should increment view_count."""
        share = self._seed_share(db_session)

        client.get(f"/api/report-shares/{share.token}")
        client.get(f"/api/report-shares/{share.token}")

        db_session.refresh(share)
        assert share.view_count == 2

    def test_expired_share_returns_404(self, client, db_session):
        """An expired share should return 404."""
        share = self._seed_share(
            db_session,
            expires_at=datetime.utcnow() - timedelta(days=1),
        )

        resp = client.get(f"/api/report-shares/{share.token}")
        assert resp.status_code == 404

    def test_revoked_share_returns_404(self, client, db_session):
        """A revoked share should return 404."""
        share = self._seed_share(
            db_session,
            revoked_at=datetime.utcnow(),
        )

        resp = client.get(f"/api/report-shares/{share.token}")
        assert resp.status_code == 404

    def test_nonexistent_token_returns_404(self, client, db_session):
        resp = client.get("/api/report-shares/does-not-exist")
        assert resp.status_code == 404

    def test_no_auth_required(self, client, db_session):
        """View endpoint is public — no auth cookie needed."""
        share = self._seed_share(db_session)
        resp = client.get(f"/api/report-shares/{share.token}")
        assert resp.status_code == 200


class TestRevokeReportShare:
    """DELETE /api/report-shares/{token}"""

    def _setup(self, db_session, tutor_id: int = 1) -> tuple[Tutor, ReportShare]:
        tutor = Tutor(
            id=tutor_id, user_email="t@t.com", tutor_name="T",
            role="Tutor", default_location="MSA",
        )
        db_session.add(tutor)
        share = ReportShare(
            token="revoke-me",
            report_data=_sample_report_data(),
            created_by=tutor_id,
            expires_at=datetime.utcnow() + timedelta(days=30),
            view_count=0,
        )
        db_session.add(share)
        db_session.commit()
        return tutor, share

    def test_creator_can_revoke(self, client, db_session):
        """The creator should be able to revoke their own share."""
        tutor, share = self._setup(db_session)
        token = make_auth_token(tutor.id)

        resp = client.delete(
            f"/api/report-shares/{share.token}",
            cookies={"access_token": token},
        )
        assert resp.status_code == 204

        db_session.refresh(share)
        assert share.revoked_at is not None

    def test_revoked_share_no_longer_viewable(self, client, db_session):
        """After revocation, the share should return 404 on view."""
        tutor, share = self._setup(db_session)
        token = make_auth_token(tutor.id)

        client.delete(f"/api/report-shares/{share.token}", cookies={"access_token": token})

        resp = client.get(f"/api/report-shares/{share.token}")
        assert resp.status_code == 404

    def test_non_creator_cannot_revoke(self, client, db_session):
        """A different tutor (non-admin) should get 403."""
        _, share = self._setup(db_session, tutor_id=1)
        # Create a second tutor
        other = Tutor(
            id=2, user_email="other@t.com", tutor_name="Other",
            role="Tutor", default_location="MSA",
        )
        db_session.add(other)
        db_session.commit()

        token = make_auth_token(2)
        resp = client.delete(
            f"/api/report-shares/{share.token}",
            cookies={"access_token": token},
        )
        assert resp.status_code == 403

    def test_admin_can_revoke_others_share(self, client, db_session):
        """An admin should be able to revoke anyone's share."""
        _, share = self._setup(db_session, tutor_id=1)
        admin = Tutor(
            id=2, user_email="admin@t.com", tutor_name="Admin",
            role="admin", default_location="MSA",
        )
        db_session.add(admin)
        db_session.commit()

        token = make_auth_token(2)
        resp = client.delete(
            f"/api/report-shares/{share.token}",
            cookies={"access_token": token},
        )
        assert resp.status_code == 204

    def test_revoke_nonexistent_returns_404(self, client, db_session):
        tutor = Tutor(
            id=1, user_email="t@t.com", tutor_name="T",
            role="Tutor", default_location="MSA",
        )
        db_session.add(tutor)
        db_session.commit()

        token = make_auth_token(1)
        resp = client.delete(
            "/api/report-shares/no-such-token",
            cookies={"access_token": token},
        )
        assert resp.status_code == 404

    def test_requires_auth(self, client, db_session):
        """Should return 401 without auth cookie."""
        resp = client.delete("/api/report-shares/some-token")
        assert resp.status_code == 401
