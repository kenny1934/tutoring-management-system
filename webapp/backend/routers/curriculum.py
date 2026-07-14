"""Curriculum-aware exercise suggestions.

Answers "what is this student's school teaching right now, and which of our
PDFs fit" by combining two layers built in migrations 123-125:

  timeline  — school_topic_observations rolled up by the consensus/pacing
              views: per school x grade x stream, which concept each week.
  content   — courseware_concepts: PDFs mapped to concepts, with role/lang.

Endpoints:
  GET  /curriculum/suggestions   per-student "what to assign now"
  GET  /curriculum/search        free search: concept and/or school-week scope
  GET  /curriculum/concepts      the concept vocabulary with codes (pickers)
  POST /curriculum/observations  flywheel: tutor confirms the school's topic
  DEL  /curriculum/observations  undo a mis-tapped confirmation (own only)
  GET  /curriculum/timeline      one school-grade's weekly consensus timeline
  GET  /curriculum/coverage      observation coverage per combo (gap finding)
  GET  /curriculum/exams         a school-grade's tests with parsed scopes
  GET  /curriculum/revision-pack/{id}  one test's scope concepts + files

Concept evidence for suggestions is tried in tiers, strongest first:
  this_year — observations for the current academic year, weeks w-2..w,
              weighted down with distance from the current week.
  last_year — the previous year's timeline around the same week (schools
              repeat their pacing closely; validated at +/-2 weeks).
  pacing    — the all-years pacing band (mean week +/- spread) when neither
              year has rows near this week.

Files are ranked concept-match first, popularity as tiebreak, so a
brand-new PDF mapped to the right concept surfaces immediately. Returned
file_path is in canonical alias form — it drops straight into pdf_name and
the frontend's resolveAliasPath()/answer auto-search work unchanged.

Suggestions are suggestive, not prescriptive: every concept carries its
evidence (sources, weight, weeks) so the tutor can judge.
"""
import json
import logging
import re
import time
from collections import defaultdict
from datetime import date as date_type, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from constants import hk_now
from curriculum import exam_scope
from curriculum.paths import normalize
from database import get_db
from models import CalendarEvent, Student, Tutor
from routers.debug_admin import escape_like_pattern

logger = logging.getLogger(__name__)
router = APIRouter()

SUGGESTED_GRADES = ("F1", "F2", "F3")
MAX_CONCEPTS = 3
MAX_SEARCH_CONCEPTS = 10
MAX_FILES_PER_CONCEPT = 8
MAX_PAST_PAPERS = 12
# a same-school paper with no topic index still counts when it was filed
# within this many weeks of the event's point in the year
PAST_PAPER_WEEK_WINDOW = 2

# Evidence at the current week counts full; nearby weeks progressively less
# (a school seen on a topic two weeks ago has likely moved on).
WEEK_DECAY = {0: 1.0, 1: 0.6, 2: 0.35}
PACING_HALF_WINDOW = 3
EXAM_LOOKAHEAD_DAYS = 14

CONFIRM_CONFIDENCE = 1.0
# Assigning a suggested file is weaker evidence than an explicit confirm —
# tutors sometimes assign without the school actually being on that topic.
ACCEPT_CONFIDENCE = 0.7

# Only alias-form paths are usable in the exercise modal (resolveAliasPath).
# Rows whose original path couldn't be attributed to a share keep their raw
# remainder as file_path — valid map evidence, but not suggestible.
USABLE_ALIASES = ["Courseware Developer 中學", "Center", "MSA Staff"]

# Lower sorts first. None-role files are unmarked worksheets — usually plain
# exercises, so they rank just after explicit ones.
ROLE_ORDER_NORMAL = {
    "exercise": 0, None: 1, "quiz": 2, "mc": 3, "master": 4,
    "revision": 5, "question_bank": 6, "past_paper": 7, "mock": 8,
}
ROLE_ORDER_REVISION = {
    "revision": 0, "quiz": 1, "mock": 2, "past_paper": 3, "mc": 4,
    "exercise": 5, None: 6, "question_bank": 7, "master": 8,
}


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def _prior_year(academic_year: str) -> Optional[str]:
    try:
        start, end = academic_year.split("-")
        return f"{int(start) - 1}-{int(end) - 1}"
    except ValueError:
        return None


def _preferred_lang(lang_stream: Optional[str]) -> Optional[str]:
    """'C'/'E' stream -> 'c'/'e' file language."""
    return (lang_stream or "").strip().lower()[:1] or None


def _week_for_date(db, on_date):
    return db.execute(text("""
        SELECT academic_year, week_number FROM academic_weeks
        WHERE :d BETWEEN week_start_date AND week_end_date
        LIMIT 1
    """), {"d": on_date.isoformat()}).fetchone()


def _alias_like_params():
    """(where_fragment, params) matching file_path in any usable alias form."""
    clauses, params = [], {"like_esc": "\\"}
    for i, alias in enumerate(USABLE_ALIASES):
        key = f"alias{i}"
        # Explicit ESCAPE so the doubled backslash means a literal one on any
        # backend (MySQL defaults to backslash-escape, SQLite to none).
        clauses.append(f"cc.file_path LIKE :{key} ESCAPE :like_esc")
        params[key] = alias + "\\\\" + "%"
    return "(" + " OR ".join(clauses) + ")", params


def _stream_where(stream):
    """(where_fragment, params) filtering rows to a lang_stream.

    No stream -> match any stream: unstreamed callers (search without the
    filter, students with no stream recorded) still get the timeline.
    """
    if stream:
        return "AND (lang_stream = :stream OR lang_stream IS NULL)", {"stream": stream}
    return "", {}


def _consensus_rows(db, school, grade, stream, year, week_lo, week_hi):
    stream_where, stream_param = _stream_where(stream)
    params = {"school": school, "grade": grade, "year": year,
              "lo": week_lo, "hi": week_hi, **stream_param}
    return db.execute(text(f"""
        SELECT week_number, concept_id, weight, sources
        FROM school_week_topic_consensus
        WHERE school = :school AND grade = :grade {stream_where}
          AND academic_year = :year
          AND week_number BETWEEN :lo AND :hi
    """), params).fetchall()


