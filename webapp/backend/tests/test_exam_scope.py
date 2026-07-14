"""Unit tests for the exam-scope parser (pure, no DB).

The mini vocabulary mirrors the real shape: MAS chapters carry 人教
positional codes, one HK chapter has only an English name, one extension
concept has no codes at all.
"""
from curriculum.exam_scope import (
    ScopeMatcher,
    apply_stored_rows,
    normalize,
    summarize,
)

CONCEPTS = [
    (1, "Rational Numbers", "有理數", "chapter", "F1"),
    (2, "Integral Expressions", "整式", "chapter", "F1"),
    (3, "Linear Equations in One Unknown", "一元一次方程", "chapter", "F1"),
    (4, "Triangles", "三角形", "chapter", "F2"),
    (5, "Axial Symmetry", "軸對稱", "chapter", "F2"),
    (11, "Linear Function", "一次函數", "chapter", "F2"),
    (6, "Quadratic Equations in One Unknown", "一元二次方程", "chapter", "F3"),
    (7, "Circles", "圓", "chapter", "F3"),
    (8, "Areas and Volumes (III)", None, "chapter", "F3"),
    (10, "Remainder and Factor Theorems (Polynomial Division)",
     "餘式定理與因式定理（多項式除法）", "extension", "F3"),
    (12, "Rates, Ratios and Proportions", None, "chapter", "F2"),
    (13, "Similarity", "相似", "chapter", "F2"),
    (14, "Square Roots and Pythagoras Theorem", None, "chapter", "F2"),
]

ALIASES = [
    (1, "MAS", "701"), (2, "MAS", "702"), (3, "MAS", "703"),
    (4, "MAS", "801"), (5, "MAS", "803"), (11, "MAS", "809"),
    (6, "MAS", "901"), (7, "MAS", "904"),
    (8, "HK_NEW", "908"), (12, "HK_NEW", "801"), (13, "HK_NEW", "810"),
    (14, "HK_NEW", "811"),
]

MATCHER = ScopeMatcher(CONCEPTS, ALIASES)


def _single(description, **kw):
    lines = MATCHER.parse(description, **kw)
    assert len(lines) == 1, lines
    return lines[0]


def test_exact_name_match_zh():
    line = _single("一次函數", series="MAS", grade="F2")
    assert line["concepts"] == [
        {"concept_id": 11, "confidence": 0.9, "channel": "name"}]


def test_simplified_chinese_normalises_to_traditional():
    assert normalize("轴对称") == "軸對稱"
    line = _single("轴对称", series="MAS", grade="F2")
    assert line["concepts"][0]["concept_id"] == 5


def test_mas_chapter_codes_resolve_positionally():
    # 第二十四章 -> 人教 ch24 -> MAS 904 (Chinese numerals included)
    line = _single("第二十四章", series="MAS", grade="F3")
    assert line["concepts"] == [
        {"concept_id": 7, "confidence": 0.8, "channel": "code"}]
    # section numbers carry the chapter: 21.2 -> ch21 -> MAS 901
    line = _single("21.2 配方法解方程式", series="MAS", grade="F3")
    assert line["concepts"][0]["concept_id"] == 6


def test_mas_chapter_range_expands():
    line = _single("Ch 1-3", series="MAS", grade="F1")
    assert [c["concept_id"] for c in line["concepts"]] == [1, 2, 3]
    assert all(c["channel"] == "code" for c in line["concepts"])


def test_code_and_name_agreement_boosts_confidence():
    line = _single("第21章一元二次方程", series="MAS", grade="F3")
    assert line["concepts"] == [
        {"concept_id": 6, "confidence": 0.95, "channel": "code+name"}]


def test_name_wins_code_conflict():
    # 2024 人教 edition renumbers F1: "2.1 有理數的加減法" says ch2 (整式 in
    # the old numbering) but names 有理數 — trust the name.
    line = _single("2.1 有理數的加減法", series="MAS", grade="F1")
    assert line["concepts"] == [
        {"concept_id": 1, "confidence": 0.7, "channel": "name"}]


def test_bare_hk_chapter_codes_stay_unresolved():
    # HK textbook chapter numbers are edition-dependent; never guess.
    line = _single("Ch7", series="HK", grade="F3")
    assert line["concepts"] == []
    assert line["kind"] == "topic"


def test_hk_named_chapter_matches_by_name():
    line = _single("Ch7 Areas and Volumes (III)", series="HK", grade="F3")
    assert line["concepts"][0]["concept_id"] == 8


def test_standalone_publisher_marker_governs_following_lines():
    lines = MATCHER.parse("(人教)\n第21章一元二次方程", grade="F3")
    assert len(lines) == 1
    assert lines[0]["concepts"][0]["concept_id"] == 6
    assert lines[0]["concepts"][0]["confidence"] == 0.95


def test_other_publisher_suppresses_code_channel():
    # 文風 numbering is not 人教's; the code must not fire, the name still may.
    line = _single("(文風)第18.1-18.2章綜合除法", series="MAS", grade="F3")
    assert line["concepts"] == [
        {"concept_id": 10, "confidence": 0.7, "channel": "name"}]


