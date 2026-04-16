"""Unit tests for Summer discount tier computation.

Covers the payment-aware `qualifies()` rules, tier cascade when a higher
tier is forfeited, group-per-applicant payment gate, and resnap behaviour.
"""
from datetime import date, datetime
from types import SimpleNamespace

import pytest

from utils.summer_discounts import (
    compute_best_discount,
    compute_payment_deadline,
    parse_discounts,
    resnap_enrollment_tier,
    NONE_CODE,
)


# ---------------------------------------------------------------------------
# Helpers for pure compute tests — SimpleNamespace duck-types the ORM shape
# ---------------------------------------------------------------------------

def make_app(**overrides):
    base = dict(
        id=1,
        lessons_paid=8,
        application_status="Paid",
        buddy_joined_at=None,
        buddy_group_id=None,
        paid_at=None,
        submitted_at=datetime(2026, 5, 1),
        config_id=1,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def make_config(discounts, base_fee=1600):
    return SimpleNamespace(
        id=1,
        pricing_config={"base_fee": base_fee, "discounts": discounts},
    )


EB = {
    "code": "EB",
    "name_zh": "早鳥",
    "name_en": "Early Bird",
    "amount": 150,
    "conditions": {"before_date": "2026-06-15"},
}

EB3P = {
    "code": "EB3P",
    "name_zh": "早鳥三人同行",
    "name_en": "Early Bird Group of 3+",
    "amount": 500,
    "conditions": {"before_date": "2026-06-15", "min_group_size": 3},
}

P3 = {
    "code": "3P",
    "name_zh": "三人同行",
    "name_en": "Group of 3+",
    "amount": 300,
    "conditions": {"min_group_size": 3},
}


# ---------------------------------------------------------------------------
# parse_discounts
# ---------------------------------------------------------------------------

class TestParseDiscounts:
    def test_parses_before_date_and_min_group_size(self):
        config = make_config([EB, P3])
        entries = parse_discounts(config)
        assert len(entries) == 2
        assert entries[0].code == "EB"
        assert entries[0].before_date == date(2026, 6, 15)
        assert entries[0].min_group_size is None
        assert entries[1].min_group_size == 3
        assert entries[1].before_date is None

    def test_handles_missing_pricing_config(self):
        config = SimpleNamespace(pricing_config=None)
        assert parse_discounts(config) == []

    def test_handles_malformed_before_date(self):
        bad = {**EB, "conditions": {"before_date": "not-a-date"}}
        entries = parse_discounts(make_config([bad]))
        assert entries[0].before_date is None


# ---------------------------------------------------------------------------
# Solo Early Bird — payment-aware deadline check
# ---------------------------------------------------------------------------

class TestSoloEarlyBird:
    def test_paid_before_deadline_qualifies(self):
        app = make_app(paid_at=datetime(2026, 6, 10))
        r = compute_best_discount(app, [app], [], make_config([EB]), today=date(2026, 6, 20))
        assert r.code == "EB"
        assert r.amount == 150
        assert r.final_fee == 1450

    def test_paid_on_deadline_day_qualifies(self):
        """The deadline is inclusive — paying on Jun 15 with a Jun 15 deadline counts."""
        app = make_app(paid_at=datetime(2026, 6, 15))
        r = compute_best_discount(app, [app], [], make_config([EB]), today=date(2026, 6, 20))
        assert r.code == "EB"

    def test_paid_day_after_deadline_fails(self):
        app = make_app(paid_at=datetime(2026, 6, 16))
        r = compute_best_discount(app, [app], [], make_config([EB]), today=date(2026, 6, 20))
        assert r.code == NONE_CODE
        assert r.amount == 0

    def test_unpaid_before_deadline_still_qualifies(self):
        """Unpaid applicants use `today` as effective — if today is before the
        deadline, they could still pay on time, so the tier qualifies."""
        app = make_app(paid_at=None, application_status="Submitted")
        r = compute_best_discount(app, [app], [], make_config([EB]), today=date(2026, 6, 10))
        assert r.code == "EB"

    def test_unpaid_past_deadline_fails(self):
        app = make_app(paid_at=None, application_status="Submitted")
        r = compute_best_discount(app, [app], [], make_config([EB]), today=date(2026, 6, 16))
        assert r.code == NONE_CODE


# ---------------------------------------------------------------------------
# Tier cascade — forfeited EB falls back to 3P when group qualifies
# ---------------------------------------------------------------------------

class TestTierCascade:
    def _group_of_three(self, paid_at_member_0):
        a = make_app(id=1, buddy_group_id=7, buddy_joined_at=datetime(2026, 5, 1), paid_at=paid_at_member_0)
        b = make_app(id=2, buddy_group_id=7, buddy_joined_at=datetime(2026, 5, 2))
        c = make_app(id=3, buddy_group_id=7, buddy_joined_at=datetime(2026, 5, 3))
        return [a, b, c]

    def test_on_time_payer_keeps_eb3p(self):
        members = self._group_of_three(paid_at_member_0=datetime(2026, 6, 14))
        r = compute_best_discount(members[0], members, [], make_config([EB, EB3P, P3]), today=date(2026, 6, 20))
        assert r.code == "EB3P"
        assert r.amount == 500

    def test_late_payer_drops_to_plain_3p(self):
        """Per-applicant gate: a group member who paid late loses EB3P but
        keeps 3P because the group still has 3 active members."""
        members = self._group_of_three(paid_at_member_0=datetime(2026, 6, 20))
        r = compute_best_discount(members[0], members, [], make_config([EB, EB3P, P3]), today=date(2026, 6, 20))
        assert r.code == "3P"
        assert r.amount == 300

    def test_group_formed_after_deadline_nobody_gets_eb3p(self):
        """Whole-group gate: if the group hits size AFTER the deadline,
        EB3P doesn't apply even to on-time payers."""
        a = make_app(id=1, buddy_group_id=7, buddy_joined_at=datetime(2026, 6, 20), paid_at=datetime(2026, 6, 14))
        b = make_app(id=2, buddy_group_id=7, buddy_joined_at=datetime(2026, 6, 21))
        c = make_app(id=3, buddy_group_id=7, buddy_joined_at=datetime(2026, 6, 22))
        r = compute_best_discount(a, [a, b, c], [], make_config([EB, EB3P, P3]), today=date(2026, 7, 1))
        assert r.code == "3P"

    def test_solo_eb_beats_nothing_when_group_incomplete(self):
        """Only two members → group tiers disqualified, solo EB still applies."""
        a = make_app(id=1, buddy_group_id=7, buddy_joined_at=datetime(2026, 5, 1), paid_at=datetime(2026, 6, 10))
        b = make_app(id=2, buddy_group_id=7, buddy_joined_at=datetime(2026, 5, 2))
        r = compute_best_discount(a, [a, b], [], make_config([EB, EB3P, P3]), today=date(2026, 6, 20))
        assert r.code == "EB"

    def test_picks_highest_amount_when_multiple_qualify(self):
        """If both EB ($150) and EB3P ($500) qualify, EB3P wins."""
        members = self._group_of_three(paid_at_member_0=datetime(2026, 6, 14))
        r = compute_best_discount(members[0], members, [], make_config([EB, EB3P, P3]), today=date(2026, 6, 20))
        assert r.code == "EB3P"


# ---------------------------------------------------------------------------
# Partial-plan apps — always flat rate, ignore all discount logic
# ---------------------------------------------------------------------------

class TestPartialPlan:
    def test_partial_app_gets_flat_rate(self):
        app = make_app(lessons_paid=4)
        r = compute_best_discount(
            app, [app], [],
            make_config([EB, P3], base_fee=1600),
            today=date(2026, 6, 1),
        )
        assert r.code == NONE_CODE
        assert r.final_fee == 4 * 400

    def test_partial_sibling_does_not_inflate_group_count(self):
        full_a = make_app(id=1, buddy_group_id=7, buddy_joined_at=datetime(2026, 5, 1))
        full_b = make_app(id=2, buddy_group_id=7, buddy_joined_at=datetime(2026, 5, 2))
        partial = make_app(id=3, lessons_paid=4, buddy_group_id=7, buddy_joined_at=datetime(2026, 5, 3))
        r = compute_best_discount(full_a, [full_a, full_b, partial], [], make_config([P3]), today=date(2026, 6, 1))
        # Only 2 full-plan members count, so 3P doesn't unlock.
        assert r.code == NONE_CODE


# ---------------------------------------------------------------------------
# compute_payment_deadline — earlier-of(tier deadline, first lesson)
# ---------------------------------------------------------------------------

class TestPaymentDeadline:
    def test_takes_earlier_of_tier_and_first_lesson(self):
        app = make_app(paid_at=datetime(2026, 6, 10))
        discount_result = compute_best_discount(app, [app], [], make_config([EB]), today=date(2026, 6, 10))
        # Tier deadline Jun 15, first lesson Jul 6 → deadline is Jun 15.
        assert compute_payment_deadline(discount_result, date(2026, 7, 6)) == date(2026, 6, 15)

    def test_falls_back_to_first_lesson_when_tier_has_no_deadline(self):
        app = make_app(buddy_group_id=7, buddy_joined_at=datetime(2026, 5, 1))
        b = make_app(id=2, buddy_group_id=7, buddy_joined_at=datetime(2026, 5, 2))
        c = make_app(id=3, buddy_group_id=7, buddy_joined_at=datetime(2026, 5, 3))
        r = compute_best_discount(app, [app, b, c], [], make_config([P3]), today=date(2026, 7, 1))
        assert r.code == "3P"
        assert compute_payment_deadline(r, date(2026, 7, 6)) == date(2026, 7, 6)

    def test_returns_none_when_no_deadline_and_no_first_lesson(self):
        app = make_app()
        r = compute_best_discount(app, [app], [], make_config([P3]), today=date(2026, 6, 1))
        assert compute_payment_deadline(r, None) is None


# ---------------------------------------------------------------------------
# resnap_enrollment_tier — integrates with DB via db_session fixture
# ---------------------------------------------------------------------------

from models import (
    Enrollment,
    Student,
    Tutor,
    SummerCourseConfig,
    SummerApplication,
)


@pytest.fixture
def _tutor(db_session):
    t = Tutor(user_email="t@test.com", tutor_name="T", role="Admin", is_active_tutor=True)
    db_session.add(t)
    db_session.commit()
    return t


@pytest.fixture
def _student(db_session):
    s = Student(student_name="Kid", grade="F1", home_location="MSA")
    db_session.add(s)
    db_session.commit()
    return s


@pytest.fixture
def _config(db_session):
    cfg = SummerCourseConfig(
        year=2026,
        title="Summer 2026",
        application_open_date=datetime(2026, 3, 1),
        application_close_date=datetime(2026, 6, 30),
        course_start_date=date(2026, 7, 6),
        course_end_date=date(2026, 8, 31),
        total_lessons=8,
        pricing_config={"base_fee": 1600, "discounts": [EB, P3]},
        locations=[{"name": "MSA", "open_days": ["Tuesday"]}],
        available_grades=[{"value": "F1"}],
        time_slots=["10:00 - 11:30"],
        is_active=True,
    )
    db_session.add(cfg)
    db_session.commit()
    return cfg


def _make_enrollment(db_session, student, tutor, app, *, code="EB", amount=150):
    e = Enrollment(
        student_id=student.id,
        tutor_id=tutor.id,
        enrollment_type="Summer",
        summer_application_id=app.id,
        payment_status="Pending Payment",
        first_lesson_date=date(2026, 7, 6),
        payment_deadline=date(2026, 6, 15),
        locked_discount_code=code,
        locked_discount_amount=amount,
        fee_message_sent=True,
        lessons_paid=8,
    )
    db_session.add(e)
    db_session.commit()
    return e


class TestResnapEnrollmentTier:
    def test_downgrade_flips_snapshot_and_fee_message_sent(self, db_session, _tutor, _student, _config):
        """Published with EB (paid on time), then paid_at corrected to after
        deadline → tier should drop to NONE, fee_message_sent reset."""
        app = SummerApplication(
            config_id=_config.id, reference_code="A1", student_name="Kid", grade="F1",
            contact_phone="1", application_status="Paid", sessions_per_week=1,
            lessons_paid=8, existing_student_id=_student.id, paid_at=datetime(2026, 6, 10),
        )
        db_session.add(app); db_session.commit()
        e = _make_enrollment(db_session, _student, _tutor, app, code="EB", amount=150)

        # Admin corrects paid_at to after the deadline.
        app.paid_at = datetime(2026, 6, 20)
        changed = resnap_enrollment_tier(db_session, app, today=date(2026, 6, 20))

        assert changed is True
        # resnap mutates the session-attached enrollment directly; caller is
        # expected to commit afterwards. Check against the in-memory state.
        assert e.locked_discount_code == NONE_CODE
        assert e.locked_discount_amount == 0
        assert e.fee_message_sent is False

    def test_no_change_returns_false(self, db_session, _tutor, _student, _config):
        app = SummerApplication(
            config_id=_config.id, reference_code="A2", student_name="Kid", grade="F1",
            contact_phone="1", application_status="Paid", sessions_per_week=1,
            lessons_paid=8, existing_student_id=_student.id, paid_at=datetime(2026, 6, 10),
        )
        db_session.add(app); db_session.commit()
        e = _make_enrollment(db_session, _student, _tutor, app, code="EB", amount=150)

        # Same paid_at, tier unchanged — should be a no-op.
        changed = resnap_enrollment_tier(db_session, app, today=date(2026, 6, 20))
        assert changed is False
        assert e.fee_message_sent is True  # untouched

    def test_override_is_respected(self, db_session, _tutor, _student, _config):
        """Enrollments with an override should not be touched even if the
        computed tier would differ."""
        app = SummerApplication(
            config_id=_config.id, reference_code="A3", student_name="Kid", grade="F1",
            contact_phone="1", application_status="Paid", sessions_per_week=1,
            lessons_paid=8, existing_student_id=_student.id, paid_at=datetime(2026, 6, 20),
        )
        db_session.add(app); db_session.commit()
        e = _make_enrollment(db_session, _student, _tutor, app, code="EB", amount=150)
        e.discount_override_code = "EB"
        e.discount_override_reason = "parent showed bank receipt"
        db_session.commit()

        changed = resnap_enrollment_tier(db_session, app, today=date(2026, 6, 21))
        assert changed is False
        assert e.locked_discount_code == "EB"  # unchanged

    def test_no_enrollment_linked_is_noop(self, db_session, _config, _student):
        app = SummerApplication(
            config_id=_config.id, reference_code="A4", student_name="Kid", grade="F1",
            contact_phone="1", application_status="Paid", sessions_per_week=1,
            lessons_paid=8, existing_student_id=_student.id, paid_at=datetime(2026, 6, 20),
        )
        db_session.add(app); db_session.commit()
        assert resnap_enrollment_tier(db_session, app, today=date(2026, 6, 21)) is False
