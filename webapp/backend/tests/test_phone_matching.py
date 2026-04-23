"""Tests for phone number normalization used in prospect/application linking."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from utils.phone_matching import normalize_phone


class TestNormalizePhone:
    def test_none_returns_empty(self):
        assert normalize_phone(None) == ""

    def test_empty_string_returns_empty(self):
        assert normalize_phone("") == ""

    def test_no_digits_returns_empty(self):
        assert normalize_phone("   -  ") == ""

    def test_plain_hk_local_number_unchanged(self):
        assert normalize_phone("98765432") == "98765432"

    def test_strips_spaces(self):
        assert normalize_phone("9876 5432") == "98765432"

    def test_strips_dashes_and_parens(self):
        assert normalize_phone("(852) 9876-5432") == "98765432"

    def test_strips_hk_country_code_with_plus(self):
        assert normalize_phone("+85298765432") == "98765432"

    def test_strips_macau_country_code_with_plus(self):
        # Real failure case: user wrote "+853" in front of an HK local number.
        assert normalize_phone("+85398765432") == "98765432"

    def test_strips_hk_country_code_without_plus(self):
        assert normalize_phone("85298765432") == "98765432"

    def test_strips_international_prefix_00852(self):
        assert normalize_phone("0085298765432") == "98765432"

    def test_strips_international_prefix_00853(self):
        assert normalize_phone("0085398765432") == "98765432"

    def test_non_hk_international_left_alone(self):
        # Chinese mobile — 11 digits but 852/853 prefix check fails, so we keep it whole.
        assert normalize_phone("+8613800138000") == "8613800138000"

    def test_uk_number_left_alone(self):
        assert normalize_phone("+442012345678") == "442012345678"

    def test_real_failure_case_matches_prospect_phone2(self):
        """The real user-reported case: app vs prospect phone_2 should collapse to same value."""
        app_phone = "+85398765432"
        prospect_phone_2 = "98765432"
        assert normalize_phone(app_phone) == normalize_phone(prospect_phone_2)
