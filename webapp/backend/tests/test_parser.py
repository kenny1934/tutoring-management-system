"""Unit tests for the pdf-name parser (pure, no DB)."""
from curriculum.parser import detect_role, parse_pdf_name


def test_is_rev_matches_terminal_rev_segments():
    # "REV" at the end of a folder segment has no trailing separator; the
    # old [\b_ .] class needed one (and treated \b as a literal backspace).
    assert parse_pdf_name(r"W:\Secondary\F3 REV\MAS_801_三角形_C.pdf")["is_rev"]
    assert parse_pdf_name(r"W:\Secondary\0407 Revision\file.pdf")["is_rev"]
    assert parse_pdf_name(r"W:\Secondary\學校Rev\file.pdf")["is_rev"]


def test_is_rev_does_not_fire_inside_words():
    assert not parse_pdf_name(r"W:\Secondary\Review answers\701_Preview.pdf")["is_rev"]


def test_detect_role_revision_handles_underscore_bounds():
    # Underscores are word characters, so \brev\b missed "C_REV".
    assert detect_role("file.pdf", r"F3\C_REV") == "revision"
    assert detect_role("file.pdf", r"F3\math7-9Rev") == "revision"
    assert detect_role("701_Review.pdf", "") is None