def _score_consensus(rows, current_week):
    """Aggregate view rows into per-concept scores with evidence."""
    scored = defaultdict(lambda: {"score": 0.0, "weight": 0.0, "weeks": set(), "sources": set()})
    for week, concept_id, weight, sources in rows:
        decay = WEEK_DECAY.get(abs(current_week - week))
        if decay is None:
            continue
        entry = scored[concept_id]
        entry["score"] += float(weight) * decay
        entry["weight"] += float(weight)
        entry["weeks"].add(week)
        entry["sources"].update((sources or "").split(","))
    return scored


def _predict_concepts(db, school, grade, stream, year, week):
    """Return (tier, {concept_id: evidence}) — first tier with rows wins."""
    # Tier 1: this year, current week and the two before it.
    rows = _consensus_rows(db, school, grade, stream, year, week - 2, week)
    scored = _score_consensus(rows, week)
    if scored:
        return "this_year", scored

    # Tier 2: last year around the same week (future weeks exist there).
    prior = _prior_year(year)
    if prior:
        rows = _consensus_rows(db, school, grade, stream, prior, week - 2, week + 2)
        scored = _score_consensus(rows, week)
        if scored:
            return "last_year", scored

    # Tier 3: all-years pacing band.
    stream_where, stream_param = _stream_where(stream)
    params = {"school": school, "grade": grade,
              "lo": week - PACING_HALF_WINDOW, "hi": week + PACING_HALF_WINDOW,
              **stream_param}
    rows = db.execute(text(f"""
        SELECT concept_id, mean_week, total_weight, years_observed
        FROM school_concept_pacing
        WHERE school = :school AND grade = :grade {stream_where}
          AND mean_week BETWEEN :lo AND :hi
    """), params).fetchall()
    scored = {}
    for concept_id, mean_week, total_weight, years in rows:
        proximity = 1.0 / (1.0 + abs(float(mean_week) - week))
        entry = scored.get(concept_id)
        score = float(total_weight) * proximity
        if entry is None or score > entry["score"]:
            scored[concept_id] = {
                "score": score, "weight": float(total_weight),
                "weeks": {round(float(mean_week))}, "sources": set(),
                "mean_week": float(mean_week), "years_observed": years,
            }
    return ("pacing", scored) if scored else ("none", {})


def _upcoming_exam(db, student, on_date):
    """Nearest test/exam for the student's school+grade within the lookahead."""
    filters = [
        CalendarEvent.start_date >= on_date,
        CalendarEvent.start_date <= on_date + timedelta(days=EXAM_LOOKAHEAD_DAYS),
    ]
    if student.school:
        filters.append(CalendarEvent.school == student.school)
    if student.grade:
        filters.append(CalendarEvent.grade == student.grade)
    return (
        db.query(CalendarEvent)
        .filter(*filters)
        .order_by(CalendarEvent.start_date)
        .first()
    )


def _files_for_concepts(db, concept_ids):
    """Modal-usable files for the given concepts, with concept names."""
    alias_where, params = _alias_like_params()
    params["ids"] = list(concept_ids)
    stmt = text(f"""
        SELECT cc.concept_id, cc.file_path, cc.file_basename, cc.role, cc.lang,
               cc.confidence, cc.source,
               c.name_en, c.name_zh, c.kind, c.grade AS concept_grade
        FROM courseware_concepts cc
        JOIN curriculum_concepts c ON c.id = cc.concept_id
        WHERE cc.concept_id IN :ids AND {alias_where}
    """).bindparams(bindparam("ids", expanding=True))
    return db.execute(stmt, params).fetchall()


def _concept_meta(db, concept_ids):
    """{id: {name_en, name_zh, kind, grade}} for the given ids."""
    if not concept_ids:
        return {}
    stmt = text("""
        SELECT id, name_en, name_zh, kind, grade FROM curriculum_concepts
        WHERE id IN :ids
    """).bindparams(bindparam("ids", expanding=True))
    return {
        row.id: {"name_en": row.name_en, "name_zh": row.name_zh,
                 "kind": row.kind, "grade": row.grade}
        for row in db.execute(stmt, {"ids": list(concept_ids)})
    }


# Extensions the migration-036 popularity view strips when grouping. Keys
# must strip exactly this set — a blind rsplit('.') would truncate
# extensionless decimal-coded names ('903.1_Percentage_e' -> '903').
_KNOWN_EXT_RE = re.compile(r"\.(pdf|docx?|jpg|xlsx|pptx)$", re.IGNORECASE)


def _basename_key(name):
    """Lowercased basename with any known extension stripped — the join key
    shared by the popularity map, file dedupe, and assignment history."""
    return _KNOWN_EXT_RE.sub("", name or "").lower()


# The in-process caches below all share one shape ({key -> entry}) and one
# TTL; staleness is harmless in every case (popularity only breaks ties, the
# matcher tracks rare vocabulary edits, a school's series is effectively
# static).
_POPULARITY_TTL_SECONDS = 600


def _ttl_cached(cache, key, loader, max_entries=None):
    """Value from a TTL'd in-process cache, reloading through loader().

    max_entries guards caches whose key comes from request input: the
    oldest entries are evicted once the cap is passed.
    """
    now = time.monotonic()
    entry = cache.get(key)
    if entry is None or now - entry["loaded_at"] > _POPULARITY_TTL_SECONDS:
        entry = {"loaded_at": now, "value": loader()}
        cache[key] = entry
        if max_entries is not None:
            while len(cache) > max_entries:
                oldest = min(cache, key=lambda k: cache[k]["loaded_at"])
                del cache[oldest]
    return entry["value"]


# The popularity view derives its grouping key from every session_exercises
# row on each query (~650ms server-side) — cache the whole map.
_popularity_cache = {}


def _popularity_map(db):
    """assignment counts from the migration-036 summary view, keyed by
    extension-stripped lowercased basename (the view preserves case and
    groups case-insensitively, so one arbitrary variant comes back)."""
    def load():
        rows = db.execute(text("""
            SELECT filename, assignment_count, unique_student_count, latest_use
            FROM courseware_popularity_summary
        """)).fetchall()
        return {(r.filename or "").lower(): r for r in rows}

    return _ttl_cached(_popularity_cache, "all", load)


# Per-school counts key on the scope school, so each school's map is cached
# separately. The suggestion paths only pass schools that exist in the DB,
# but /curriculum/search passes the caller's school string verbatim, so the
# cache is capped rather than trusted to stay a few dozen entries.
_school_popularity_cache = {}
_SCHOOL_POPULARITY_CACHE_MAX = 64


