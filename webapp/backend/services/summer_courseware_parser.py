r"""Parser for the summer courseware net-drive folder tree.

The summer course PDFs live on a NAS share, organised by convention:

    <root>\F1\SM701 有理數 Directed Numbers\SM_701_Directed_Numbers_C_e.pdf
                                           \SM_701_有理數_C_c.pdf
                                           \Ans\SM_701_有理數_C_c_ans.pdf
                                           \Extra\SM_701_有理數_Extra_c.pdf
                                           \Parallel Version\Parallel-SM_701_有理數_C.pdf

This module turns a raw file listing (relative paths scanned client-side via
the File System Access API) into classified records. ALL naming conventions
live here and nowhere else — when the courseware team drifts from convention,
files land in `unclassified` (visible in the admin panel) instead of silently
disappearing, and the fix is a single change in this file.

Verified against the real 2026 tree (471 files): 431 classified; the only
unclassified file is one misnamed F4 worksheet, surfaced not dropped.

Conventions encoded:
- Grade folders F1-F4 are indexed. F4 adopted the SM naming in 2026 (codes
  "SS01"-"SS08", currently Chinese-only and HW-heavy); F5+ still use other
  schemes and stay out of scope.
- Chapter folders: "SM<code> <topic_zh> <topic_en>". Lesson number is the
  code's trailing two digits (SM701 → L1, SM810 → L10, F4's SMSS01 → L1),
  uniform across forms.
  Chapters beyond the configured lesson count (e.g. SM809/SM810 when the
  course has 8 lessons) are extra chapters, assignable but never a default.
- Files: "[Parallel-]SM_<code>_<topic>_<C|H|Extra>[_<e|c>][_ans].pdf".
  The separator before the variant letter is usually "_" but occasionally a
  space (real example: "SM_702_Directed Numbers_C_e.pdf"), and the answer
  suffix is occasionally capitalised (real example: "SM_801_..._C_c_Ans.pdf").
- Parallel Versions merge both languages, so they carry no language suffix.
- "Raw", "Word Files" subfolders and non-PDFs are working files — excluded.
"""

import re
from dataclasses import dataclass, field
from typing import Optional

# Grades indexed. F4 adopted the SM_<code> naming in 2026 (codes "SS01"-"SS08");
# F5+ still use other schemes — extend this set if/when they adopt it too.
INDEXED_GRADES = {"F1", "F2", "F3", "F4"}

GRADE_RE = re.compile(r"^F[1-6]$")

# Subfolder names (any depth) that hold working files, not teachable PDFs.
EXCLUDED_SUBDIRS = {"raw", "word files"}

# Subfolders that legitimately hold classified files.
KNOWN_SUBDIRS = {"", "ans", "extra", "parallel version"}

# "SM701 有理數 Directed Numbers" → code="701", topic="有理數 Directed Numbers"
CHAPTER_RE = re.compile(r"^SM(?P<code>\w+)\s+(?P<topic>.+)$")

# Topic splits at the first ASCII-letter word: Chinese part, then English part.
# Chinese-only topics (no English) leave topic_en as None.
TOPIC_SPLIT_RE = re.compile(r"^(?P<zh>.*?[^\x00-\x7f].*?)\s+(?P<en>[A-Za-z].*)$")

# "Parallel-SM_702_Directed Numbers_C_e_ans" (extension stripped beforehand).
# Topic is non-greedy; the separator before the variant letter is "_" or " ".
FILE_RE = re.compile(
    r"^(?P<parallel>Parallel-)?"
    r"SM_(?P<code>\w+?)_(?P<topic>.+?)"
    r"[_ ](?P<variant>C|H|Extra)"
    r"(?:_(?P<lang>[ec]))?"
    r"(?:[_ ]?(?P<ans>(?i:ans)))?$"
)

VARIANT_TO_DOC_TYPE = {"C": "CW", "H": "HW", "Extra": "Extra"}


@dataclass
class ParsedFile:
    grade: str
    course_code: str
    lesson_number: Optional[int]  # course code's last two digits; None if code is non-numeric
    topic_zh: Optional[str]
    topic_en: Optional[str]
    doc_type: str  # 'CW' | 'HW' | 'Extra'
    lang: Optional[str]  # 'e' | 'c'; None for parallel versions
    is_parallel: bool
    is_answer: bool
    rel_path: str  # backslash-normalised, relative to the scanned root
    file_name: str
    mtime_ms: Optional[int] = None