def test_strand_headers_are_labels_not_topics():
    lines = MATCHER.parse("代數:\n一次函數\n幾何", series="MAS", grade="F2")
    kinds = [(l["kind"], [c["concept_id"] for c in l["concepts"]]) for l in lines]
    assert kinds == [("strand", []), ("topic", [11]), ("strand", [])]


def test_strand_prefix_is_stripped_from_inline_lists():
    lines = MATCHER.parse("代數: 一元二次方程, 圓", series="MAS", grade="F3")
    ids = [c["concept_id"] for l in lines for c in l["concepts"]]
    assert ids == [6, 7]


def test_grade_guard_drops_bare_codes_above_event_grade():
    # "CH11" -> 人教 ch11 -> MAS 801 (F2); an F1 event cannot mean that,
    # so the line surfaces as unmatched instead of a wrong suggestion.
    line = _single("CH11", series="MAS", grade="F1")
    assert line["concepts"] == []


def test_noise_lines_and_percent_weights_are_dropped():
    lines = MATCHER.parse("30%\n1.2 有理數及其比較大小 20%", series="MAS", grade="F1")
    assert len(lines) == 1
    assert lines[0]["concepts"][0]["concept_id"] == 1


def test_english_words_containing_ut_are_not_exam_lines():
    # "ut" (unit test) must not fire inside Computation/Absolute/Substitution,
    # which would hide the line from the unmatched list and the AI pass.
    line = _single("Ch1: Basic Computation", grade="F1")
    assert line["kind"] == "topic"
    line = _single("UT1", grade="F1")
    assert line["kind"] == "exam"


def test_pure_section_code_lines_reach_the_code_channel():
    # A comma part that is only section codes ("24.1") is scope, not noise.
    lines = MATCHER.parse("數學測驗: 21.1, 24.1", series="MAS", grade="F3")
    assert len(lines) == 2
    assert lines[1]["concepts"] == [
        {"concept_id": 7, "confidence": 0.8, "channel": "code"}]
    # Without a MAS series the codes cannot resolve, but the line must
    # surface as unmatched for the AI pass instead of vanishing.
    lines = MATCHER.parse("8.1~8.5", grade="F2")
    _, unmatched = summarize(lines)
    assert unmatched == ["8.1~8.5"]


def test_summarize_aggregates_and_reports_unmatched():
    lines = MATCHER.parse(
        "第21章一元二次方程\n圓\n神秘課題\n溫習全部", series="MAS", grade="F3")
    concepts, unmatched = summarize(lines)
    assert set(concepts) == {6, 7}
    assert concepts[6]["confidence"] == 0.95
    # nontopic lines (溫習...) are not "unmatched scope"; unknown topics are
    assert unmatched == ["神秘課題"]


def test_stored_rows_fill_gaps_and_stale_rows_skip():
    description = "神秘課題\n圓"
    lines = MATCHER.parse(description, series="MAS", grade="F3")
    concepts, _ = summarize(lines)
    stored = [
        {"concept_id": 5, "matched_text": "神秘課題", "confidence": 0.75,
         "source": "ai"},
        {"concept_id": 4, "matched_text": "不存在的行", "confidence": 0.9,
         "source": "ai"},
        {"concept_id": 7, "matched_text": "圓", "confidence": 0.6,
         "source": "ai"},
    ]
    merged = apply_stored_rows(concepts, stored, description)
    assert merged[5]["channel"] == "ai"            # gap filled
    assert 4 not in merged                          # stale line skipped
    assert merged[7]["channel"] != "ai"             # mechanical not demoted


def test_ascii_terms_match_whole_words_only():
    # 'ratio' must not fire inside "mensuration" (word-boundary containment)
    line = _single("Ch13 Mensuration", series="HK", grade="F3")
    assert all(c["concept_id"] != 12 for c in line["concepts"])
    line = _single("7.3 Applications of Ratio", series="HK", grade="F2")
    assert line["concepts"][0]["concept_id"] == 12


def test_plus_joined_topics_split_into_both_concepts():
    lines = MATCHER.parse("Similarity + Pythagoras theorem", series="HK", grade="F2")
    ids = [c["concept_id"] for l in lines for c in l["concepts"]]
    assert ids == [13, 14]


def test_html_descriptions_are_stripped_before_parsing():
    lines = MATCHER.parse(
        "<u>圓</u><br><span>第21章一元二次方程</span>", series="MAS", grade="F3")
    ids = [c["concept_id"] for l in lines for c in l["concepts"]]
    assert ids == [7, 6]


def test_manual_rows_override_everything():
    description = "圓"
    lines = MATCHER.parse(description, series="MAS", grade="F3")
    concepts, _ = summarize(lines)
    merged = apply_stored_rows(
        concepts,
        [{"concept_id": 7, "matched_text": "圓", "confidence": 1.0,
          "source": "manual"}],
        description,
    )
    assert merged[7] == {"confidence": 1.0, "channel": "manual", "lines": ["圓"]}
