"""Courseware filename parser.

Extracts the concept signal from a PDF path: chapter code + code space,
language, subtopic string, material role, revision markers, and weekly-prep
folder context (week / grade / stream / school).

Code spaces (see concept_code_aliases.code_space):
  MAS     in-house Chinese-stream series, PRC 人教 chapter order (MAS_ prefix)
  HK_OLD  older HK series: math7-9 / math7-9extra folders, decimal sub-codes (903.1_)
  HK_NEW  current HK series: new_math7-9* folders, NNN_EXn_Topic_e/c format
  SM      summer courseware (code = grade*100 + lesson, NOT a chapter)
  SS      senior series (F4+), deferred
"""
import re
import unicodedata

CODE_RE = re.compile(r"(?:MAS_)?([789]\d\d)[_\s.]")
DECIMAL_CODE_RE = re.compile(r"\b([789]\d\d)\.\d[A-Z]?_")
SM_RE = re.compile(r"\bSM_?\d{3}")
SS_RE = re.compile(r"\bSS\d{2}")
WEEK_RE = re.compile(r"(\d{1,2})周目")
GRADE_RE = re.compile(r"^(F[1-4])([CE])$", re.I)
MAS_CHAPTER_FOLDER_RE = re.compile(r"MAS\s?(\d{3})\s+(.+)")
REV_RE = re.compile(
    r"(?i)exam|test|quiz|rev(?:ision)?[\b_ .]|mock|paper"
    r"|考試|考试|測驗|测验|溫習|温习|複習|复习|統測|统测|大測|小測|補測"
)
LANG_SUF_RE = re.compile(r"_([ec])(?:[\s(（.]|$)")
PAGE_SUF_RE = re.compile(r"[(（][\d\s,，、~\-–]+[)）]\s*(?:\.pdf)?$", re.I)
DATE_PAREN_RE = re.compile(r"[(（]\d{2}[.\-]\d{2}[.\-]\d{2}[)）]")
CJK_RE = re.compile(r"[一-鿿]")

# folder-name signatures for the two HK generations
_HK_NEW_DIR = re.compile(r"(?i)new[ _]?math7-9")
_HK_OLD_DIR = re.compile(r"(?i)(?<!new[ _])math7-9")

_ROLE_PATTERNS = [
    ("question_bank", re.compile(r"題庫|题库")),
    ("mock",          re.compile(r"(?i)\bmock\b")),
    ("past_paper",    re.compile(r"(?i)past[ _]?paper")),
    ("quiz",          re.compile(r"(?i)quiz|_Q\d+")),
    ("mc",            re.compile(r"(?i)\bMC\b|_MC[_.]|math7-9MC|new_math7-9MC")),
    ("revision",      re.compile(r"(?i)\brev\b|_R\d+|REV[\\_]|溫習|温习|複習|复习")),
    ("exercise",      re.compile(r"(?i)_EX\d|math7-9EX|extra")),
]


def _norm(s: str) -> str:
    return unicodedata.normalize("NFKC", s or "").strip()


def detect_code_space(fn: str, path: str) -> tuple:
    """Return (code_space, certain). Path context beats filename heuristics."""
    if SM_RE.search(fn):
        return "SM", True
    if "MAS_" in fn or re.search(r"MAS_?7-9|MAS\s?\d{3}", path):
        return "MAS", True
    if SS_RE.search(fn) or SS_RE.search(path):
        return "SS", True
    if _HK_NEW_DIR.search(path):
        return "HK_NEW", True
    if _HK_OLD_DIR.search(path):
        return "HK_OLD", True
    if DECIMAL_CODE_RE.search(fn):
        return "HK_OLD", True
    lang = LANG_SUF_RE.search(fn)
    if lang or re.search(r"\d{3}_EX\d", fn):
        return "HK_NEW", False
    if CJK_RE.search(fn):
        return "MAS", False
    return "HK_NEW", False