def _school_popularity_map(db, school):
    """assignment counts among the given school's students, from the
    migration-036 detail view (which already derives the same
    extension-stripped filename the summary view groups by). The grade is
    deliberately NOT part of the scope: the view carries each student's
    current grade, so historical assignments drift a grade every September;
    the school is stable."""
    key = (school or "").strip().upper()
    if not key:
        return {}

    def load():
        rows = db.execute(text("""
            SELECT filename, COUNT(*) AS assignment_count,
                   COUNT(DISTINCT student_id) AS unique_student_count
            FROM courseware_usage_detail
            WHERE UPPER(school) = :school
            GROUP BY filename
        """), {"school": key}).fetchall()
        return {(r.filename or "").lower(): r for r in rows}

    return _ttl_cached(_school_popularity_cache, key, load,
                       max_entries=_SCHOOL_POPULARITY_CACHE_MAX)


# The scope matcher compiles the whole concept vocabulary. Vocabulary edits
# are rare, so it shares the popularity cache's TTL.
_scope_matcher_cache = {}
_school_series_cache = {}


def _scope_matcher(db):
    return _ttl_cached(_scope_matcher_cache, "matcher",
                       lambda: exam_scope.load_scope_matcher(db))


def _school_series(db, school):
    """Cached MAS/HK series call per school (gates the chapter-code channel)."""
    key = (school or "").strip().upper()
    if not key:
        return None
    return _ttl_cached(_school_series_cache, key,
                       lambda: exam_scope.school_series(db, school))


def _stored_scope_rows(db, event_ids):
    """{event_id: [row dicts]} of persisted AI/manual scope mappings."""
    if not event_ids:
        return {}
    stmt = text("""
        SELECT calendar_event_id, concept_id, matched_text, confidence, source
        FROM exam_scope_concepts
        WHERE calendar_event_id IN :ids
    """).bindparams(bindparam("ids", expanding=True))
    out = defaultdict(list)
    for r in db.execute(stmt, {"ids": list(event_ids)}):
        out[r.calendar_event_id].append({
            "concept_id": r.concept_id, "matched_text": r.matched_text,
            "confidence": r.confidence, "source": r.source,
        })
    return out


def _event_scope(db, event, stored_rows=None):
    """(concepts, unmatched_lines) for one calendar event's scope text.

    Mechanical parse on the current description, overlaid with any
    persisted AI/manual rows (stale ones self-retire inside
    apply_stored_rows when their source line has left the description)."""
    matcher = _scope_matcher(db)
    lines = matcher.parse(
        event.description,
        series=_school_series(db, event.school),
        grade=event.grade,
    )
    concepts, unmatched = exam_scope.summarize(lines)
    if stored_rows is None:
        stored_rows = _stored_scope_rows(db, [event.id]).get(event.id, [])
    concepts = exam_scope.apply_stored_rows(
        concepts, stored_rows, event.description)
    # A stored row answers the line it came from — stop reporting it as
    # unreadable. (Stale rows' lines are no longer in the description, so
    # they cannot appear in unmatched anyway.)
    covered = {exam_scope.normalize(r["matched_text"] or "") for r in stored_rows}
    unmatched = [u for u in unmatched if exam_scope.normalize(u) not in covered]
    return concepts, unmatched


def _ranked_scope(concepts):
    """Scope concepts ordered by confidence, ties broken stably."""
    return sorted(concepts.items(), key=lambda kv: (-kv[1]["confidence"], kv[0]))


def _dominant_stream(db, school, grade):
    """The stream carrying this school-grade's evidence weight. No school
    genuinely runs two streams; minority rows are folder-typo noise."""
    row = db.execute(text("""
        SELECT lang_stream FROM school_topic_observations
        WHERE school = :school AND grade = :grade AND lang_stream IS NOT NULL
        GROUP BY lang_stream
        ORDER BY SUM(confidence) DESC
        LIMIT 1
    """), {"school": school, "grade": grade}).fetchone()
    return row[0] if row else None


def _dedupe_files(files):
    """The map holds the same file with and without its extension (raw
    AppSheet-era pdf_name often lacked one). Keep one row per stripped
    basename, preferring the variant with a real extension."""
    kept = {}
    for f in files:
        key = _basename_key(f["file_basename"])
        prev = kept.get(key)
        if prev is None:
            kept[key] = f
        elif (not _KNOWN_EXT_RE.search(prev["file_basename"] or "")
              and _KNOWN_EXT_RE.search(f["file_basename"] or "")):
            prev["file_path"] = f["file_path"]
            prev["file_basename"] = f["file_basename"]
    return list(kept.values())


# School-specific scans live under 中學參考教材\F1..F6\SCHOOL-CODE\...
_REFERENCE_SCHOOL_RE = re.compile(r"中學參考教材\\F[1-6]\\([^\\]+)\\")

# A few folders carry a school's Chinese name where students.school uses a
# different code (or a longer name). Kenny-confirmed mappings, 2026-07-10.
_REFERENCE_SCHOOL_ALIASES = {
    "利瑪竇": "CMR",
    "東南": "TNS",
    "嶺南": "嶺南中學",
    "高美士": "高美士中葡",
}


def _reference_school(file_path):
    m = _REFERENCE_SCHOOL_RE.search(file_path or "")
    if not m:
        return None
    code = m.group(1)
    return _REFERENCE_SCHOOL_ALIASES.get(code, code)


