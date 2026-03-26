"""
Tests for buddy tracker router.

Covers: PIN auth, CRUD, link/unlink, group lookup, cross-branch sibling validation.
"""
import pytest
from datetime import datetime

from models import SummerBuddyGroup, SummerBuddyMember, SummerCourseConfig, SummerApplication
from utils.rate_limiter import clear_rate_limits

YEAR = datetime.now().year
TEST_PIN = "test-pin-1234"
BRANCH = "MAC"
OTHER_BRANCH = "MCP"
API = "/api/buddy-tracker"


@pytest.fixture(autouse=True)
def setup_pins(monkeypatch):
    """Set test PINs and clear rate limits for every test."""
    import routers.buddy_tracker as bt
    monkeypatch.setitem(bt.BRANCH_PINS, BRANCH, TEST_PIN)
    monkeypatch.setitem(bt.BRANCH_PINS, OTHER_BRANCH, TEST_PIN)
    clear_rate_limits()
    yield
    clear_rate_limits()


def pin_headers(pin=TEST_PIN):
    return {"X-Branch-Pin": pin}


def make_member_data(branch=BRANCH, **overrides):
    data = {
        "student_id": "1001",
        "student_name_en": "Alice Wong",
        "source_branch": branch,
        "year": YEAR,
    }
    data.update(overrides)
    return data


