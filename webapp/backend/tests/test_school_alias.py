"""Tests for the school alias resolver and the seeded mapping.

The resolver semantics were locked during the mapping review on 2026-08-19:
sections are separate schools, the form's lang_stream picks the section of a
sectioned school, Int sits in the English section unless the target names an
international campus, and an unrecognised spelling resolves to None rather
than a guess.
"""
import os
import re

from models import SchoolAlias
from utils.school_alias import _cache, fold, get_alias_map, is_valid_target, resolve


class TestFold:
    def test_trims_and_collapses_and_casefolds(self):
        assert fold("  Pui  Ching   Middle School ") == "pui ching middle school"

    def test_swallows_full_width_spaces(self):
        # Real answers arrive with ideographic spaces; they fold away the same
        # as ASCII ones.
        assert fold("培正中學　（路環校部）") == fold("培正中學 （路環校部）")

    def test_empty_and_none(self):
        assert fold(None) == ""
        assert fold("   ") == ""


class TestIsValidTarget:
    def test_accepts_the_three_forms(self):
        assert is_valid_target("PCMS")
        assert is_valid_target("嶺南中學")
        assert is_valid_target("SRL|stream")
        assert is_valid_target("KYS|int:KYIS")

    def test_rejects_malformed(self):
        assert not is_valid_target("")
        assert not is_valid_target("|stream")
        assert not is_valid_target("SRL|")
        assert not is_valid_target("SRL|section")
        assert not is_valid_target("KYS|int:")
        assert not is_valid_target("A|stream|extra")
        assert not is_valid_target("X" * 65)


class TestResolve:
    ALIASES = {
        "培正中學": "PCMS",
        "聖羅撒": "SRL|stream",
        "教業中學": "KYS|int:KYIS",
    }

    def test_plain_code_ignores_stream(self):
        for stream in ("C", "E", "Int", None):
            assert resolve("培正中學", stream, self.ALIASES) == "PCMS"

    def test_stream_target_picks_the_section(self):
        assert resolve("聖羅撒", "C", self.ALIASES) == "SRL-C"
        assert resolve("聖羅撒", "E", self.ALIASES) == "SRL-E"
        # International families at sectioned schools sit in the English section.
        assert resolve("聖羅撒", "Int", self.ALIASES) == "SRL-E"

    def test_stream_target_without_a_stream_gives_the_family(self):
        assert resolve("聖羅撒", None, self.ALIASES) == "SRL"
        assert resolve("聖羅撒", "  ", self.ALIASES) == "SRL"

    def test_int_override(self):
        assert resolve("教業中學", "Int", self.ALIASES) == "KYIS"
        assert resolve("教業中學", "C", self.ALIASES) == "KYS"
        assert resolve("教業中學", None, self.ALIASES) == "KYS"

    def test_input_is_folded_before_lookup(self):
        assert resolve("  聖羅撒 ", "C", self.ALIASES) == "SRL-C"
        assert resolve("培正中學　", None, {"培正中學": "PCMS"}) == "PCMS"

    def test_unmapped_and_empty_resolve_to_none(self):
        assert resolve("神秘書院", "C", self.ALIASES) is None
        assert resolve("", "C", self.ALIASES) is None
        assert resolve(None, None, self.ALIASES) is None

    def test_uninterpretable_modifier_degrades_to_the_family(self):
        # Cannot arrive through the seed or the endpoint, but the family code
        # is still the school if it ever does.
        assert resolve("聖羅撒", "C", {"聖羅撒": "SRL|section"}) == "SRL"


class TestGetAliasMap:
    def test_reads_the_table(self, db_session):
        db_session.add(SchoolAlias(alias_key="培正中學", target="PCMS"))
        db_session.commit()
        assert get_alias_map(db_session) == {"培正中學": "PCMS"}

    def test_holds_the_map_until_cleared(self, db_session):
        db_session.add(SchoolAlias(alias_key="培正中學", target="PCMS"))
        db_session.commit()
        first = get_alias_map(db_session)
        db_session.add(SchoolAlias(alias_key="tis", target="TIS"))
        db_session.commit()
        # A minute of staleness is by design; the same map comes back.
        assert get_alias_map(db_session) is first
        _cache.clear()
        assert "tis" in get_alias_map(db_session)


class TestSeedMigration:
    """The migration SQL is the durable in-repo copy of the approved mapping,
    so its rows are checked here rather than the gitignored seed JSON."""

    def _rows(self):
        path = os.path.join(
            os.path.dirname(__file__), "..", "..", "..",
            "database", "migrations", "164_school_aliases.sql",
        )
        with open(path, encoding="utf-8") as f:
            sql = f.read()
        return re.findall(r"^\('(.+)', '(.+)'\),?;?$", sql, flags=re.MULTILINE)

    def test_every_row_parses_and_folds_stably(self):
        rows = self._rows()
        assert len(rows) == 262
        keys = [k for k, _ in rows]
        assert len(set(keys)) == len(keys), "duplicate alias keys"
        for key, target in rows:
            assert fold(key) == key, f"key not stored folded: {key!r}"
            assert is_valid_target(target), f"unparseable target: {target!r}"
