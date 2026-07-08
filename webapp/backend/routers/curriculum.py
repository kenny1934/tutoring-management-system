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
from curriculum.paths import normalize
from database import get_db
from models import CalendarEvent, Student, Tutor

logger = logging.getLogger(__name__)
router = APIRouter()

SUGGESTED_GRADES = ("F1", "F2", "F3")
MAX_CONCEPTS = 3
MAX_SEARCH_CONCEPTS = 10
MAX_FILES_PER_CONCEPT = 8

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


def _dedupe_files(files):
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


# School-specific scans live under 中學參考教材\F1..F6\SCHOOL-CODE\...
_REFERENCE_SCHOOL_RE = re.compile(r"中學參考教材\\F[1-6]\\([^\\]+)\\")


def _reference_school(file_path):
    m = _REFERENCE_SCHOOL_RE.search(file_path or "")
    return m.group(1) if m else None


def _ranked_files(db, concept_ids, preferred_lang, role_order, role_filter=None,
                  scope_school=None):
    """(files_by_concept, concept_meta): sorted, deduped, popularity-joined.

    concept_meta covers ALL requested ids (concepts with no usable files are
    still worth showing by name). When scope_school is given, that school's
    own reference scans outrank everything — they are the most relevant
    material for the school being looked at.
    """
    file_rows = _files_for_concepts(db, concept_ids)
    popularity = _popularity_map(db)

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
        pop = popularity.get((r.file_basename or "").rsplit(".", 1)[0])
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
            "latest_use": _iso(pop.latest_use) if pop else None,
        })

    for cid, files in files_by_concept.items():
        files.sort(key=lambda f: (
            0 if f["from_school"] else 1,
            lang_rank(f["lang"]),
            role_order.get(f["role"], 9),
            -(f["confidence"] or 0),
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
        key = normalize(r.pdf_name)["basename"].rsplit(".", 1)[0].lower()
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
            "start_date": _iso(exam.start_date),
        }

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
            done = assigned.get((f["file_basename"] or "").rsplit(".", 1)[0].lower())
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
    lanes with an HK school's."""
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

    return [
        {
            "id": row.id,
            "kind": row.kind,
            "name_en": row.name_en,
            "name_zh": row.name_zh,
            "grade": row.grade,
            "parent_id": row.parent_id,
            "codes": codes.get(row.id, []),
            "equivalent_ids": equivalents.get(row.id, []),
        }
        for row in db.execute(text(
            "SELECT id, kind, name_en, name_zh, grade, parent_id "
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
    """), {"pat": f"%{q.strip()}%"}):
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
    limit: int = Query(MAX_FILES_PER_CONCEPT, ge=1, le=50, description="Files per concept"),
    _user: Tutor = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Free search over the curriculum map.

    Any combination of a concept filter (q or concept_id) and a timeline
    scope (school+grade, optionally stream/year/week range). With only a
    concept filter: that concept's files. With only a scope: the top
    concepts that school covered in the range, with files. With both: the
    concept filter ordered/annotated by the school's evidence.
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
    existing = db.execute(text("""
        SELECT id FROM school_topic_observations
        WHERE school = :school AND grade = :grade
          AND (lang_stream = :stream OR (lang_stream IS NULL AND :stream IS NULL))
          AND academic_year = :year AND week_number = :week
          AND concept_id = :cid AND source = 'tutor_confirm'
          AND is_revision = :is_rev AND source_ref = :ref
        LIMIT 1
    """), params).fetchone()
    if existing:
        return {"id": existing.id, "created": False, "academic_year": year,
                "week_number": week, "school": student.school}

    result = db.execute(text("""
        INSERT INTO school_topic_observations
            (school, grade, lang_stream, academic_year, week_number, concept_id,
             source, confidence, is_revision, source_ref)
        VALUES (:school, :grade, :stream, :year, :week, :cid,
                'tutor_confirm', :conf, :is_rev, :ref)
    """), {**params, "conf": confidence})
    db.commit()

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

    weeks = defaultdict(list)
    concept_ids = set()
    if year:
        for row in db.execute(text(f"""
            SELECT week_number, concept_id, weight, source_count, sources, rank_in_week
            FROM school_week_topic_consensus
            WHERE school = :school AND grade = :grade {stream_where}
              AND academic_year = :year AND rank_in_week <= 3
            ORDER BY week_number, rank_in_week
        """), {**params, "year": year}):
            concept_ids.add(row.concept_id)
            weeks[row.week_number].append({
                "concept_id": row.concept_id,
                "weight": float(row.weight),
                "source_count": row.source_count,
                "sources": sorted(s for s in (row.sources or "").split(",") if s),
                "rank": row.rank_in_week,
            })

    pacing = []
    for row in db.execute(text(f"""
        SELECT concept_id, years_observed, mean_week, min_week, max_week, week_spread
        FROM school_concept_pacing
        WHERE school = :school AND grade = :grade {stream_where}
        ORDER BY mean_week
    """), params):
        concept_ids.add(row.concept_id)
        pacing.append({
            "concept_id": row.concept_id,
            "years_observed": row.years_observed,
            "mean_week": float(row.mean_week),
            "min_week": row.min_week,
            "max_week": row.max_week,
            "week_spread": float(row.week_spread),
        })

    meta = _concept_meta(db, concept_ids)
    for entries in weeks.values():
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
            for wk, entries in sorted(weeks.items())
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