def create_member(client, branch=BRANCH, **overrides):
    """Helper: create a member and return the response JSON."""
    resp = client.post(
        f"{API}/members",
        json=make_member_data(branch=branch, **overrides),
        headers=pin_headers(),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ---- PIN Auth ----

class TestVerifyPin:
    def test_valid(self, client):
        resp = client.post(f"{API}/verify-pin", json={"branch": BRANCH, "pin": TEST_PIN})
        assert resp.status_code == 200
        assert resp.json() == {"valid": True}

    def test_invalid(self, client):
        resp = client.post(f"{API}/verify-pin", json={"branch": BRANCH, "pin": "wrong"})
        assert resp.status_code == 403

    def test_invalid_branch(self, client):
        resp = client.post(f"{API}/verify-pin", json={"branch": "INVALID", "pin": TEST_PIN})
        assert resp.status_code == 400

    def test_endpoints_require_pin(self, client):
        """All data endpoints return 403 without PIN header."""
        assert client.get(f"{API}/members?branch={BRANCH}&year={YEAR}").status_code == 403
        assert client.post(f"{API}/members", json=make_member_data()).status_code == 403
        assert client.patch(f"{API}/members/1?branch={BRANCH}", json={}).status_code == 403
        assert client.delete(f"{API}/members/1?branch={BRANCH}").status_code == 403


# ---- Create Member ----

class TestCreateMember:
    def test_create_solo(self, client):
        data = create_member(client)
        assert data["student_name_en"] == "Alice Wong"
        assert data["buddy_code"].startswith("BG-")
        assert data["group_size"] == 1
        assert data["group_members"] == []
        assert data["source_branch"] == BRANCH

    def test_create_join_group(self, client):
        first = create_member(client, student_id="1001")
        code = first["buddy_code"]
        second = create_member(client, student_id="1002", student_name_en="Bob Lee", buddy_code=code)
        assert second["buddy_code"] == code
        assert second["group_size"] == 2
        assert len(second["group_members"]) == 1
        assert second["group_members"][0]["name"] == "Alice Wong"

    def test_create_invalid_branch(self, client):
        resp = client.post(
            f"{API}/members",
            json=make_member_data(branch="INVALID"),
            headers=pin_headers(),
        )
        assert resp.status_code == 400

    def test_create_buddy_code_wrong_year(self, client, db_session):
        """Buddy code from a different year should not match."""
        old_group = SummerBuddyGroup(config_id=None, year=YEAR - 1, buddy_code="BG-OLD1")
        db_session.add(old_group)
        db_session.commit()

        resp = client.post(
            f"{API}/members",
            json=make_member_data(buddy_code="BG-OLD1"),
            headers=pin_headers(),
        )
        assert resp.status_code == 404

    def test_create_rejects_full_group(self, client):
        """Cannot add a 3rd member to a group that already has 2."""
        a = create_member(client, student_id="1001")
        create_member(client, student_id="1002", student_name_en="Bob Lee", buddy_code=a["buddy_code"])
        resp = client.post(
            f"{API}/members",
            json=make_member_data(student_id="1003", student_name_en="Charlie", buddy_code=a["buddy_code"]),
            headers=pin_headers(),
        )
        assert resp.status_code == 400
        assert "full" in resp.json()["detail"].lower()

    def test_create_rejects_when_secondary_fills_group(self, client, db_session):
        """Group with 1 primary + 1 active secondary application → rejects 3rd member."""
        config = SummerCourseConfig(
            year=YEAR, title="Test", application_open_date=datetime.now(),
            application_close_date=datetime.now(), course_start_date=datetime.now().date(),
            course_end_date=datetime.now().date(), total_lessons=8,
            pricing_config={}, locations=[], available_grades=[], time_slots=[],
        )
        db_session.add(config)
        db_session.flush()

        a = create_member(client, student_id="1001")
        # Add a secondary application to the same group
        app = SummerApplication(
            config_id=config.id, reference_code="SC-TEST1",
            student_name="Secondary Student", grade="P5",
            buddy_group_id=a["buddy_group_id"], application_status="Submitted",
        )
        db_session.add(app)
        db_session.commit()

        resp = client.post(
            f"{API}/members",
            json=make_member_data(student_id="1002", student_name_en="Bob", buddy_code=a["buddy_code"]),
            headers=pin_headers(),
        )
        assert resp.status_code == 400
        assert "full" in resp.json()["detail"].lower()

    def test_create_accepts_when_secondary_is_withdrawn(self, client, db_session):
        """Group with 1 primary + 1 Withdrawn secondary → still accepts."""
        config = SummerCourseConfig(
            year=YEAR, title="Test", application_open_date=datetime.now(),
            application_close_date=datetime.now(), course_start_date=datetime.now().date(),
            course_end_date=datetime.now().date(), total_lessons=8,
            pricing_config={}, locations=[], available_grades=[], time_slots=[],
        )
        db_session.add(config)
        db_session.flush()

        a = create_member(client, student_id="1001")
        app = SummerApplication(
            config_id=config.id, reference_code="SC-TEST2",
            student_name="Withdrawn Student", grade="P5",
            buddy_group_id=a["buddy_group_id"], application_status="Withdrawn",
        )
        db_session.add(app)
        db_session.commit()

        b = create_member(client, student_id="1002", student_name_en="Bob", buddy_code=a["buddy_code"])
        assert b["group_size"] == 2  # withdrawn secondary not counted


# ---- List Members ----

class TestListMembers:
    def test_list_own_branch(self, client):
        create_member(client, student_id="1001")
        create_member(client, student_id="1002", student_name_en="Bob Lee")

        resp = client.get(
            f"{API}/members?branch={BRANCH}&year={YEAR}",
            headers=pin_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        names = {m["student_name_en"] for m in data}
        assert names == {"Alice Wong", "Bob Lee"}

    def test_list_includes_cross_branch_siblings(self, client):
        """Cross-branch member in same group appears in the list."""
        first = create_member(client, branch=BRANCH, student_id="1001")
        code = first["buddy_code"]
        # Other branch joins as sibling
        create_member(
            client, branch=OTHER_BRANCH, student_id="2001",
            student_name_en="Sibling Chen", buddy_code=code, is_sibling=True,
        )

        resp = client.get(
            f"{API}/members?branch={BRANCH}&year={YEAR}",
            headers=pin_headers(),
        )
        data = resp.json()
        branches = {m["source_branch"] for m in data}
        assert OTHER_BRANCH in branches


# ---- Update Member ----

class TestUpdateMember:
    def test_update_name(self, client):
        member = create_member(client)
        resp = client.patch(
            f"{API}/members/{member['id']}?branch={BRANCH}",
            json={"student_name_en": "Alice Updated"},
            headers=pin_headers(),
        )
        assert resp.status_code == 200
        assert resp.json()["student_name_en"] == "Alice Updated"

    def test_update_cross_branch_forbidden(self, client):
        member = create_member(client, branch=OTHER_BRANCH, student_id="2001")
        resp = client.patch(
            f"{API}/members/{member['id']}?branch={BRANCH}",
            json={"student_name_en": "Hacked"},
            headers=pin_headers(),
        )
        assert resp.status_code == 403


# ---- Delete Member ----

class TestDeleteMember:
    def test_delete_member(self, client):
        member = create_member(client)
        resp = client.delete(
            f"{API}/members/{member['id']}?branch={BRANCH}",
            headers=pin_headers(),
        )
        assert resp.status_code == 200
        assert resp.json() == {"deleted": True}

    def test_delete_last_member_cleans_group(self, client, db_session):
        member = create_member(client)
        group_id = member["buddy_group_id"]

        client.delete(
            f"{API}/members/{member['id']}?branch={BRANCH}",
            headers=pin_headers(),
        )
        group = db_session.get(SummerBuddyGroup, group_id)
        assert group is None

    def test_delete_cross_branch_forbidden(self, client):
        member = create_member(client, branch=OTHER_BRANCH, student_id="2001")
        resp = client.delete(
            f"{API}/members/{member['id']}?branch={BRANCH}",
            headers=pin_headers(),
        )
        assert resp.status_code == 403


# ---- Link / Unlink ----

class TestLinkUnlink:
    def test_link_member(self, client, db_session):
        """Link merges two solo members into one group, cleans up old group."""
        a = create_member(client, student_id="1001")
        b = create_member(client, student_id="1002", student_name_en="Bob Lee")
        old_group_id = b["buddy_group_id"]

        resp = client.patch(
            f"{API}/members/{b['id']}/link?branch={BRANCH}",
            json={"buddy_code": a["buddy_code"]},
            headers=pin_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["buddy_code"] == a["buddy_code"]
        assert data["group_size"] == 2

        # Old empty group should be cleaned up
        assert db_session.get(SummerBuddyGroup, old_group_id) is None

    def test_link_rejects_full_group(self, client):
        """Cannot link a member into a group that already has 2 members."""
        a = create_member(client, student_id="1001")
        create_member(client, student_id="1002", student_name_en="Bob Lee", buddy_code=a["buddy_code"])
        c = create_member(client, student_id="1003", student_name_en="Charlie")

        resp = client.patch(
            f"{API}/members/{c['id']}/link?branch={BRANCH}",
            json={"buddy_code": a["buddy_code"]},
            headers=pin_headers(),
        )
        assert resp.status_code == 400
        assert "full" in resp.json()["detail"].lower()

    def test_link_rejects_when_secondary_fills_group(self, client, db_session):
        """Group with 1 primary + 1 active secondary application → link rejected."""
        config = SummerCourseConfig(
            year=YEAR, title="Test", application_open_date=datetime.now(),
            application_close_date=datetime.now(), course_start_date=datetime.now().date(),
            course_end_date=datetime.now().date(), total_lessons=8,
            pricing_config={}, locations=[], available_grades=[], time_slots=[],
        )
        db_session.add(config)
        db_session.flush()

        a = create_member(client, student_id="1001")
        app = SummerApplication(
            config_id=config.id, reference_code="SC-LINK1",
            student_name="Secondary Student", grade="P5",
            buddy_group_id=a["buddy_group_id"], application_status="Submitted",
        )
        db_session.add(app)
        db_session.commit()

        b = create_member(client, student_id="1002", student_name_en="Bob")
        resp = client.patch(
            f"{API}/members/{b['id']}/link?branch={BRANCH}",
            json={"buddy_code": a["buddy_code"]},
            headers=pin_headers(),
        )
        assert resp.status_code == 400
        assert "full" in resp.json()["detail"].lower()

    def test_link_wrong_year(self, client, db_session):
        member = create_member(client)
        old_group = SummerBuddyGroup(config_id=None, year=YEAR - 1, buddy_code="BG-OLD2")
        db_session.add(old_group)
        db_session.commit()

        resp = client.patch(
            f"{API}/members/{member['id']}/link?branch={BRANCH}",
            json={"buddy_code": "BG-OLD2"},
            headers=pin_headers(),
        )
        assert resp.status_code == 404

    def test_link_already_in_group(self, client):
        member = create_member(client)
        resp = client.patch(
            f"{API}/members/{member['id']}/link?branch={BRANCH}",
            json={"buddy_code": member["buddy_code"]},
            headers=pin_headers(),
        )
        assert resp.status_code == 400
        assert "Already" in resp.json()["detail"]

    def test_link_cross_branch_requires_sibling(self, client):
        """Cross-branch link without is_sibling flag returns CROSS_BRANCH_SIBLING_REQUIRED."""
        mac_member = create_member(client, branch=BRANCH, student_id="1001")
        mcp_member = create_member(client, branch=OTHER_BRANCH, student_id="2001", student_name_en="Other")

        resp = client.patch(
            f"{API}/members/{mcp_member['id']}/link?branch={OTHER_BRANCH}",
            json={"buddy_code": mac_member["buddy_code"], "is_sibling": False},
            headers=pin_headers(),
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert detail["code"] == "CROSS_BRANCH_SIBLING_REQUIRED"

    def test_unlink_member(self, client):
        """Unlink gives member a new solo group; original group keeps the other member."""
        a = create_member(client, student_id="1001")
        b = create_member(client, student_id="1002", student_name_en="Bob Lee", buddy_code=a["buddy_code"])

        resp = client.patch(
            f"{API}/members/{b['id']}/unlink?branch={BRANCH}",
            headers=pin_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["group_size"] == 1
        assert data["buddy_code"] != a["buddy_code"]


# ---- Group Lookup ----

class TestGroupLookup:
    def test_lookup_group(self, client):
        member = create_member(client)
        resp = client.get(
            f"{API}/groups/{member['buddy_code']}?branch={BRANCH}",
            headers=pin_headers(),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["buddy_code"] == member["buddy_code"]
        assert data["total_size"] == 1

    def test_lookup_strips_cross_branch_student_id(self, client):
        """Cross-branch members should have student_id=None in lookup response."""
        mac = create_member(client, branch=BRANCH, student_id="1001")
        create_member(
            client, branch=OTHER_BRANCH, student_id="2001",
            student_name_en="Sibling", buddy_code=mac["buddy_code"], is_sibling=True,
        )

        # Look up from MAC — MCP member should have student_id stripped
        resp = client.get(
            f"{API}/groups/{mac['buddy_code']}?branch={BRANCH}",
            headers=pin_headers(),
        )
        data = resp.json()
        assert data["total_size"] == 2
        for m in data["members"]:
            if m["branch"] == OTHER_BRANCH:
                assert m["student_id"] is None
            else:
                assert m["student_id"] == "1001"

    def test_lookup_wrong_code(self, client):
        resp = client.get(
            f"{API}/groups/BG-XXXX?branch={BRANCH}",
            headers=pin_headers(),
        )
        assert resp.status_code == 404
