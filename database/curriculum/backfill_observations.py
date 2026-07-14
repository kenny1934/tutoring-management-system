"""Backfill school_topic_observations from three evidence sources.

  prep_folder — weekly prep folders on the MCSA drive, 4 academic years
                (tree listing in private/curriculum_data/drive_trees/).
                Confidence decays with age: folder discipline and relevance
                are weaker in older years.
  assignment  — session_exercises joined to students (F1-F3) and academic_weeks.
                Behavioural evidence, noisier (test-prep, catch-up): 0.70.
  sheet       — hand-collected school curriculum sheets, both years, from the
                dry-run classification (private/curriculum_data/dryrun/):
                mechanical matches 0.85, AI-mapped residuals 0.55-0.75.

Idempotent by rebuild: deletes rows of these three sources and re-inserts.
tutor_confirm rows (the flywheel) are NEVER touched.

Usage (from repo root):
    webapp/backend/venv/bin/python database/curriculum/backfill_observations.py [--dry-run]
"""
import argparse
import json
import os
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date

from _common import PRIV, connect  # noqa: E402  (sets sys.path + .env)
from curriculum.parser import parse_pdf_name  # noqa: E402

TREE_V = os.path.join(PRIV, "drive_trees", "tree_v_secondary.txt")

YEAR_CONF = {"2025-2026": 0.90, "2024-2025": 0.80, "2023-2024": 0.70, "2022-2023": 0.60}
ASSIGN_CONF = 0.70
SHEET_CONF = 0.85
AI_CONF = {"high": 0.75, "med": 0.65, "medium": 0.65, "low": 0.55}

_school_data = json.load(open(os.path.join(PRIV, "school_aliases.json"), encoding="utf-8"))
CANON_SET = set(_school_data["CANON"])
FIX = _school_data["FIX"]


def norm(s):
    return unicodedata.normalize("NFKC", s or "").strip()


def canon_school(name, stream=None):
    """Return list of canonical school names (multi-school folders split)."""
    name = norm(name)
    if name in ("新增資料夾", "") or name.endswith(".pdf"):
        return []
    parts = (re.split(r"[,，]\s*|\s{1,}(?=[A-Z一-鿿])", name)
             if (" " in name or "," in name or "，" in name) else [name])
    out = []
    for p in parts:
        p = FIX.get(p.strip(), p.strip())
        if not p:
            continue
        if p in CANON_SET:
            out.append(p)
        elif stream and f"{p}-{stream}" in CANON_SET:
            out.append(f"{p}-{stream}")
        # unknown school folders are dropped (counted by caller via empty result)
    return out


def concept_for(alias_map, space, code):
    return alias_map.get((space, code), [])


