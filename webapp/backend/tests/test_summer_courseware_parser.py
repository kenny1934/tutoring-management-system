"""Tests for the summer courseware tree parser.

The fixture `summer_courseware_listing_2026.txt` is the REAL 2026 net-drive
tree (relative paths under Finalised\\, filenames only — no student data).
When the courseware team's naming drifts in a future year, reproduce the new
filenames here first, then adjust the parser.
"""

from pathlib import Path

import pytest

from services.summer_courseware_parser import (
    lesson_number_from_code,
    parse_listing,
    split_topic,
)

FIXTURE = Path(__file__).parent / "fixtures" / "summer_courseware_listing_2026.txt"


def parse_paths(paths):
    return parse_listing([(p, None) for p in paths])


@pytest.fixture(scope="module")
def real_tree():
    paths = FIXTURE.read_text(encoding="utf-8").splitlines()
    return parse_paths(paths)


# ============================================================================
# Real 2026 tree — full-listing invariants
# ============================================================================

class TestRealTree:
    def test_total_accounting(self, real_tree):
        # 446 files: 414 teachable PDFs, 28 working files (Raw/Word Files/docx),
        # 4 under F4 (SMSS scheme, out of scope). Nothing unclassified.
        assert real_tree.total_files == 446
        assert len(real_tree.classified) == 414
        assert real_tree.excluded_count == 28
        assert real_tree.skipped_grade_count == 4
        assert real_tree.unclassified == []

    def test_grades_and_chapters(self, real_tree):
        chapters = {}
        for f in real_tree.classified:
            chapters.setdefault(f.grade, set()).add(f.course_code)
        assert chapters == {
            "F1": {f"70{i}" for i in range(1, 9)},
            "F2": {f"80{i}" for i in range(1, 10)} | {"810"},
            "F3": {f"90{i}" for i in range(1, 10)} | {"910"},
        }

    def test_lesson_numbers_follow_modulo_rule(self, real_tree):
        for f in real_tree.classified:
            assert f.lesson_number == int(f.course_code) % 100

    def test_every_chapter_has_complete_core_set(self, real_tree):
        """CW and HW exist in both languages, with answers, for all 28 chapters."""
        core = {}
        for f in real_tree.classified:
            if f.doc_type in ("CW", "HW") and not f.is_parallel:
                core.setdefault((f.grade, f.course_code), set()).add(
                    (f.doc_type, f.lang, f.is_answer)
                )
        assert len(core) == 28
        expected = {
            (dt, lang, ans) for dt in ("CW", "HW") for lang in ("e", "c") for ans in (True, False)
        }
        for key, variants in core.items():
            assert variants == expected, f"incomplete core set for {key}"

    def test_every_chapter_has_parallel_cw_and_hw(self, real_tree):
        parallel = {}
        for f in real_tree.classified:
            if f.is_parallel and not f.is_answer and f.doc_type in ("CW", "HW"):
                parallel.setdefault((f.grade, f.course_code), set()).add(f.doc_type)
        assert len(parallel) == 28
        assert all(v == {"CW", "HW"} for v in parallel.values())

    def test_extra_availability_is_per_language(self, real_tree):
        """Extra material is mostly Chinese-only — 24 chapters _c vs 10 _e."""
        extra_c = {(f.grade, f.course_code) for f in real_tree.classified
                   if f.doc_type == "Extra" and f.lang == "c" and not f.is_answer}
        extra_e = {(f.grade, f.course_code) for f in real_tree.classified
                   if f.doc_type == "Extra" and f.lang == "e" and not f.is_answer}
        assert len(extra_c) == 24
        assert len(extra_e) == 10
        assert extra_e < extra_c  # English Extra never exists without Chinese

    def test_parallel_files_have_no_language(self, real_tree):
        assert all(f.lang is None for f in real_tree.classified if f.is_parallel)
        assert all(f.lang in ("e", "c") for f in real_tree.classified if not f.is_parallel)

    def test_topics_parsed_bilingually(self, real_tree):
        topics = {(f.grade, f.course_code): (f.topic_zh, f.topic_en)
                  for f in real_tree.classified}
        assert topics[("F1", "701")] == ("有理數", "Directed Numbers")
        assert topics[("F2", "808")] == ("勾股定理", "Pythagoras' Theorem")
        assert topics[("F3", "903")] == ("認識二次函數", "Introduction to Quadratic Functions")
        # Every indexed chapter is bilingual in 2026
        assert all(zh and en for zh, en in topics.values())

    def test_answers_and_questions_are_symmetric(self, real_tree):
        """Every teachable PDF has an _ans counterpart and vice versa in 2026."""
        def key(f):
            return (f.grade, f.course_code, f.doc_type, f.lang, f.is_parallel)
        questions = {key(f) for f in real_tree.classified if not f.is_answer}
        answers = {key(f) for f in real_tree.classified if f.is_answer}
        assert questions == answers


# ============================================================================
# Unit cases — one per convention rule / known wrinkle
# ============================================================================

CHAPTER = "F1\\SM701 有理數 Directed Numbers"


def single(paths):
    result = parse_paths(paths)
    assert len(result.classified) == 1, (result.unclassified, result.excluded_count)
    return result.classified[0]


