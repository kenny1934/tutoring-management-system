"""Tests for student-name similarity used in prospect/application linking."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from utils.name_matching import (
    NAME_CANDIDATE_THRESHOLD,
    name_similarity,
    normalize_name,
)


class TestNormalizeName:
    def test_none_returns_empty(self):
        assert normalize_name(None) == ""

    def test_lowercases_and_trims(self):
        assert normalize_name("  Chan Tai Man  ") == "chan tai man"

    def test_collapses_punctuation(self):
        assert normalize_name("O'Brien, John") == "o brien john"

    def test_preserves_cjk(self):
        assert normalize_name("陳大文") == "陳大文"


class TestNameSimilarity:
    def test_identical_names_score_100(self):
        assert name_similarity("Chan Tai Man", "Chan Tai Man") == 100

    def test_empty_inputs_return_zero(self):
        assert name_similarity(None, "Chan") == 0
        assert name_similarity("Chan", "") == 0

    def test_pure_latin_vs_pure_cjk_returns_zero(self):
        # Different scripts with no overlap — algorithm can't bridge them.
        assert name_similarity("Chan Tai Man", "陳大文") == 0

    def test_word_order_flip_clears_threshold(self):
        # token_sort_ratio handles plain reordering.
        assert name_similarity("Chan Tai Man", "Tai Man Chan") >= NAME_CANDIDATE_THRESHOLD

    def test_real_failure_case_meredith_chan(self):
        """The user-reported miss: compact form of a longer name should match."""
        score = name_similarity("Wong Tai Man Alex", "Alex Wong")
        assert score >= NAME_CANDIDATE_THRESHOLD, f"expected >= 85, got {score}"

    def test_surname_only_does_not_match_full_name(self):
        # "Lam" alone should NOT clear the bar against "Adaliz Lam" — the
        # containment rule requires >= 2 matched tokens.
        assert name_similarity("Lam", "Adaliz Lam") < NAME_CANDIDATE_THRESHOLD

    def test_different_given_names_same_surname_does_not_match(self):
        # Original false-positive guard documented in name_matching.py.
        assert name_similarity("Adaliz Lam", "Kelly Lam") < NAME_CANDIDATE_THRESHOLD

    def test_cjk_side_still_matches_when_latin_does_not(self):
        # Mixed-script prospect vs CJK-only app: CJK side carries the match.
        score = name_similarity("Adaliz LAM 林梓喬", "林梓喬")
        assert score >= NAME_CANDIDATE_THRESHOLD

    def test_containment_requires_at_least_two_matched_tokens(self):
        # Single shared token — even if identical — must not score high.
        score = name_similarity("Chan", "Chan Tai Man")
        assert score < NAME_CANDIDATE_THRESHOLD

    def test_subset_match_three_of_three(self):
        # Three-token shorter name fully contained in a four-token longer name.
        score = name_similarity("Wong Kar Wai Director", "Wong Kar Wai")
        assert score >= NAME_CANDIDATE_THRESHOLD