def hk_concepts(alias_map, code):
    """Dry-run sheet series 'HK' is generation-agnostic: prefer new, fall back old."""
    return alias_map.get(("HK_NEW", code)) or alias_map.get(("HK_OLD", code)) or []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT code_space, code, concept_id FROM concept_code_aliases")
    alias_map = defaultdict(list)
    for space, code, cid in cur.fetchall():
        alias_map[(space, code)].append(cid)

    stats = Counter()
    # dedupe key -> [confidence, source_ref]
    best = {}

    def add(school, grade, stream, year, week, cid, source, conf, is_rev, ref):
        key = (school, grade, stream or None, year, week, cid, source, bool(is_rev))
        cur_row = best.get(key)
        if cur_row is None or conf > cur_row[0]:
            best[key] = [conf, ref[:500]]
        stats[source] += 1

    # ---- channel 1: prep folders (4 years) ----------------------------------
    for line in open(TREE_V, encoding="utf-8", errors="replace"):
        line = line.rstrip("\n").strip()
        if not line.lower().endswith(".pdf"):
            continue
        p = parse_pdf_name(line)
        year, week = p.get("wk_year"), p.get("week")
        if not (year and week and p.get("wk_grade") and p.get("wk_school")):
            continue
        if year not in YEAR_CONF:
            continue
        code, space = p.get("code"), p.get("code_space")
        if not code or space in ("SM", "SS", None):
            stats["prep:no_code"] += 1
            continue
        cids = concept_for(alias_map, space, code)
        if not cids:
            stats["prep:no_concept"] += 1
            continue
        schools = canon_school(p["wk_school"], p.get("wk_stream"))
        if not schools:
            stats["prep:unknown_school"] += 1
            continue
        is_rev = p.get("is_rev") or p.get("wk_school_exam", False)
        for school in schools:
            for cid in cids:
                add(school, p["wk_grade"], p.get("wk_stream"), year, week,
                    cid, "prep_folder", YEAR_CONF[year], is_rev, line)

    # ---- channel 2: assignments (prod, F1-F3) --------------------------------
    cur.execute("SELECT academic_year, week_number, week_start_date, week_end_date FROM academic_weeks")
    weeks = cur.fetchall()

    def week_of(d):
        for year, wn, start, end in weeks:
            if start <= d <= end:
                return year, wn
        return None, None

    # students.grade moves every September (promote-grades), but an
    # observation belongs to the year the session happened: rebuild after a
    # promotion and today's grade is one too high for last year's sessions.
    # Shift it back by how many academic years lie between the two.
    year_starts = {}
    for year, _wn, start, _end in weeks:
        if year not in year_starts or start < year_starts[year]:
            year_starts[year] = start
    year_order = sorted(year_starts, key=lambda y: year_starts[y])
    today = date.today()
    current_ay = None
    for y in year_order:
        if year_starts[y] <= today:
            current_ay = y

    def grade_at(current_grade, session_year):
        if current_ay is None or session_year == current_ay:
            return current_grade
        offset = year_order.index(current_ay) - year_order.index(session_year)
        m = re.match(r"^F([1-6])$", current_grade or "")
        if not m:
            return None
        n = int(m.group(1)) - offset
        return "F%d" % n if 1 <= n <= 6 else None

    cur.execute(
        "SELECT se.id, se.pdf_name, sl.session_date, s.school, s.grade, s.lang_stream "
        "FROM session_exercises se "
        "JOIN session_log sl ON sl.id = se.session_id "
        "JOIN students s ON s.id = sl.student_id "
        "WHERE s.grade REGEXP '^F[1-6]$' AND se.pdf_name IS NOT NULL AND se.pdf_name != '' "
        "AND s.school IS NOT NULL AND s.school != ''"
    )
    for se_id, pdf, sdate, school, grade, stream in cur.fetchall():
        year, week = week_of(sdate)
        if not year:
            stats["assign:no_week"] += 1
            continue
        grade = grade_at(grade, year)
        if grade not in ("F1", "F2", "F3"):
            stats["assign:grade_out_of_range"] += 1
            continue
        p = parse_pdf_name(pdf)
        code, space = p.get("code"), p.get("code_space")
        if not code or space in ("SM", "SS", None):
            stats["assign:no_code"] += 1
            continue
        cids = concept_for(alias_map, space, code)
        if not cids:
            stats["assign:no_concept"] += 1
            continue
        schools = canon_school(school, stream) or [norm(school)]
        for sc in schools:
            for cid in cids:
                add(sc, grade, stream or None, year, week, cid, "assignment",
                    ASSIGN_CONF, p.get("is_rev", False), f"session_exercise:{se_id}")

    # ---- channel 3: curriculum sheets (both years) ---------------------------
    sheet = json.load(open(os.path.join(PRIV, "dryrun", "sheet_classified.json"), encoding="utf-8"))
    residual = {}
    for i in range(3):
        path = os.path.join(PRIV, "dryrun", f"residual_mapped{i}.json")
        if os.path.exists(path):
            for e in json.load(open(path, encoding="utf-8")):
                residual[e["s"]] = e

    # per (school, grade) dominant series from assignment behaviour, for AI residual picks
    pref = defaultdict(Counter)
    for (school, grade, stream, year, week, cid, source, is_rev) in best:
        if source == "assignment":
            pref[(school, grade)][cid] += 1
    cur.execute("SELECT a.concept_id, a.code_space FROM concept_code_aliases a")
    space_of_cid = defaultdict(set)
    for cid, space in cur.fetchall():
        space_of_cid[cid].add(space)

    def pref_series(school, grade):
        counts = Counter()
        for cid, n in pref[(school, grade)].items():
            for sp in space_of_cid[cid]:
                counts["MAS" if sp == "MAS" else "HK"] += n
        return counts.most_common(1)[0][0] if counts else None

    for row in sheet:
        if row.get("type") != "topic":
            stats["sheet:nontopic"] += 1
            continue
        year, week = row["year"], row["week"]
        school, grade, stream = row["school"], row["grade"], row.get("stream")
        series, code, conf = row.get("series"), row.get("code"), SHEET_CONF
        if not code:
            e = residual.get(row["part"]) or residual.get(row["part"].strip())
            if not e or e.get("type") != "topic":
                stats["sheet:unmapped"] += 1
                continue
            ps = pref_series(school, grade)
            if ps == "MAS":
                series, code = "MAS", e.get("mas")
            elif ps == "HK":
                series, code = "HK", e.get("hk")
            if not code:  # no preference or preferred space missing: take whichever exists
                series, code = ("MAS", e["mas"]) if e.get("mas") else ("HK", e.get("hk"))
            if not code:
                stats["sheet:unmapped"] += 1
                continue
            conf = AI_CONF.get(str(e.get("conf")).lower(), 0.55)
        cids = (concept_for(alias_map, "MAS", code) if series == "MAS"
                else hk_concepts(alias_map, code))
        if not cids:
            stats["sheet:no_concept"] += 1
            continue
        ref = f"{row['source']}:{school}:{grade}{stream or ''}:wk{week}:{row['part'][:60]}"
        for cid in cids:
            add(school, grade, stream, year, week, cid, "sheet", conf, False, ref)

    rows = [(k[0], k[1], k[2], k[3], k[4], k[5], k[6], v[0], k[7], v[1])
            for k, v in best.items()]
    print(f"deduped observations: {len(rows)}")
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}")
    by_source = Counter(r[6] for r in rows)
    print("  unique by source:", dict(by_source))

    if args.dry_run:
        print("Dry run — no writes.")
        return

    try:
        cur.execute("DELETE FROM school_topic_observations "
                    "WHERE source IN ('prep_folder','assignment','sheet')")
        print(f"deleted {cur.rowcount} existing backfill rows")
        cur.executemany(
            "INSERT INTO school_topic_observations "
            "(school, grade, lang_stream, academic_year, week_number, concept_id, "
            " source, confidence, is_revision, source_ref) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            rows,
        )
        conn.commit()
        cur.execute("SELECT COUNT(*) FROM school_topic_observations")
        print(f"school_topic_observations now has {cur.fetchone()[0]} rows")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
