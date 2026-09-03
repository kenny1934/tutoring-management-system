"""Backfill school_topic_observations from three evidence sources.

  prep_folder — weekly prep folders on the MCSA drive, 4 academic years
                (tree listing in private/curriculum_data/drive_trees/).
                Confidence decays with age: folder discipline and relevance
                are weaker in older years.
  assignment  — session_exercises joined to students (F1-F3) and academic_weeks.
                Behavioural evidence, noisier (test-prep, catch-up): 0.70.
                A file's topic comes from the chapter code in its name, or
                failing that from the content map (courseware_concepts), so a
                school scan or renamed file a tutor pasted counts once the map
                knows it. Map rows that came from AI classification carry 0.65.
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

from _common import PRIV, canon_school, connect, norm  # noqa: E402  (sets sys.path + .env)
from curriculum.parser import parse_pdf_name  # noqa: E402
from curriculum.paths import basename_key, normalize  # noqa: E402

TREE_V = os.path.join(PRIV, "drive_trees", "tree_v_secondary.txt")

ASSIGN_CONF = 0.70
# An assignment resolved through an AI-classified content-map row sits one
# step below one whose filename carries the chapter code outright.
ASSIGN_MAP_AI_CONF = 0.65
# Content-map roles that mean test prep rather than first teaching. The
# filename parser already flags most of these; the role catches the rest.
REVISION_ROLES = {"revision", "past_paper", "mock"}
SHEET_CONF = 0.85
AI_CONF = {"high": 0.75, "med": 0.65, "medium": 0.65, "low": 0.55}


def _current_start_year(today=None):
    """Calendar year in which the current school year began (1 September)."""
    today = today or date.today()
    return today.year if today.month >= 9 else today.year - 1


def year_conf(academic_year, today=None):
    """Confidence for a weekly prep folder observation, by how old the year is.

    Newer years describe the school's present pace better than older ones, so
    the current school year gets 0.90 and every year further back loses 0.10,
    down to a floor of 0.60. This used to be a hand-written table that stopped
    at 2025-2026, which meant the first folders of a new school year were
    silently skipped until someone extended the table. Years that have not
    started yet return None and are skipped: a folder named for a future year
    is a filing mistake rather than evidence.
    """
    try:
        start = int(academic_year.split("-")[0])
    except (AttributeError, ValueError):
        return None
    age = _current_start_year(today) - start
    if age < 0:
        return None
    return max(0.60, round(0.90 - 0.10 * age, 2))


def sheet_row_conf(concept):
    """Confidence for a live-sheet observation, from how the part was resolved.

    A mechanical match at the parser's exact-name level gets the same 0.85
    the frozen July sheet rows carry. Fuzzier mechanical matches and AI
    answers step down through the same tiers the July AI residuals used,
    so evidence from the two sheet imports weighs alike.
    """
    conf = float(concept.get("confidence", 0))
    if concept.get("channel") == "ai":
        return 0.75 if conf >= 0.9 else 0.65 if conf >= 0.7 else 0.55
    return SHEET_CONF if conf >= 0.9 else 0.75


def concept_for(alias_map, space, code):
    return alias_map.get((space, code), [])


def hk_concepts(alias_map, code):
    """Dry-run sheet series 'HK' is generation-agnostic: prefer new, fall back old."""
    return alias_map.get(("HK_NEW", code)) or alias_map.get(("HK_OLD", code)) or []


class ContentMap:
    """The content map (courseware_concepts), keyed for looking up an assigned file.

    session_exercises.pdf_name holds whatever the tutor pasted: a drive-letter
    path, an alias path, sometimes a bare name. normalize() strips the prefix
    so the full path is tried first. The basename is the fallback, because a
    weekly-folder copy of a reference scan lives under a different path from
    the row the map holds for it. Both keys are lowercased and the basename
    loses its extension, which is the same key the suggestions router uses to
    join assignment history.
    """

    def __init__(self, rows):
        self.by_path = defaultdict(list)
        self.by_base = defaultdict(list)
        for match_path, basename, cid, role, source, conf in rows:
            entry = (cid, role, source, float(conf))
            self.by_path[match_path.lower()].append(entry)
            self.by_base[basename_key(basename)].append(entry)

    @classmethod
    def load(cls, cur):
        cur.execute("SELECT match_path, file_basename, concept_id, role, source, confidence "
                    "FROM courseware_concepts")
        return cls(cur.fetchall())

    def lookup(self, pdf_name):
        """[(concept_id, role, source, confidence)] for a file, or [] when unknown."""
        n = normalize(pdf_name)
        hits = self.by_path.get(n["match_path"].lower())
        if not hits and n["basename"]:
            hits = self.by_base.get(basename_key(n["basename"]))
        return hits or []


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
        conf = year_conf(year)
        if conf is None:
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
                    cid, "prep_folder", conf, is_rev, line)

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

    # A file's topic comes from the chapter code in its name when it has one.
    # Otherwise the content map is asked, which is how a school scan, a
    # tailor-made paper or a renamed file that a tutor pasted in still counts.
    cmap = ContentMap.load(cur)
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
        is_rev = p.get("is_rev", False)
        cids = (concept_for(alias_map, space, code)
                if code and space not in ("SM", "SS", None) else [])
        if cids:
            hits = [(cid, ASSIGN_CONF, is_rev) for cid in cids]
            stats["assign:code"] += 1
        else:
            hits = [(cid, ASSIGN_MAP_AI_CONF if source == "ai" else ASSIGN_CONF,
                     is_rev or role in REVISION_ROLES)
                    for cid, role, source, _conf in cmap.lookup(pdf)]
            stats["assign:content_map" if hits else "assign:unresolved"] += 1
        schools = canon_school(school, stream) or [norm(school)]
        for sc in schools:
            for cid, conf, rev in hits:
                add(sc, grade, stream or None, year, week, cid, "assignment",
                    conf, rev, f"session_exercise:{se_id}")

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

    # ---- channel 3b: live curriculum sheets ---------------------------------
    # import_curriculum_sheets.py reads each year's Google Sheet and leaves one
    # file per year here, rows already resolved to concept ids. The frozen
    # July file above still covers 2024-25 and 2025-26; these files carry the
    # years imported live, starting with 2026-27.
    sheets_dir = os.path.join(PRIV, "sheets")
    live_files = (sorted(n for n in os.listdir(sheets_dir)
                         if n.startswith("sheet_") and n.endswith(".json"))
                  if os.path.isdir(sheets_dir) else [])
    for name in live_files:
        data = json.load(open(os.path.join(sheets_dir, name), encoding="utf-8"))
        year = data["academic_year"]
        for row in data["rows"]:
            ref = (f"sheet:{year}:{row['school']}:{row['grade']}{row['stream'] or ''}"
                   f":wk{row['week']}:{row['text'][:60]}")
            for c in row["concepts"]:
                add(row["school"], row["grade"], row["stream"], year, row["week"],
                    c["concept_id"], "sheet", sheet_row_conf(c),
                    bool(row.get("is_revision")), ref)
            stats[f"sheet_live:{year}"] += 1

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