@dataclass
class UnclassifiedFile:
    rel_path: str
    file_name: str
    reason: str
    mtime_ms: Optional[int] = None


@dataclass
class ScanResult:
    classified: list[ParsedFile] = field(default_factory=list)
    unclassified: list[UnclassifiedFile] = field(default_factory=list)
    excluded_count: int = 0  # non-PDFs and working folders (Raw, Word Files)
    skipped_grade_count: int = 0  # files under non-indexed grades (F5+)

    @property
    def total_files(self) -> int:
        return (
            len(self.classified)
            + len(self.unclassified)
            + self.excluded_count
            + self.skipped_grade_count
        )


def split_topic(topic: str) -> tuple[str, Optional[str]]:
    """Split "有理數 Directed Numbers" into (zh, en). Chinese-only → (zh, None)."""
    m = TOPIC_SPLIT_RE.match(topic)
    if m:
        return m.group("zh"), m.group("en")
    return topic, None


def lesson_number_from_code(code: str) -> Optional[int]:
    """Lesson number is the code's trailing two digits: 701 → 1, 810 → 10, and
    F4's "SS01" → 1 … "SS08" → 8 (the chapter sequence is the lesson order)."""
    m = re.search(r"\d+$", code)
    return int(m.group()) % 100 if m else None


def parse_listing(files: list[tuple[str, Optional[int]]]) -> ScanResult:
    """Classify a raw listing of (relative_path, mtime_ms) from a tree scan.

    Paths may use "/" (File System Access API) or "\\" (Windows listings);
    both are normalised. Anything that should be teachable but doesn't match
    convention lands in `unclassified` with a human-readable reason.
    """
    result = ScanResult()

    for raw_path, mtime_ms in files:
        rel_path = raw_path.strip().replace("/", "\\").strip("\\")
        if not rel_path:
            continue
        parts = rel_path.split("\\")
        file_name = parts[-1]

        # Working files first: non-PDFs and Raw / Word Files subtrees.
        if not file_name.lower().endswith(".pdf") or any(
            seg.lower() in EXCLUDED_SUBDIRS for seg in parts[:-1]
        ):
            result.excluded_count += 1
            continue

        def unclassify(reason: str) -> None:
            result.unclassified.append(
                UnclassifiedFile(
                    rel_path=rel_path, file_name=file_name, reason=reason, mtime_ms=mtime_ms
                )
            )

        if len(parts) < 3:
            unclassify("Not inside a grade\\chapter folder")
            continue

        grade = parts[0]
        if not GRADE_RE.match(grade):
            unclassify(f"Unrecognised grade folder '{grade}'")
            continue
        if grade not in INDEXED_GRADES:
            result.skipped_grade_count += 1
            continue

        chapter_match = CHAPTER_RE.match(parts[1])
        if not chapter_match:
            unclassify(f"Chapter folder '{parts[1]}' doesn't match 'SM<code> <topic>'")
            continue
        chapter_code = chapter_match.group("code")
        topic_zh, topic_en = split_topic(chapter_match.group("topic"))

        subdir = "\\".join(parts[2:-1])
        if subdir.lower() not in KNOWN_SUBDIRS:
            unclassify(f"Unexpected subfolder '{subdir}'")
            continue

        file_match = FILE_RE.match(file_name[: -len(".pdf")])
        if not file_match:
            unclassify("Filename doesn't match the SM_<code>_<topic>_<C|H|Extra> pattern")
            continue

        # A file filed under the wrong chapter folder is a data error worth
        # surfacing, not something to guess about.
        if file_match.group("code") != chapter_code:
            unclassify(
                f"File code SM{file_match.group('code')} doesn't match "
                f"chapter folder SM{chapter_code}"
            )
            continue

        is_parallel = bool(file_match.group("parallel"))
        lang = file_match.group("lang")
        if not is_parallel and lang is None:
            # Single-language files must say which language they are.
            unclassify("Missing language suffix (_e or _c)")
            continue

        result.classified.append(
            ParsedFile(
                grade=grade,
                course_code=chapter_code,
                lesson_number=lesson_number_from_code(chapter_code),
                topic_zh=topic_zh,
                topic_en=topic_en,
                doc_type=VARIANT_TO_DOC_TYPE[file_match.group("variant")],
                lang=None if is_parallel else lang,
                is_parallel=is_parallel,
                is_answer=bool(file_match.group("ans")),
                rel_path=rel_path,
                file_name=file_name,
                mtime_ms=mtime_ms,
            )
        )

    return result
