"""Tests for the regular-course seasonal offer (utils/regular_promo.py).

The rules that cost money if wrong: when the offer is advertised, and who
qualifies. Both are exercised here against plain stand-ins rather than DB rows,
so the logic stays testable without fixtures.
"""

from datetime import date
from types import SimpleNamespace

import pytest

from utils.regular_promo import (
    NEW_STUDENT_ORIGIN,
    application_promo,
    intake_charges_registration_fee,
    intake_registration_fee,
    is_verified_new,
    parse_promo,
    promo_active,
    promo_for_code,
    promo_message_fields,
)


PROMO_JSON = {
    "code": "26BTSSA",
    "name_zh": "2026 中學教室 Back to School 新生優惠",
    "name_en": "2026 Secondary Academy Back to School New Student Offer",
    "short_name_zh": "2026 Back to School 新生優惠",
    "short_name_en": "2026 Back to School new student offer",
    "total_value": 400,
    "tuition_amount": 300,
    "waives_registration_fee": True,
    "from_date": "2026-08-12",
    "until_date": None,
    "discount_id": 7,
}


def config_with(promo=PROMO_JSON, **pricing):
    pricing_config = {"base_fee": 2400, "lessons_per_block": 6, **pricing}
    if promo is not None:
        pricing_config["promo"] = promo
    return SimpleNamespace(pricing_config=pricing_config)


def app_with(origin):
    return SimpleNamespace(verified_branch_origin=origin)


class TestParsePromo:
    def test_reads_every_field(self):
        promo = parse_promo(config_with())
        assert promo.code == "26BTSSA"
        assert promo.total_value == 400
        assert promo.tuition_amount == 300
        assert promo.discount_id == 7
        assert promo.waives_registration_fee is True
        assert promo.from_date == date(2026, 8, 12)
        assert promo.until_date is None

    def test_absent_promo_is_none(self):
        assert parse_promo(config_with(promo=None)) is None
        assert parse_promo(SimpleNamespace(pricing_config=None)) is None
        assert parse_promo(None) is None

    def test_promo_without_a_code_is_treated_as_absent(self):
        """A code is what goes on the receipt, so an entry lacking one is a
        half-filled config rather than a live offer."""
        assert parse_promo(config_with({**PROMO_JSON, "code": "  "})) is None

    def test_short_name_falls_back_to_the_full_name(self):
        promo = parse_promo(
            config_with({k: v for k, v in PROMO_JSON.items() if not k.startswith("short_")})
        )
        assert promo.short_name_zh == PROMO_JSON["name_zh"]
        assert promo.short_name_en == PROMO_JSON["name_en"]

    def test_unparseable_dates_become_unbounded_rather_than_crashing(self):
        promo = parse_promo(config_with({**PROMO_JSON, "from_date": "not-a-date"}))
        assert promo.from_date is None


class TestPromoActive:
    @pytest.mark.parametrize("day, expected", [
        (date(2026, 8, 11), False),   # campaign has not launched
        (date(2026, 8, 12), True),    # launch day is inclusive
        (date(2026, 9, 30), True),    # no end date means it keeps running
    ])
    def test_start_date_gates_the_offer(self, day, expected):
        assert promo_active(parse_promo(config_with()), day) is expected

    def test_end_date_is_inclusive(self):
        promo = parse_promo(config_with({**PROMO_JSON, "until_date": "2026-09-30"}))
        assert promo_active(promo, date(2026, 9, 30)) is True
        assert promo_active(promo, date(2026, 10, 1)) is False

    def test_no_promo_is_never_active(self):
        assert promo_active(None, date(2026, 8, 20)) is False


class TestEligibility:
    def test_only_a_verified_new_origin_qualifies(self):
        assert is_verified_new(app_with(NEW_STUDENT_ORIGIN)) is True
        assert is_verified_new(app_with("MSA")) is False
        assert is_verified_new(app_with("MTA")) is False

    def test_unverified_is_not_eligible(self):
        """Silence is not a yes: an application nobody has checked must not
        collect a new-student offer on its own."""
        assert is_verified_new(app_with(None)) is False
        assert is_verified_new(app_with("")) is False

    def test_application_promo_needs_both_window_and_verification(self):
        config = config_with()
        new, returning = app_with(NEW_STUDENT_ORIGIN), app_with("MSA")

        assert application_promo(new, config, date(2026, 8, 20)) is not None
        # Right person, wrong day.
        assert application_promo(new, config, date(2026, 8, 1)) is None
        # Right day, wrong person.
        assert application_promo(returning, config, date(2026, 8, 20)) is None


class TestPromoForCode:
    def test_matching_code_resolves(self):
        assert promo_for_code(config_with(), "26BTSSA").code == "26BTSSA"

    def test_code_from_a_retired_offer_does_not_resolve(self):
        """A config that has moved on should not have its current offer quoted
        against an enrollment sold under the previous one."""
        assert promo_for_code(config_with(), "25BTSSA") is None

    def test_no_code_is_none(self):
        assert promo_for_code(config_with(), None) is None

    def test_ignores_the_window(self):
        """A published enrollment keeps its offer in the fee message after the
        campaign ends — it describes what was charged, not what is on sale."""
        promo = promo_for_code(config_with({**PROMO_JSON, "until_date": "2026-08-31"}), "26BTSSA")
        assert promo is not None


class TestIntakeRegistrationFee:
    def test_charged_by_default(self):
        """Absent means charged, so no existing config changes behaviour."""
        assert intake_charges_registration_fee(config_with()) is True
        assert intake_charges_registration_fee(None) is True

    def test_an_intake_can_decline_to_collect_it(self):
        cfg = config_with(registration_fee_charged=False)
        assert intake_charges_registration_fee(cfg) is False

    def test_the_standard_fee_is_still_readable_when_not_collected(self):
        """The offer quotes it, so it must survive the intake opting out."""
        cfg = config_with(registration_fee=100, registration_fee_charged=False)
        assert intake_registration_fee(cfg) == 100


class TestPromoMessageFields:
    def test_hands_the_formatter_the_short_name(self):
        fields = promo_message_fields(parse_promo(config_with()), 100)
        assert fields == {
            "name_zh": "2026 Back to School 新生優惠",
            "name_en": "2026 Back to School new student offer",
            "total_value": 400,
            "waived_fee": 100,
        }

    def test_an_offer_that_waives_nothing_quotes_no_fee(self):
        promo = parse_promo(config_with({**PROMO_JSON, "waives_registration_fee": False}))
        assert promo_message_fields(promo, 100)["waived_fee"] == 0

    def test_none_promo_yields_none(self):
        assert promo_message_fields(None, 100) is None