def _ranked_files(db, concept_ids, preferred_lang, role_order, role_filter=None,
                  scope_school=None):
    """(files_by_concept, concept_meta): sorted, deduped, popularity-joined.

    concept_meta covers ALL requested ids (concepts with no usable files are
    still worth showing by name). When scope_school is given, that school's
    own reference scans outrank everything — they are the most relevant
    material for the school being looked at — and files its students have
    actually been assigned rank ahead of merely globally popular ones.
    """
    file_rows = _files_for_concepts(db, concept_ids)
    popularity = _popularity_map(db)
    school_popularity = _school_popularity_map(db, scope_school)

    def lang_rank(lang):
        if preferred_lang is None or lang == preferred_lang:
            return 0
        return 1 if lang is None else 2

    files_by_concept = defaultdict(list)
    meta = {}
    for r in file_rows:
        meta[r.concept_id] = {
            "name_en": r.name_en, "name_zh": r.name_zh,
            "kind": r.kind, "grade": r.concept_grade,
        }
        if role_filter and r.role != role_filter:
            continue
        pop = popularity.get(_basename_key(r.file_basename))
        spop = school_popularity.get(_basename_key(r.file_basename))
        school_code = _reference_school(r.file_path)
        files_by_concept[r.concept_id].append({
            "file_path": r.file_path,
            "file_basename": r.file_basename,
            "role": r.role,
            "lang": r.lang,
            "confidence": float(r.confidence) if r.confidence is not None else None,
            "map_source": r.source,
            "school_code": school_code,
            "from_school": bool(
                scope_school and school_code
                and school_code.upper() == scope_school.upper()
            ),
            "assignment_count": pop.assignment_count if pop else 0,
            "unique_student_count": pop.unique_student_count if pop else 0,
            "school_assignment_count": spop.assignment_count if spop else 0,
            "school_student_count": spop.unique_student_count if spop else 0,
            "latest_use": _iso(pop.latest_use) if pop else None,
        })

    for cid, files in files_by_concept.items():
        files.sort(key=lambda f: (
            0 if f["from_school"] else 1,
            lang_rank(f["lang"]),
            role_order.get(f["role"], 9),
            -(f["confidence"] or 0),
            -f["school_assignment_count"],
            -f["assignment_count"],
            f["file_basename"] or "",
        ))
        files_by_concept[cid] = _dedupe_files(files)

    missing = [cid for cid in concept_ids if cid not in meta]
    meta.update(_concept_meta(db, missing))
    return files_by_concept, meta


def _student_assigned_map(db, student_id):
    """{extension-stripped lowercased basename: (count, last_date)} of every
    PDF assigned to this student, so suggestions can flag worksheets the
    student has already done."""
    rows = db.execute(text("""
        SELECT se.pdf_name, COUNT(*) AS n, MAX(sl.session_date) AS last_date
        FROM session_exercises se
        JOIN session_log sl ON sl.id = se.session_id
        WHERE sl.student_id = :sid
          AND se.pdf_name IS NOT NULL AND se.pdf_name != ''
        GROUP BY se.pdf_name
    """), {"sid": student_id}).fetchall()
    out = {}
    for r in rows:
        key = _basename_key(normalize(r.pdf_name)["basename"])
        if not key:
            continue
        count, last_date = out.get(key, (0, None))
        if r.last_date and (last_date is None or r.last_date > last_date):
            last_date = r.last_date
        out[key] = (count + r.n, last_date)
    return out


# ---------------------------------------------------------------------------
# Suggestions
# ---------------------------------------------------------------------------

