"""Tests for the demo build script and the ARK stand-in.

The build script runs against the real database, so these only cover the
parts that can go wrong on their own: the fake names, the name-swapping
expression, the path rules and the guard that keeps writes off production.
"""

import asyncio
import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts" / "demo"))

import build_demo  # noqa: E402
from fakes import Faker  # noqa: E402


def test_fakes_keep_the_shape_of_the_real_name():
    f = Faker("test-salt")
    assert len(f.person("Chloe Lau").split()) == 2
    assert len(f.person("Leong Hoi Kei").split()) == 3
    assert len(f.person("Ryan Pun Pak Ieong").split()) == 4
    assert re.search(r"[\u4e00-\u9fff]{3}$", f.person("Scarlett SIO 邵芷姚"))
    assert f.person("Mr Sam Fong").startswith("Mr ")


def test_the_same_real_value_always_gets_the_same_fake():
    assert Faker("s").person("Chloe Lau") == Faker("s").person("Chloe Lau")
    assert Faker("s").person("Chloe Lau") != Faker("other").person("Chloe Lau")


def test_a_fake_never_contains_a_real_name():
    f = Faker("s")
    real = f.person("Chloe Lau")
    g = Faker("s")
    g.avoid = {"person": {" ".join(real.casefold().split())}}
    assert g.person("Chloe Lau") != real


def test_phones_keep_their_prefix_and_first_digit():
    f = Faker("s")
    assert re.fullmatch(r"6\d{7}", f.phone("66724084"))
    assert f.phone("+85362379222").startswith("+8536")
    assert f.phone("66724084") != "66724084"


def test_tutors_get_different_first_names():
    f = Faker("s")
    names = [f.tutor(f"Mr Real{i} Person") for i in range(12)]
    firsts = [n.split()[1] for n in names]
    assert len(set(firsts)) == len(firsts)


def test_two_accounts_for_one_tutor_get_different_emails():
    f = Faker("s")
    name = f.tutor("Mr Kenny Chiu")
    assert f.email("kenny.chiu@a.com", name) != f.email("kenny@b.com", name)


def test_trie_pattern_prefers_the_longest_match():
    words = ["pasco lui", "1263 pasco lui", "chan tai", "chan tai man"]
    pattern = re.compile(rf"(?<![\w@.])(?:{build_demo.trie_pattern(words)})(?![\w@])", re.IGNORECASE)
    found = pattern.findall("Student: 1263 Pasco Lui (F3) and Chan Tai Man, not Chan Taim")
    assert found == ["1263 Pasco Lui", "Chan Tai Man"]


def test_paths_lose_the_names_in_staff_and_student_folders():
    a = build_demo.Anonymiser(None, "s")
    a.real_names = {"alan ng"}
    words = {"Alan", "Matthew", "Jeffrey"}
    staff = a.sanitise_path(r"X:\3. Staff\Jeffrey\F1E PHC-E Matthew\24周目", words)
    assert "Jeffrey" not in staff and "Matthew" not in staff and "PHC-E" in staff
    student = a.sanitise_path(r"Center\missing HW\1043 Alan Ng\1043 Alan Ng 701 HW.pdf", words)
    assert "Alan" not in student and "701 HW.pdf" in student
    course = r"Center\Courseware (Chi)\new_math7-9\701_Basic.mathematics_c.pdf"
    assert a.sanitise_path(course, words) == course


def test_writes_are_refused_outside_the_demo_databases():
    with pytest.raises(SystemExit):
        build_demo.guard_target(build_demo.SOURCE)
    with pytest.raises(SystemExit):
        build_demo.guard_target("csm_db")
    build_demo.guard_target("csm_demo")


def test_the_proxy_asks_the_stand_in_when_the_demo_is_on(monkeypatch):
    from routers import ark_proxy
    from services import ark_demo

    calls = []
    monkeypatch.setattr(ark_demo, "ENABLED", True)
    monkeypatch.setattr(ark_demo, "handle", lambda *a, **k: calls.append((a, k)) or ["answer"])
    result = asyncio.run(ark_proxy._ark_request("GET", "/me/leave-types", "someone@example.com", params={"year": 2026}))
    assert result == ["answer"]
    assert calls[0][0] == ("GET", "/me/leave-types", "someone@example.com")
    assert calls[0][1]["params"] == {"year": 2026}
