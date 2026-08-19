"""Tests for the school alias resolver and the seeded mapping.

The resolver semantics were locked during the mapping review on 2026-08-19:
sections are separate schools, the form's lang_stream picks the section of a
sectioned school, Int sits in the English section unless the target names an
international campus, and an unrecognised spelling resolves to None rather
than a guess.
"""
import os
import re

import pytest
from fastapi import HTTPException

from models import SchoolAlias, Student
from routers.regular_course import create_school_alias, get_school_codes
from schemas import SchoolAliasCreate
from utils.school_alias import (
    clear_cache,
    fold,
    get_alias_map,
    group_key,
    is_valid_target,
    resolve,
)


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


class TestGroupKey:
    """group_key is the composite rule the suggest ranking and the frontend's
    schoolGroupKey both follow: canonical code, else folded spelling, else
    None."""

    ALIASES = {"聖羅撒": "SRL|stream"}

    def test_recognised_spelling_gives_the_code(self):
        assert group_key(" 聖羅撒 ", "C", self.ALIASES) == "SRL-C"

    def test_unmapped_spelling_gives_its_folded_form(self):
        assert group_key("  Mystery   Academy ", "C", self.ALIASES) == "mystery academy"

    def test_empty_gives_none(self):
        assert group_key("", "C", self.ALIASES) is None
        assert group_key(None, None, self.ALIASES) is None


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
        clear_cache()
        assert "tis" in get_alias_map(db_session)


class TestAliasEndpoints:
    def test_create_folds_the_key_and_overwrites_on_repeat(self, db_session):
        row = create_school_alias(
            SchoolAliasCreate(raw="  Mystery   Academy ", target="MYS"),
            _admin=None, db=db_session,
        )
        assert row.alias_key == "mystery academy"
        assert row.target == "MYS"
        # Assigning the same spelling again corrects the target in place.
        create_school_alias(
            SchoolAliasCreate(raw="mystery ACADEMY", target="MYS-E"),
            _admin=None, db=db_session,
        )
        stored = db_session.query(SchoolAlias).all()
        assert [(r.alias_key, r.target) for r in stored] == [("mystery academy", "MYS-E")]
        # The writing process sees its own assignment without waiting out the TTL.
        assert get_alias_map(db_session) == {"mystery academy": "MYS-E"}

    def test_create_rejects_empty_raw_and_bad_target(self, db_session):
        with pytest.raises(HTTPException) as e:
            create_school_alias(SchoolAliasCreate(raw="   ", target="MYS"),
                                _admin=None, db=db_session)
        assert e.value.status_code == 422
        with pytest.raises(HTTPException) as e:
            create_school_alias(SchoolAliasCreate(raw="Mystery", target="MYS|section"),
                                _admin=None, db=db_session)
        assert e.value.status_code == 422

    def test_school_codes_union_of_targets_and_student_records(self, db_session):
        db_session.add_all([
            SchoolAlias(alias_key="聖羅撒", target="SRL|stream"),
            SchoolAlias(alias_key="培正中學", target="PCMS"),
            Student(student_name="A", school="PCMS"),
            Student(student_name="B", school="  KYIS "),
            Student(student_name="C", school=None),
        ])
        db_session.commit()
        assert get_school_codes(_admin=None, db=db_session) == [
            "KYIS", "PCMS", "SRL|stream",
        ]

    def test_assigning_an_alias_refreshes_the_codes_vocabulary(self, db_session):
        # The codes list is cached for a minute; a new assignment must show
        # its target straight away in the same process.
        assert get_school_codes(_admin=None, db=db_session) == []
        create_school_alias(
            SchoolAliasCreate(raw="Mystery Academy", target="MYS"),
            _admin=None, db=db_session,
        )
        assert get_school_codes(_admin=None, db=db_session) == ["MYS"]


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