@router.get("/curriculum/suggestions")
def get_curriculum_suggestions(
    student_id: int = Query(..., description="Student to suggest for"),
    date: Optional[date_type] = Query(None, description="Session date (defaults to today, HK time)"),
    _user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Suggest concepts + courseware PDFs for a student's session.

    Empty suggestion lists carry a `reason` so the UI can explain itself
    instead of showing a bare blank state.
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    on_date = date or hk_now().date()
    base = {
        "student_id": student.id,
        "school": student.school,
        "grade": student.grade,
        "lang_stream": student.lang_stream,
        "date": on_date.isoformat(),
        "academic_year": None,
        "week_number": None,
        "tier": "none",
        "timeline_tier": "none",
        "revision_mode": False,
        "upcoming_exam": None,
        "suggestions": [],
        "reason": None,
    }

    if student.grade not in SUGGESTED_GRADES:
        base["reason"] = "unsupported_grade"
        return base
    if not student.school:
        base["reason"] = "no_school"
        return base

    week_row = _week_for_date(db, on_date)
    if not week_row:
        base["reason"] = "no_academic_week"
        return base
    year, week = week_row
    base["academic_year"] = year
    base["week_number"] = week

    exam = _upcoming_exam(db, student, on_date)
    revision_mode = exam is not None
    base["revision_mode"] = revision_mode
    scope = {}
    if exam:
        scope, _ = _event_scope(db, exam)
        base["upcoming_exam"] = {
            "id": exam.id,
            "title": exam.title,
            "event_type": exam.event_type,
            "start_date": _iso(exam.start_date),
            "scope_concept_count": len(scope),
        }

    # The timeline tier is computed either way: CurriculumTab keys its week
    # window off it even while the scope drives the suggestions.
    timeline_tier, scored = _predict_concepts(
        db, student.school, student.grade, student.lang_stream, year, week
    )
    base["timeline_tier"] = timeline_tier
    if scope:
        # The test's own published scope beats any timeline inference.
        tier = "exam_scope"
        top = _ranked_scope(scope)[:MAX_CONCEPTS]
    else:
        tier = timeline_tier
        top = sorted(scored.items(),
                     key=lambda kv: (-kv[1]["score"], kv[0]))[:MAX_CONCEPTS]
    base["tier"] = tier
    if not top:
        base["reason"] = "no_timeline"
        return base

    concept_ids = [cid for cid, _ in top]

    files_by_concept, concept_meta = _ranked_files(
        db, concept_ids,
        preferred_lang=_preferred_lang(student.lang_stream),
        role_order=ROLE_ORDER_REVISION if revision_mode else ROLE_ORDER_NORMAL,
        scope_school=student.school,
    )
    assigned = _student_assigned_map(db, student.id)

    suggestions = []
    for concept_id, evidence in top:
        meta = concept_meta.get(concept_id, {})
        if tier == "exam_scope":
            why = {
                "tier": tier,
                "confidence": round(float(evidence["confidence"]), 2),
                "scope_lines": evidence["lines"],
            }
        else:
            why = {
                "tier": tier,
                "weight": round(evidence["weight"], 2),
                "sources": sorted(s for s in evidence["sources"] if s),
                "weeks_observed": sorted(evidence["weeks"]),
            }
            if "mean_week" in evidence:
                why["mean_week"] = evidence["mean_week"]
                why["years_observed"] = evidence["years_observed"]
        files = files_by_concept.get(concept_id, [])[:MAX_FILES_PER_CONCEPT]
        for f in files:
            done = assigned.get(_basename_key(f["file_basename"]))
            f["student_assigned_count"] = done[0] if done else 0
            f["student_last_assigned"] = _iso(done[1]) if done else None
        suggestions.append({
            "concept_id": concept_id,
            "name_en": meta.get("name_en"),
            "name_zh": meta.get("name_zh"),
            "kind": meta.get("kind"),
            "concept_grade": meta.get("grade"),
            "why": why,
            "files": files,
        })

    base["suggestions"] = suggestions
    return base


# ---------------------------------------------------------------------------
# Concept vocabulary
# ---------------------------------------------------------------------------

@router.get("/curriculum/concepts")
def list_concepts(
    _user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The whole concept vocabulary with per-series codes (76 rows — small
    enough to return whole; pickers/autocomplete filter client-side).

    equivalent_ids carries cross-series equivalence (concept_links, symmetric,
    stored once per pair) so the pacing comparison can align an MAS school's
    lanes with an HK school's. Prerequisite links are directional: builds_on_ids
    lists a concept's prerequisites, leads_to_ids what it unlocks."""
    codes = defaultdict(list)
    for row in db.execute(text(
        "SELECT concept_id, code_space, code FROM concept_code_aliases "
        "ORDER BY code_space, code"
    )):
        codes[row.concept_id].append({"code_space": row.code_space, "code": row.code})

    equivalents = defaultdict(list)
    for row in db.execute(text(
        "SELECT from_concept_id, to_concept_id FROM concept_links "
        "WHERE kind = 'equivalent' ORDER BY from_concept_id, to_concept_id"
    )):
        equivalents[row.from_concept_id].append(row.to_concept_id)
        equivalents[row.to_concept_id].append(row.from_concept_id)

    builds_on = defaultdict(list)
    leads_to = defaultdict(list)
    for row in db.execute(text(
        "SELECT from_concept_id, to_concept_id FROM concept_links "
        "WHERE kind = 'prerequisite' ORDER BY from_concept_id, to_concept_id"
    )):
        builds_on[row.to_concept_id].append(row.from_concept_id)
        leads_to[row.from_concept_id].append(row.to_concept_id)

    return [
        {
            "id": row.id,
            "kind": row.kind,
            "name_en": row.name_en,
            "name_zh": row.name_zh,
            "grade": row.grade,
            "parent_id": row.parent_id,
            "strand": row.strand,
            "atlas_grade": row.atlas_grade,
            "display_order": row.display_order,
            "codes": codes.get(row.id, []),
            "equivalent_ids": equivalents.get(row.id, []),
            "builds_on_ids": builds_on.get(row.id, []),
            "leads_to_ids": leads_to.get(row.id, []),
        }
        for row in db.execute(text(
            "SELECT id, kind, name_en, name_zh, grade, parent_id, "
            "strand, atlas_grade, display_order "
            "FROM curriculum_concepts ORDER BY display_order, id"
        ))
    ]


# ---------------------------------------------------------------------------
# Free search
# ---------------------------------------------------------------------------

def _match_concepts(db, q: str):
    """Concept ids matching a free-text query: exact series code first,
    then name substring, in vocabulary order."""
    ids = []
    for row in db.execute(text(
        "SELECT DISTINCT concept_id FROM concept_code_aliases WHERE UPPER(code) = :code"
    ), {"code": q.strip().upper()}):
        ids.append(row.concept_id)
    for row in db.execute(text("""
        SELECT id FROM curriculum_concepts
        WHERE name_en LIKE :pat OR name_zh LIKE :pat
        ORDER BY display_order, id
    """), {"pat": f"%{escape_like_pattern(q.strip())}%"}):
        if row.id not in ids:
            ids.append(row.id)
    return ids


@router.get("/curriculum/search")
def search_curriculum(
    q: Optional[str] = Query(None, max_length=100, description="Concept name or series code"),
    concept_id: Optional[int] = Query(None),
    school: Optional[str] = Query(None, max_length=255),
    grade: Optional[str] = Query(None, max_length=10),
    lang_stream: Optional[str] = Query(None, max_length=10),
    academic_year: Optional[str] = Query(None, max_length=20),
    week_from: Optional[int] = Query(None, ge=1, le=60),
    week_to: Optional[int] = Query(None, ge=1, le=60),
    role: Optional[str] = Query(None, max_length=20, description="Filter files by role"),
    limit: int = Query(MAX_FILES_PER_CONCEPT, ge=1, le=200, description="Files per concept"),
    _user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Free search over the curriculum map.

    Any combination of a concept filter (q or concept_id) and a timeline
    scope (school+grade, optionally stream/year/week range). With only a
    concept filter: that concept's files. With only a scope: the top
    concepts that school covered in the range, with files. With both: the
    concept filter's matches annotated (not reordered) with the school's
    evidence.
    """
    if not q and not concept_id and not (school and grade):
        raise HTTPException(
            status_code=400,
            detail="Provide q, concept_id, or school+grade.",
        )

    if concept_id:
        concept_ids = [concept_id]
    elif q:
        concept_ids = _match_concepts(db, q)[:MAX_SEARCH_CONCEPTS]
    else:
        concept_ids = None  # scope decides

    evidence = {}
    resolved_year = None
    if school and grade:
        resolved_year = academic_year
        if not resolved_year:
            week_row = _week_for_date(db, hk_now().date())
            resolved_year = week_row[0] if week_row else None
        if not resolved_year:
            resolved_year = db.execute(text(
                "SELECT MAX(academic_year) FROM school_topic_observations "
                "WHERE school = :school AND grade = :grade"
            ), {"school": school, "grade": grade}).scalar()
        if resolved_year:
            rows = _consensus_rows(
                db, school, grade, lang_stream, resolved_year,
                week_from or 1, week_to or 60,
            )
            for week, cid, weight, sources in rows:
                entry = evidence.setdefault(
                    cid, {"weight": 0.0, "weeks": set(), "sources": set()})
                entry["weight"] += float(weight)
                entry["weeks"].add(week)
                entry["sources"].update((sources or "").split(","))

        if concept_ids is None:
            concept_ids = [cid for cid, _ in sorted(
                evidence.items(), key=lambda kv: -kv[1]["weight"]
            )][:MAX_SEARCH_CONCEPTS]

    files_by_concept, concept_meta = _ranked_files(
        db, concept_ids or [],
        preferred_lang=_preferred_lang(lang_stream),
        role_order=ROLE_ORDER_NORMAL,
        role_filter=role,
        scope_school=school,
    )

    concepts = []
    for cid in concept_ids or []:
        meta = concept_meta.get(cid)
        if meta is None:
            continue
        ev = evidence.get(cid)
        concepts.append({
            "concept_id": cid,
            "name_en": meta["name_en"],
            "name_zh": meta["name_zh"],
            "kind": meta["kind"],
            "concept_grade": meta["grade"],
            "evidence": {
                "weight": round(ev["weight"], 2),
                "weeks_observed": sorted(ev["weeks"]),
                "sources": sorted(s for s in ev["sources"] if s),
            } if ev else None,
            "files": files_by_concept.get(cid, [])[:limit],
            "file_count": len(files_by_concept.get(cid, [])),
        })

    return {
        "q": q,
        "school": school,
        "grade": grade,
        "lang_stream": lang_stream,
        "academic_year": resolved_year,
        "concepts": concepts,
    }


# ---------------------------------------------------------------------------
# Exam scopes and revision packs
# ---------------------------------------------------------------------------

@router.get("/curriculum/exams")
def list_school_exams(
    school: str = Query(..., max_length=255),
    grade: str = Query(..., max_length=10),
    from_date: Optional[date_type] = Query(None),
    to_date: Optional[date_type] = Query(None),
    _user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A school-grade's tests/exams with their parsed scope concepts.

    Defaults to the last 12 months plus everything upcoming so the page can
    show the next test and this year's history in one strip. Events whose
    description parses to nothing are still listed — the date alone matters.
    """
    start = from_date or (hk_now().date() - timedelta(days=365))
    filters = [
        CalendarEvent.school == school,
        CalendarEvent.grade == grade,
        CalendarEvent.start_date >= start,
    ]
    if to_date:
        filters.append(CalendarEvent.start_date <= to_date)
    events = (
        db.query(CalendarEvent)
        .filter(*filters)
        .order_by(CalendarEvent.start_date)
        .all()
    )

    stored = _stored_scope_rows(db, [e.id for e in events])
    parsed = []
    concept_ids = set()
    for event in events:
        concepts, unmatched = _event_scope(db, event, stored.get(event.id, []))
        concept_ids.update(concepts)
        parsed.append((event, concepts, unmatched))
    meta = _concept_meta(db, concept_ids)

    out = []
    for event, concepts, unmatched in parsed:
        out.append({
            "id": event.id,
            "title": event.title,
            "event_type": event.event_type,
            "start_date": _iso(event.start_date),
            "concepts": [{
                "concept_id": cid,
                "name_en": meta.get(cid, {}).get("name_en"),
                "name_zh": meta.get(cid, {}).get("name_zh"),
                "confidence": round(float(v["confidence"]), 2),
                "channel": v["channel"],
                "scope_lines": v["lines"],
            } for cid, v in _ranked_scope(concepts)],
            "unmatched_lines": unmatched,
        })
    return {"school": school, "grade": grade, "events": out}


def _past_papers(db, event, scope_ids, meta):
    """Archived tailor-made papers relevant to this event, ranked.

    Two ways in: topic overlap with the event's parsed scope (any school —
    the similar-syllabus case), or the same school and grade filed within
    the same weeks of another year (the same-exam-last-year case, which
    needs no topic signal at all). Same school first, then overlap, then
    the most recent year.
    """
    scope_set = set(scope_ids)
    wk = _week_for_date(db, event.start_date) if event.start_date else None
    event_week = wk.week_number if wk else None

    select = """
        SELECT p.id, p.file_path, p.file_basename, p.variant_paths,
               p.school, p.grade, p.academic_year, p.week_number,
               p.exam_kind, p.scope_source, p.link_confidence,
               c.concept_id, c.confidence
        FROM exam_rev_papers p
        LEFT JOIN exam_rev_paper_concepts c ON c.paper_id = p.id
    """
    params = {"school": event.school, "grade": event.grade}
    if scope_set:
        stmt = text(select + """
            WHERE (p.school = :school AND p.grade = :grade)
               OR c.concept_id IN :ids
        """).bindparams(bindparam("ids", expanding=True))
        params["ids"] = list(scope_set)
    else:
        stmt = text(select + "WHERE p.school = :school AND p.grade = :grade")
    try:
        rows = db.execute(stmt, params).fetchall()
    except Exception:  # pragma: no cover - table not migrated yet
        logger.exception("past paper lookup failed")
        return []

    papers = {}
    for r in rows:
        entry = papers.setdefault(r.id, {"row": r, "matched": {}})
        if r.concept_id is not None and r.concept_id in scope_set:
            prev = entry["matched"].get(r.concept_id, 0.0)
            entry["matched"][r.concept_id] = max(prev, float(r.confidence or 0))

    out = []
    for entry in papers.values():
        r = entry["row"]
        same_school = r.school == event.school and r.grade == event.grade
        week_dist = (abs(r.week_number - event_week)
                     if event_week is not None else None)
        if not entry["matched"]:
            if not (same_school and week_dist is not None
                    and week_dist <= PAST_PAPER_WEEK_WINDOW):
                continue
        matched = sorted(entry["matched"].items(), key=lambda kv: -kv[1])
        try:
            year_key = int(str(r.academic_year)[:4])
        except ValueError:
            year_key = 0
        out.append(((not same_school, -sum(entry["matched"].values()),
                     -year_key, week_dist if week_dist is not None else 99), {
            "id": r.id,
            "file_path": r.file_path,
            "file_basename": r.file_basename,
            "variant_paths": json.loads(r.variant_paths) if r.variant_paths else [],
            "school": r.school,
            "grade": r.grade,
            "academic_year": r.academic_year,
            "week_number": r.week_number,
            "exam_kind": r.exam_kind,
            "scope_source": r.scope_source,
            "link_confidence": (round(float(r.link_confidence), 2)
                                if r.link_confidence is not None else None),
            "same_school": same_school,
            "matched_count": len(matched),
            "matched_concepts": [{
                "concept_id": cid,
                "name_en": meta.get(cid, {}).get("name_en"),
                "name_zh": meta.get(cid, {}).get("name_zh"),
            } for cid, _conf in matched[:4]],
        }))
    out.sort(key=lambda pair: pair[0])
    return [paper for _rank, paper in out[:MAX_PAST_PAPERS]]


@router.get("/curriculum/revision-pack/{event_id}")
def get_revision_pack(
    event_id: int,
    limit: int = Query(MAX_FILES_PER_CONCEPT, ge=1, le=200,
                       description="Files per concept"),
    _user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Everything for one test: its parsed scope concepts with
    revision-ordered files (the school's own scans and stream language
    first), plus any scope lines we could not read — surfaced honestly so
    the tutor knows the pack may be incomplete."""
    event = (
        db.query(CalendarEvent)
        .filter(CalendarEvent.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Calendar event not found")

    concepts, unmatched = _event_scope(db, event)
    ranked = _ranked_scope(concepts)
    stream = _dominant_stream(db, event.school, event.grade)
    files_by_concept, meta = _ranked_files(
        db, [cid for cid, _ in ranked],
        preferred_lang=_preferred_lang(stream),
        role_order=ROLE_ORDER_REVISION,
        scope_school=event.school,
    )
    past_papers = _past_papers(db, event, [cid for cid, _ in ranked], meta)

    return {
        "event": {
            "id": event.id,
            "title": event.title,
            "event_type": event.event_type,
            "start_date": _iso(event.start_date),
            "school": event.school,
            "grade": event.grade,
        },
        "lang_stream": stream,
        "concepts": [{
            "concept_id": cid,
            "name_en": meta.get(cid, {}).get("name_en"),
            "name_zh": meta.get(cid, {}).get("name_zh"),
            "kind": meta.get(cid, {}).get("kind"),
            "concept_grade": meta.get(cid, {}).get("grade"),
            "confidence": round(float(v["confidence"]), 2),
            "channel": v["channel"],
            "scope_lines": v["lines"],
            "files": files_by_concept.get(cid, [])[:limit],
            "file_count": len(files_by_concept.get(cid, [])),
        } for cid, v in ranked],
        "unmatched_lines": unmatched,
        "past_papers": past_papers,
    }


# ---------------------------------------------------------------------------
# Flywheel: tutor topic confirmations
# ---------------------------------------------------------------------------

class ObservationCreate(BaseModel):
    student_id: int
    concept_id: int
    session_date: date_type
    is_revision: bool = False
    # confirm = tutor explicitly says "school is on this topic";
    # accept_suggestion = tutor assigned a suggested file (weaker signal).
    action: Literal["confirm", "accept_suggestion"] = "confirm"


@router.post("/curriculum/observations")
def create_observation(
    body: ObservationCreate,
    user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record a tutor's topic confirmation into the school timeline.

    This is the flywheel that replaces annual curriculum-sheet collection:
    each confirm becomes a source='tutor_confirm' observation and flows into
    the consensus view immediately. Idempotent per tutor + student-week +
    concept + action, so a double-tap doesn't double the evidence.
    """
    student = db.query(Student).filter(Student.id == body.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if not student.school:
        raise HTTPException(status_code=400, detail="Student has no school on record")
    if not student.grade:
        # school_topic_observations.grade is NOT NULL — fail with a clear
        # message instead of an IntegrityError 500.
        raise HTTPException(status_code=400, detail="Student has no grade on record")

    week_row = _week_for_date(db, body.session_date)
    if not week_row:
        raise HTTPException(status_code=400, detail="Date is outside the academic calendar")
    year, week = week_row

    concept = db.execute(text(
        "SELECT id FROM curriculum_concepts WHERE id = :id"
    ), {"id": body.concept_id}).fetchone()
    if not concept:
        raise HTTPException(status_code=404, detail="Concept not found")

    confidence = CONFIRM_CONFIDENCE if body.action == "confirm" else ACCEPT_CONFIDENCE
    source_ref = f"tutor:{user.id}:student:{body.student_id}:{body.action}"

    params = {
        "school": student.school,
        "grade": student.grade,
        "stream": student.lang_stream,
        "year": year,
        "week": week,
        "cid": body.concept_id,
        "is_rev": body.is_revision,
        "ref": source_ref,
    }
    match_where = """
        WHERE school = :school AND grade = :grade
          AND (lang_stream = :stream OR (lang_stream IS NULL AND :stream IS NULL))
          AND academic_year = :year AND week_number = :week
          AND concept_id = :cid AND source = 'tutor_confirm'
          AND is_revision = :is_rev AND source_ref = :ref
    """
    lookup_sql = f"SELECT id FROM school_topic_observations {match_where} LIMIT 1"

    existing = db.execute(text(lookup_sql), params).fetchone()
    if existing:
        return {"id": existing.id, "created": False, "academic_year": year,
                "week_number": week, "school": student.school}

    # Guarded insert (the NOT EXISTS re-checked inside the statement): the
    # table has no unique key backing this idempotency (lang_stream is
    # nullable), so a plain SELECT-then-INSERT lets two concurrent identical
    # confirms both insert and double the evidence weight.
    from_dual = "FROM DUAL " if db.get_bind().dialect.name == "mysql" else ""
    result = db.execute(text(f"""
        INSERT INTO school_topic_observations
            (school, grade, lang_stream, academic_year, week_number, concept_id,
             source, confidence, is_revision, source_ref)
        SELECT :school, :grade, :stream, :year, :week, :cid,
               'tutor_confirm', :conf, :is_rev, :ref
        {from_dual}WHERE NOT EXISTS (
            SELECT 1 FROM school_topic_observations {match_where}
        )
    """), {**params, "conf": confidence})
    db.commit()

    if result.rowcount == 0:
        # Lost the race: a concurrent identical confirm inserted first.
        existing = db.execute(text(lookup_sql), params).fetchone()
        return {"id": existing.id, "created": False, "academic_year": year,
                "week_number": week, "school": student.school}

    logger.info(
        "curriculum confirm: tutor=%s student=%s concept=%s %s wk%s %s conf=%s",
        user.id, body.student_id, body.concept_id, year, week, body.action, confidence,
    )
    return {"id": result.lastrowid, "created": True, "academic_year": year,
            "week_number": week, "school": student.school}


@router.delete("/curriculum/observations/{observation_id}")
def delete_observation(
    observation_id: int,
    user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Undo a mis-tapped confirmation. Only tutor_confirm rows created by the
    calling tutor can be removed — backfilled evidence is never deletable here."""
    row = db.execute(text("""
        SELECT id, source, source_ref FROM school_topic_observations
        WHERE id = :id
    """), {"id": observation_id}).fetchone()
    if not row or row.source != "tutor_confirm":
        raise HTTPException(status_code=404, detail="Confirmation not found")
    if not (row.source_ref or "").startswith(f"tutor:{user.id}:"):
        raise HTTPException(status_code=403, detail="Not your confirmation")

    db.execute(text(
        "DELETE FROM school_topic_observations WHERE id = :id"
    ), {"id": observation_id})
    db.commit()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Explorer data
# ---------------------------------------------------------------------------

@router.get("/curriculum/timeline")
def get_timeline(
    school: str = Query(..., max_length=255),
    grade: str = Query(..., max_length=10),
    lang_stream: Optional[str] = Query(None, max_length=10),
    academic_year: Optional[str] = Query(None, max_length=20),
    _user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One school-grade's weekly consensus timeline (top 3 concepts per week)
    plus its all-years pacing bands — the explorer page's data source."""
    stream_where, stream_param = _stream_where(lang_stream)
    params = {"school": school, "grade": grade, **stream_param}

    years = [r[0] for r in db.execute(text(f"""
        SELECT DISTINCT academic_year FROM school_topic_observations
        WHERE school = :school AND grade = :grade {stream_where}
        ORDER BY academic_year DESC
    """), params)]

    week_row = _week_for_date(db, hk_now().date())
    current_year = week_row[0] if week_row else None
    current_week = week_row[1] if week_row else None

    year = academic_year
    if not year:
        year = current_year if current_year in years else (years[0] if years else None)

    # The consensus/pacing views rank and group within each lang_stream
    # partition (NULL-stream rows form their own partition), so a school with
    # both tagged and untagged observations would surface the same concept
    # twice — two rank-1 rows per week, two pacing bands per concept. Merge
    # partitions per (week, concept) and re-rank by merged weight.
    weeks = defaultdict(dict)
    concept_ids = set()
    if year:
        for row in db.execute(text(f"""
            SELECT week_number, concept_id, weight, source_count, sources
            FROM school_week_topic_consensus
            WHERE school = :school AND grade = :grade {stream_where}
              AND academic_year = :year AND rank_in_week <= 3
        """), {**params, "year": year}):
            entry = weeks[row.week_number].setdefault(row.concept_id, {
                "concept_id": row.concept_id,
                "weight": 0.0,
                "source_count": 0,
                "sources": set(),
            })
            entry["weight"] += float(row.weight)
            entry["source_count"] += row.source_count
            entry["sources"].update(s for s in (row.sources or "").split(",") if s)
    week_entries = {}
    for wk, by_concept in weeks.items():
        entries = sorted(by_concept.values(), key=lambda e: (-e["weight"], e["concept_id"]))[:3]
        for rank, e in enumerate(entries, start=1):
            e["rank"] = rank
            e["sources"] = sorted(e["sources"])
            concept_ids.add(e["concept_id"])
        week_entries[wk] = entries

    pacing_by_concept = {}
    for row in db.execute(text(f"""
        SELECT concept_id, years_observed, mean_week, min_week, max_week,
               week_spread, total_weight
        FROM school_concept_pacing
        WHERE school = :school AND grade = :grade {stream_where}
    """), params):
        concept_ids.add(row.concept_id)
        w = float(row.total_weight or 0)
        entry = pacing_by_concept.get(row.concept_id)
        if entry is None:
            pacing_by_concept[row.concept_id] = {
                "concept_id": row.concept_id,
                "years_observed": row.years_observed,
                "mean_week": float(row.mean_week),
                "min_week": row.min_week,
                "max_week": row.max_week,
                "week_spread": float(row.week_spread),
                "_weight": w,
            }
            continue
        total = entry["_weight"] + w
        if total:
            entry["mean_week"] = (
                entry["mean_week"] * entry["_weight"] + float(row.mean_week) * w
            ) / total
        entry["min_week"] = min(entry["min_week"], row.min_week)
        entry["max_week"] = max(entry["max_week"], row.max_week)
        entry["week_spread"] = max(entry["week_spread"], float(row.week_spread))
        entry["years_observed"] = max(entry["years_observed"], row.years_observed)
        entry["_weight"] = total
    pacing = sorted(pacing_by_concept.values(), key=lambda p: p["mean_week"])
    for p in pacing:
        del p["_weight"]
        # The view emits 1 decimal place; keep merged means on the same contract.
        p["mean_week"] = round(p["mean_week"], 1)

    meta = _concept_meta(db, concept_ids)
    for entries in week_entries.values():
        for e in entries:
            e.update(meta.get(e["concept_id"], {}))
    for p in pacing:
        p.update(meta.get(p["concept_id"], {}))

    # Calendar dates per week so the UI can translate between the two ways
    # tutors think about time ("week 30" vs "mid March").
    week_dates = []
    if year:
        for row in db.execute(text("""
            SELECT week_number, week_start_date, week_end_date
            FROM academic_weeks WHERE academic_year = :year
            ORDER BY week_number
        """), {"year": year}):
            week_dates.append({
                "week_number": row.week_number,
                "start_date": _iso(row.week_start_date),
                "end_date": _iso(row.week_end_date),
            })

    return {
        "school": school,
        "grade": grade,
        "lang_stream": lang_stream,
        "academic_year": year,
        "years_available": years,
        # The live "now" marker only makes sense on the current year's chart.
        "current_week": current_week if year == current_year else None,
        "weeks": [
            {"week_number": wk, "concepts": entries}
            for wk, entries in sorted(week_entries.items())
        ],
        "week_dates": week_dates,
        "pacing": pacing,
    }


@router.get("/curriculum/coverage")
def get_coverage(
    _user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Observation coverage per school-grade-stream-year combo. Thin combos
    are the flywheel targets; also feeds the explorer's school picker."""
    return [
        {
            "school": row.school,
            "grade": row.grade,
            "lang_stream": row.lang_stream,
            "academic_year": row.academic_year,
            "weeks_observed": row.weeks_observed,
            "first_week": row.first_week,
            "last_week": row.last_week,
            "total_weight": float(row.total_weight),
            "tutor_confirms": int(row.tutor_confirms or 0),
        }
        for row in db.execute(text("""
            SELECT school, grade, lang_stream, academic_year,
                   COUNT(DISTINCT week_number) AS weeks_observed,
                   MIN(week_number) AS first_week,
                   MAX(week_number) AS last_week,
                   ROUND(SUM(confidence), 2) AS total_weight,
                   SUM(source = 'tutor_confirm') AS tutor_confirms
            FROM school_topic_observations
            GROUP BY school, grade, lang_stream, academic_year
            ORDER BY school, grade, lang_stream, academic_year
        """))
    ]