class TestFilePatterns:
    def test_standard_classwork_english(self):
        f = single([f"{CHAPTER}\\SM_701_Directed_Numbers_C_e.pdf"])
        assert (f.doc_type, f.lang, f.is_parallel, f.is_answer) == ("CW", "e", False, False)
        assert f.grade == "F1"
        assert f.course_code == "701"
        assert f.lesson_number == 1

    def test_homework_chinese(self):
        f = single([f"{CHAPTER}\\SM_701_有理數_H_c.pdf"])
        assert (f.doc_type, f.lang) == ("HW", "c")

    def test_space_before_variant_letter(self):
        # Real wrinkle: "SM_702_Directed Numbers_C_e.pdf" — space inside topic.
        f = single(["F1\\SM702 有理數 Directed Numbers\\SM_702_Directed Numbers_C_e.pdf"])
        assert (f.doc_type, f.lang) == ("CW", "e")

    def test_answer_file_in_ans_subfolder(self):
        f = single([f"{CHAPTER}\\Ans\\SM_701_有理數_C_c_ans.pdf"])
        assert f.is_answer and f.doc_type == "CW" and f.lang == "c"

    def test_extra_material(self):
        f = single([f"{CHAPTER}\\Extra\\SM_701_有理數_Extra_c.pdf"])
        assert f.doc_type == "Extra" and f.lang == "c"

    def test_parallel_version(self):
        f = single([f"{CHAPTER}\\Parallel Version\\Parallel-SM_701_有理數_C.pdf"])
        assert f.is_parallel and f.doc_type == "CW" and f.lang is None

    def test_capitalised_answer_suffix(self):
        # Real wrinkle: "SM_801_代數的運算_C_c_Ans.pdf" — capital "Ans".
        f = single(["F2\\SM801 代數的運算 Mixed Operations of Algebra\\Ans\\SM_801_代數的運算_C_c_Ans.pdf"])
        assert f.is_answer and f.doc_type == "CW" and f.lang == "c"

    def test_parallel_answer(self):
        f = single([f"{CHAPTER}\\Ans\\Parallel-SM_701_有理數_H_ans.pdf"])
        assert f.is_parallel and f.is_answer and f.doc_type == "HW"

    def test_forward_slashes_from_browser_scan(self):
        f = single(["F1/SM701 有理數 Directed Numbers/SM_701_有理數_C_c.pdf"])
        assert f.rel_path == f"{CHAPTER}\\SM_701_有理數_C_c.pdf"

    def test_extra_chapter_beyond_lesson_count(self):
        f = single(["F2\\SM810 分式 Algebraic Fractions\\SM_810_分式_C_c.pdf"])
        assert f.lesson_number == 10


class TestExclusionsAndSkips:
    def test_non_pdf_excluded(self):
        result = parse_paths([f"{CHAPTER}\\SM_701_有理數_C_c.docx"])
        assert result.excluded_count == 1 and not result.classified

    def test_raw_and_word_files_subtrees_excluded(self):
        result = parse_paths([
            "F2\\SM803 因式分解 Factorization\\Raw\\Misc\\SM_803\\SM_803_因式分解_C_c.pdf",
            f"{CHAPTER}\\Word Files\\SM_701_有理數_C_c.pdf",
        ])
        assert result.excluded_count == 2 and not result.classified

    def test_non_indexed_grade_skipped_not_flagged(self):
        result = parse_paths([
            "F4\\SMSS05 集合與常用邏輯用語\\SMSS05集合和常用邏輯用語.pdf",
            "F5\\SM1101 whatever Topic\\SM_1101_Topic_C_e.pdf",
        ])
        assert result.skipped_grade_count == 2
        assert not result.unclassified and not result.classified


class TestUnclassified:
    def assert_reason(self, path, fragment):
        result = parse_paths([path])
        assert len(result.unclassified) == 1
        assert fragment in result.unclassified[0].reason

    def test_code_mismatch_between_file_and_folder(self):
        self.assert_reason(f"{CHAPTER}\\SM_804_有理數_C_c.pdf", "doesn't match chapter folder")

    def test_missing_language_suffix(self):
        self.assert_reason(f"{CHAPTER}\\SM_701_有理數_C.pdf", "Missing language suffix")

    def test_unknown_subfolder(self):
        self.assert_reason(f"{CHAPTER}\\Drafts\\SM_701_有理數_C_c.pdf", "Unexpected subfolder")

    def test_nonconforming_chapter_folder(self):
        self.assert_reason("F1\\Chapter One\\SM_701_有理數_C_c.pdf", "Chapter folder")

    def test_nonconforming_filename(self):
        self.assert_reason(f"{CHAPTER}\\summary_notes.pdf", "doesn't match the SM_")

    def test_pdf_outside_chapter_folder(self):
        self.assert_reason("F1\\stray.pdf", "Not inside a grade\\chapter folder")

    def test_unrecognised_top_folder(self):
        self.assert_reason("Archive\\SM701 有理數\\SM_701_有理數_C_c.pdf", "Unrecognised grade")


class TestHelpers:
    def test_split_topic_bilingual(self):
        assert split_topic("有理數 Directed Numbers") == ("有理數", "Directed Numbers")
        assert split_topic("勾股定理 Pythagoras' Theorem") == ("勾股定理", "Pythagoras' Theorem")

    def test_split_topic_chinese_only(self):
        assert split_topic("集合與常用邏輯用語") == ("集合與常用邏輯用語", None)

    def test_lesson_number_from_code(self):
        assert lesson_number_from_code("701") == 1
        assert lesson_number_from_code("810") == 10
        assert lesson_number_from_code("SS05") is None