def detect_role(fn: str, path: str) -> str | None:
    for role, pat in _ROLE_PATTERNS:
        if pat.search(fn) or pat.search(path):
            return role
    # MAS master/homework sheets: MAS_701_有理數_C.pdf / _H.pdf
    if re.search(r"_[CH]\.pdf$", fn, re.I):
        return "master"
    return None


def parse_pdf_name(raw: str) -> dict:
    """Parse one pdf path (any prefix form) into its concept signal.

    Returns keys (present only when found): fn, code, code_space, space_certain,
    lang, subtopic, role, is_rev, week, wk_year, wk_grade, wk_stream, wk_school,
    wk_school_exam.
    """
    n = _norm(raw).strip('"')
    segs = [s for s in re.split(r"[\\/]", n) if s]
    fn = segs[-1] if segs else n
    path = "\\".join(segs[:-1])
    out = {"raw": raw, "fn": fn}

    # weekly prep folder context: ...\2025-2026\N周目 (dates)\F1C\SCHOOL\...\file
    for i, s in enumerate(segs):
        m = WEEK_RE.search(s)
        if m:
            out["week"] = int(m.group(1))
            for j in range(max(0, i - 2), i):
                if re.match(r"^20\d\d-20\d\d$", segs[j]):
                    out["wk_year"] = segs[j]
            if i + 2 < len(segs) - 1:  # school segment must not be the file itself
                g = GRADE_RE.match(segs[i + 1].strip())
                if g:
                    out["wk_grade"] = g.group(1).upper()
                    out["wk_stream"] = g.group(2).upper()
                    school = segs[i + 2].strip()
                    out["wk_school_exam"] = bool(re.search(r"(?i)[(（]\s*exam|考試", school))
                    out["wk_school"] = re.sub(r"\s*[(（].*?[)）]\s*$", "", school)
            break

    out["is_rev"] = bool(REV_RE.search(fn)) or any(REV_RE.search(s) for s in segs[:-1])
    role = detect_role(fn, path)
    if role:
        out["role"] = role

    m = DECIMAL_CODE_RE.search(fn) or CODE_RE.search(fn)
    if not m:
        # code via parent MAS chapter folder, e.g. MAS705 相交線與平行線
        for s in segs[:-1]:
            mm = MAS_CHAPTER_FOLDER_RE.search(s)
            if mm:
                out.update(code=mm.group(1), code_space="MAS", space_certain=True, lang="c")
                return out
        return out
    code = m.group(1)
    out["code"] = code

    space, certain = detect_code_space(fn, path)
    out["code_space"] = space
    out["space_certain"] = certain

    lm = LANG_SUF_RE.search(fn)
    if lm:
        out["lang"] = lm.group(1).lower()
    elif space == "MAS":
        out["lang"] = "c"
    elif space == "HK_OLD":
        out["lang"] = "e"  # old generation is English-only

    # subtopic: text after the code, markers stripped
    rest = fn[m.end():]
    rest = re.sub(r"\.pdf$", "", rest, flags=re.I)
    rest = DATE_PAREN_RE.sub("", rest)
    rest = PAGE_SUF_RE.sub("", rest)
    rest = LANG_SUF_RE.sub(" ", rest + " ")
    rest = re.sub(r"(?i)^(EX\d*[A-Z]?|Rev|R\d+|Q\d+|Quiz|MC|A\d+|B\d+)_", "", rest)
    rest = re.sub(r"(?i)_(EX\d*[A-Z]?|R\d+|Q\d+|A\d+|B\d+|\d+|[CH])$", "", rest.strip("_ "))
    rest = rest.replace(".", " ").replace("_", " ")
    rest = re.sub(r"\s+", " ", rest).strip(" -–")
    if rest and not re.match(r"(?i)^(ex\d*[a-z]?|r\d+|q\d+|quiz|mc|\d+)$", rest):
        out["subtopic"] = rest
    return out
