"""Curriculum-aware exercise suggestions.

Answers "what is this student's school teaching right now, and which of our
PDFs fit" by combining two layers built in migrations 123-125:

  timeline  — school_topic_observations rolled up by the consensus/pacing
              views: per school x grade x stream, which concept each week.
  content   — courseware_concepts: PDFs mapped to concepts, with role/lang.

Concept evidence is tried in tiers, strongest first:
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
import logging
import time
from collections import defaultdict
from datetime import date as date_type, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from auth.dependencies import get_current_user
from constants import hk_now
from database import get_db
from models import CalendarEvent, Student, Tutor

logger = logging.getLogger(__name__)
router = APIRouter()

SUGGESTED_GRADES = ("F1", "F2", "F3")
MAX_CONCEPTS = 3
MAX_FILES_PER_CONCEPT = 8

# Evidence at the current week counts full; nearby weeks progressively less
# (a school seen on a topic two weeks ago has likely moved on).
WEEK_DECAY = {0: 1.0, 1: 0.6, 2: 0.35}
PACING_HALF_WINDOW = 3
EXAM_LOOKAHEAD_DAYS = 14

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


def _consensus_rows(db, school, grade, stream, year, week_lo, week_hi):
    rows = db.execute(text("""
        SELECT week_number, concept_id, weight, sources
        FROM school_week_topic_consensus
        WHERE school = :school AND grade = :grade
          AND (lang_stream = :stream OR lang_stream IS NULL)
          AND academic_year = :year
          AND week_number BETWEEN :lo AND :hi
    """), {"school": school, "grade": grade, "stream": stream,
           "year": year, "lo": week_lo, "hi": week_hi}).fetchall()
    return rows


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
    """Return (tier, [(concept_id, evidence), ...]) — first tier with rows wins."""
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
    rows = db.execute(text("""
        SELECT concept_id, mean_week, total_weight, years_observed
        FROM school_concept_pacing
        WHERE school = :school AND grade = :grade
          AND (lang_stream = :stream OR lang_stream IS NULL)
          AND mean_week BETWEEN :lo AND :hi
    """), {"school": school, "grade": grade, "stream": stream,
           "lo": week - PACING_HALF_WINDOW, "hi": week + PACING_HALF_WINDOW}).fetchall()
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


# The popularity view derives its grouping key from every session_exercises
# row on each query (~650ms server-side), and popularity only breaks ties —
# staleness is harmless. Cache the whole filename -> counts map in-process.
_POPULARITY_TTL_SECONDS = 600
_popularity_cache = {"loaded_at": 0.0, "map": {}}


def _popularity_map(db):
    """assignment counts from the migration-036 summary view, keyed by
    extension-stripped basename (the view's grouping key)."""
    now = time.monotonic()
    if now - _popularity_cache["loaded_at"] > _POPULARITY_TTL_SECONDS:
        rows = db.execute(text("""
            SELECT filename, assignment_count, unique_student_count, latest_use
            FROM courseware_popularity_summary
        """)).fetchall()
        _popularity_cache["map"] = {r.filename: r for r in rows}
        _popularity_cache["loaded_at"] = now
    return _popularity_cache["map"]


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

    week_row = db.execute(text("""
        SELECT academic_year, week_number FROM academic_weeks
        WHERE :d BETWEEN week_start_date AND week_end_date
        LIMIT 1
    """), {"d": on_date.isoformat()}).fetchone()
    if not week_row:
        base["reason"] = "no_academic_week"
        return base
    year, week = week_row
    base["academic_year"] = year
    base["week_number"] = week

    tier, scored = _predict_concepts(
        db, student.school, student.grade, student.lang_stream, year, week
    )
    base["tier"] = tier
    if not scored:
        base["reason"] = "no_timeline"
        return base

    top = sorted(scored.items(), key=lambda kv: (-kv[1]["score"], kv[0]))[:MAX_CONCEPTS]
    concept_ids = [cid for cid, _ in top]

    exam = _upcoming_exam(db, student, on_date)
    revision_mode = exam is not None
    base["revision_mode"] = revision_mode
    if exam:
        base["upcoming_exam"] = {
            "title": exam.title,
            "event_type": exam.event_type,
            "start_date": exam.start_date.isoformat() if exam.start_date else None,
        }

    file_rows = _files_for_concepts(db, concept_ids)
    popularity = _popularity_map(db)

    role_order = ROLE_ORDER_REVISION if revision_mode else ROLE_ORDER_NORMAL
    # 'C'/'E' stream -> 'c'/'e' file language; unmarked files sit between
    # matching and opposite language.
    preferred_lang = (student.lang_stream or "").strip().lower()[:1] or None

    def lang_rank(lang):
        if preferred_lang is None or lang == preferred_lang:
            return 0
        return 1 if lang is None else 2

    files_by_concept = defaultdict(list)
    concept_meta = {}
    for r in file_rows:
        concept_meta[r.concept_id] = {
            "name_en": r.name_en, "name_zh": r.name_zh,
            "kind": r.kind, "grade": r.concept_grade,
        }
        pop = popularity.get((r.file_basename or "").rsplit(".", 1)[0])
        files_by_concept[r.concept_id].append({
            "file_path": r.file_path,
            "file_basename": r.file_basename,
            "role": r.role,
            "lang": r.lang,
            "confidence": float(r.confidence) if r.confidence is not None else None,
            "map_source": r.source,
            "assignment_count": pop.assignment_count if pop else 0,
            "unique_student_count": pop.unique_student_count if pop else 0,
            "latest_use": _iso(pop.latest_use) if pop else None,
        })

    # Names for predicted concepts that have no usable files yet — still worth
    # telling the tutor what the school is on.
    missing = [cid for cid in concept_ids if cid not in concept_meta]
    if missing:
        stmt = text("""
            SELECT id, name_en, name_zh, kind, grade FROM curriculum_concepts
            WHERE id IN :ids
        """).bindparams(bindparam("ids", expanding=True))
        for row in db.execute(stmt, {"ids": missing}):
            concept_meta[row.id] = {
                "name_en": row.name_en, "name_zh": row.name_zh,
                "kind": row.kind, "grade": row.grade,
            }

    def dedupe(files):
        """The map holds the same file with and without its extension (raw
        AppSheet-era pdf_name often lacked one). Keep one row per stripped
        basename, preferring the variant with a real extension."""
        kept = {}
        for f in files:
            key = (f["file_basename"] or "").rsplit(".", 1)[0].lower()
            prev = kept.get(key)
            if prev is None:
                kept[key] = f
            elif "." not in (prev["file_basename"] or "") and "." in (f["file_basename"] or ""):
                prev["file_path"] = f["file_path"]
                prev["file_basename"] = f["file_basename"]
        return list(kept.values())

    suggestions = []
    for concept_id, evidence in top:
        files = files_by_concept.get(concept_id, [])
        files.sort(key=lambda f: (
            lang_rank(f["lang"]),
            role_order.get(f["role"], 9),
            -(f["confidence"] or 0),
            -f["assignment_count"],
            f["file_basename"] or "",
        ))
        files = dedupe(files)
        meta = concept_meta.get(concept_id, {})
        why = {
            "tier": tier,
            "weight": round(evidence["weight"], 2),
            "sources": sorted(s for s in evidence["sources"] if s),
            "weeks_observed": sorted(evidence["weeks"]),
        }
        if "mean_week" in evidence:
            why["mean_week"] = evidence["mean_week"]
            why["years_observed"] = evidence["years_observed"]
        suggestions.append({
            "concept_id": concept_id,
            "name_en": meta.get("name_en"),
            "name_zh": meta.get("name_zh"),
            "kind": meta.get("kind"),
            "concept_grade": meta.get("grade"),
            "why": why,
            "files": files[:MAX_FILES_PER_CONCEPT],
        })

    base["suggestions"] = suggestions
    return base
