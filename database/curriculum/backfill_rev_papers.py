"""Backfill exam_rev_papers + exam_rev_paper_concepts from the weekly drive tree.

Tailor-made revision papers sit in the weekly prep folders in three shapes:

  P1  exam-suffixed school folder      SHCC-E(Exam), PTMS(Test), DBYW-E Exam Practice
  P2  revision subfolder below school  Test Rev, 溫習, Mid Term Revision
  P3  exam keyword in the filename     Mock2.pdf, F2_統測_溫習.pdf

Answer keys and .docx sources are folded into their paper's variant_paths.
Each paper is linked to the calendar event it was prepared for (same school,
grade and academic year, folder week within ±2 of the event week) and its
topic index is filled from the strongest tier available:

  event  the linked event's parsed scope (exam_scope_concepts)
  code   a chapter code in the filename via concept_code_aliases
  proxy  scope of the same school and grade's event in another year at a
         similar week (school exams recur annually), confidence dampened

'ai' rows come from a later filename pass and 'manual' rows from curation:
both survive re-runs. Papers are upserted by match_path and rows for files
no longer in the tree are removed.

Usage (from repo root):
    webapp/backend/venv/bin/python database/curriculum/backfill_rev_papers.py [--dry-run]
"""
import argparse
import json
import os
import re
import unicodedata
from collections import Counter, defaultdict

from _common import PRIV, connect  # noqa: E402  (sets sys.path + .env)
from curriculum.parser import GRADE_RE, SCHOOL_EXAM_RE, WEEK_RE, parse_pdf_name  # noqa: E402
from curriculum.paths import normalize, to_alias_path  # noqa: E402

TREE_V = os.path.join(PRIV, "drive_trees", "tree_v_secondary.txt")

DOC_EXT_RE = re.compile(r"(?i)\.(pdf|docx?)$")
REV_SUB_RE = re.compile(
    r"(?i)(?<![a-z])rev(?:ision)?(?![a-z])|複習|复习|溫習|温習|温习"
    r"|(?<![a-z])(exam|test|mock)(?![a-z])|考試|測驗|統測|大測|小測|溫test|温test|mid ?term"
)
# exam-specific filename markers: generic rev-only names ("Rev1.pdf") are too
# noisy to trust outside a P1/P2 folder
EXAMISH_RE = re.compile(
    r"(?i)mock|(?<![a-z])exam(?![a-z])|(?<![a-z])test(?![a-z])"
    r"|考試|測驗|統測|大測|小測|試卷|模擬"
)
ANS_RE = re.compile(r"(?i)_ans|answer|答案|marking")
# school-folder suffixes that are not part of the school name
SCHOOL_STRIP_RE = re.compile(
    r"(?i)\s*[(（].*?[)）]\s*$|_DiskStation.*$|\s+(exam|test)\s*practice.*$|\s+ver[\d.]+$"
)

KIND_PATTERNS = [
    ("Mock", re.compile(r"(?i)mock|模擬")),
    ("Exam", re.compile(r"(?i)(?<![a-z])exam(?![a-z])|考試|考试")),
    ("Quiz", re.compile(r"(?i)quiz|小測")),
    ("Test", re.compile(r"(?i)(?<![a-z])test(?![a-z])|測驗|测验|統測|统测|大測|補測")),
]
KIND_EQUIV = {"Mock": "Exam"}  # calendar events have no Mock type

LINK_CONF_SINGLE = 0.85
LINK_CONF_KIND = 0.70
LINK_CONF_NEAREST = 0.50
CODE_CONF = 0.85
PROXY_DAMP = 0.60
LINK_WINDOW = 2
PROXY_WINDOW = 3

_school_data = json.load(open(os.path.join(PRIV, "school_aliases.json"), encoding="utf-8"))
CANON_SET = set(_school_data["CANON"])
FIX = _school_data["FIX"]


def norm(s):
    return unicodedata.normalize("NFKC", s or "").strip()


def clean_school(seg):
    s = norm(seg)
    prev = None
    while prev != s:
        prev = s
        s = SCHOOL_STRIP_RE.sub("", s).strip()
    return s


def canon_school(name, stream=None):
    """Return list of canonical school names (multi-school folders split)."""
    name = clean_school(name)
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
        elif p.replace("_", "-") in CANON_SET:
            out.append(p.replace("_", "-"))
    return out


def detect_kind(*texts):
    for text in texts:
        if not text:
            continue
        for kind, pat in KIND_PATTERNS:
            if pat.search(text):
                return kind
    return None


DATE_TOKEN_RE = re.compile(r"[(（]\s*\d{2,4}[._-]\d{1,2}[._-]\d{1,2}\s*[)）]")


def paper_stem(fn):
    # filename dates are copy-paste noise: a paper and its answer key often
    # disagree on the date token, so it can't be part of the variant key
    s = DOC_EXT_RE.sub("", fn)
    s = DATE_TOKEN_RE.sub("", s)
    s = re.sub(r"(?i)[_\s(（]*(ans|answers?|答案|改)[)）]*$", "", s)
    return re.sub(r"\s+", " ", s).strip("_ ").lower()


def scan_tree(stats):
    """Detected files grouped into papers: {stem_key: [file dicts]}."""
    papers = defaultdict(list)
    for line in open(TREE_V, encoding="utf-8", errors="replace"):
        line = line.rstrip("\n").strip()
        segs = line.split("\\")
        fn = segs[-1]
        if not DOC_EXT_RE.search(fn):
            continue
        widx = next((i for i, s in enumerate(segs) if WEEK_RE.search(s)), None)
        if widx is None:
            continue
        year = next((s for s in segs[:widx] if re.fullmatch(r"20\d\d-20\d\d", s)), None)
        if not year:
            continue
        stats["weekly_files"] += 1
        week = int(WEEK_RE.search(segs[widx]).group(1))
        grade = stream = school_seg = None
        gi = widx + 1
        if gi < len(segs) - 1:
            g = GRADE_RE.match(segs[gi].strip())
            if g:
                grade = g.group(1).upper()
                stream = g.group(2).upper() if g.group(2) else None
                if gi + 1 < len(segs) - 1:
                    school_seg = segs[gi + 1].strip()
        mid = segs[gi + 2:-1] if school_seg else []
        if school_seg and SCHOOL_EXAM_RE.search(school_seg):
            pat = "P1_exam_school_folder"
        elif any(REV_SUB_RE.search(s) for s in mid):
            pat = "P2_rev_subfolder"
        elif EXAMISH_RE.search(fn):
            pat = "P3_exam_filename"
        else:
            continue
        stats[pat] += 1
        papers[(year, week, grade, school_seg, paper_stem(fn))].append({
            "raw": line, "fn": fn, "year": year, "week": week,
            "grade": grade, "stream": stream, "school_seg": school_seg,
            "sub": "\\".join(mid), "pat": pat,
            "is_ans": bool(ANS_RE.search(fn)),
            "is_pdf": fn.lower().endswith(".pdf"),
        })
    return papers


def load_events(cur):
    """Events keyed by (school, grade, academic_year) with week numbers."""
    cur.execute("SELECT academic_year, week_number, week_start_date, week_end_date "
                "FROM academic_weeks")
    weeks = cur.fetchall()

    def ay_week(d):
        for ay, wn, start, end in weeks:
            if start <= d <= end:
                return ay, wn
        return None, None

    cur.execute("SELECT id, school, grade, start_date, event_type FROM calendar_events "
                "WHERE school IS NOT NULL AND grade IS NOT NULL")
    ev_by = defaultdict(list)
    for eid, school, grade, start, etype in cur.fetchall():
        ay, wn = ay_week(start)
        if ay:
            ev_by[(school, grade, ay)].append((eid, wn, etype))

    cur.execute("SELECT calendar_event_id, concept_id, confidence FROM exam_scope_concepts")
    scope_rows = defaultdict(list)
    for eid, cid, conf in cur.fetchall():
        scope_rows[eid].append((cid, float(conf)))
    return ev_by, scope_rows


def link_event(ev_by, scope_rows, schools, grade, year, week, kind):
    """(event_id, link_confidence, school) or (None, None, None)."""
    cands = []
    for sc in schools:
        for eid, ewk, etype in ev_by.get((sc, grade, year), []):
            if abs(ewk - week) <= LINK_WINDOW:
                cands.append((eid, ewk, etype, sc))
    if not cands:
        return None, None, None
    if len({c[0] for c in cands}) == 1:
        return cands[0][0], LINK_CONF_SINGLE, cands[0][3]
    # equally plausible candidates: the one with parsed scope is more useful
    def near(c):
        return (abs(c[1] - week), c[0] not in scope_rows)

    want = KIND_EQUIV.get(kind, kind)
    typed = [c for c in cands if want and c[2] == want]
    if typed:
        best = min(typed, key=near)
        return best[0], LINK_CONF_KIND, best[3]
    best = min(cands, key=near)
    return best[0], LINK_CONF_NEAREST, best[3]


def proxy_scope(ev_by, scope_rows, schools, grade, year, week, kind):
    """Concept rows borrowed from a parallel scoped event in another year."""
    best = None
    for sc in schools:
        for (s2, g2, ay2), evs in ev_by.items():
            if s2 != sc or g2 != grade or ay2 == year:
                continue
            for eid, ewk, etype in evs:
                if eid not in scope_rows or abs(ewk - week) > PROXY_WINDOW:
                    continue
                # nearest week, then matching event type, then the most
                # recent year (the closest syllabus to the paper's test)
                rank = (abs(ewk - week), etype != KIND_EQUIV.get(kind, kind),
                        -int(ay2[:4]))
                if best is None or rank < best[0]:
                    best = (rank, eid)
    if best is None:
        return []
    return [(cid, round(conf * PROXY_DAMP, 2)) for cid, conf in scope_rows[best[1]]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    stats = Counter()
    grouped = scan_tree(stats)
    print(f"weekly files {stats['weekly_files']}, detected "
          f"{sum(len(v) for v in grouped.values())} files -> {len(grouped)} papers "
          f"({stats['P1_exam_school_folder']} P1 / {stats['P2_rev_subfolder']} P2 / "
          f"{stats['P3_exam_filename']} P3)")

    conn = connect()
    cur = conn.cursor()
    ev_by, scope_rows = load_events(cur)
    cur.execute("SELECT code_space, code, concept_id FROM concept_code_aliases")
    alias_map = defaultdict(list)
    for space, code, cid in cur.fetchall():
        alias_map[(space, code)].append(cid)

    rows = []       # paper dicts ready to write
    tier_year = defaultdict(Counter)
    for (year, week, grade, school_seg, _stem), variants in grouped.items():
        primary = max(variants, key=lambda v: (v["is_pdf"], not v["is_ans"]))
        others = [v for v in variants if v is not primary]
        schools = canon_school(school_seg, primary["stream"]) if school_seg else []
        if school_seg and not schools:
            stats["school_not_canonical"] += 1
        kind = detect_kind(school_seg, primary["sub"], primary["fn"])

        event_id = link_conf = None
        linked_school = None
        if schools and grade:
            event_id, link_conf, linked_school = link_event(
                ev_by, scope_rows, schools, grade, year, week, kind)

        concepts = []
        if event_id and scope_rows.get(event_id):
            source = "event"
            concepts = scope_rows[event_id]
        else:
            p = parse_pdf_name(primary["raw"])
            code, space = p.get("code"), p.get("code_space")
            cids = (alias_map.get((space, code), [])
                    if code and space not in ("SM", "SS", None) else [])
            if cids:
                source = "code"
                concepts = [(cid, CODE_CONF) for cid in cids]
            elif schools and grade:
                concepts = proxy_scope(ev_by, scope_rows, schools, grade, year, week, kind)
                source = "proxy" if concepts else "none"
            else:
                source = "none"
        tier_year[year][source] += 1
        if event_id:
            tier_year[year]["linked"] += 1

        n = normalize(primary["raw"])
        rows.append({
            "file_path": to_alias_path(primary["raw"]) or n["match_path"],
            "match_path": n["match_path"],
            "file_basename": n["basename"],
            "variant_paths": json.dumps(
                [to_alias_path(v["raw"]) or normalize(v["raw"])["match_path"]
                 for v in others], ensure_ascii=False) if others else None,
            "school": linked_school or (schools[0] if schools else None),
            "grade": grade,
            "lang_stream": primary["stream"],
            "academic_year": year,
            "week_number": week,
            "exam_kind": kind,
            "calendar_event_id": event_id,
            "link_confidence": link_conf,
            "scope_source": source,
            "concepts": concepts,
        })

    print("\ntier by year (papers):")
    for year in sorted(tier_year):
        c = tier_year[year]
        total = sum(n for t, n in c.items() if t != "linked")
        print(f"  {year}: {total} papers, linked {c['linked']}, "
              f"event {c['event']}, code {c['code']}, proxy {c['proxy']}, none {c['none']}")
    if stats["school_not_canonical"]:
        print(f"school folders not canonicalisable: {stats['school_not_canonical']}")

    if args.dry_run:
        print("Dry run — no writes.")
        conn.close()
        return

    try:
        cur.execute("SELECT id, match_path FROM exam_rev_papers")
        existing = {mp: pid for pid, mp in cur.fetchall()}
        # ai rows from ai_map_rev_papers.py survive the rebuild and outrank a
        # borrowed proxy scope: keep the label a re-run would otherwise demote
        cur.execute("SELECT DISTINCT paper_id FROM exam_rev_paper_concepts "
                    "WHERE source = 'ai'")
        ai_pids = {r[0] for r in cur.fetchall()}
        for r in rows:
            if (r["scope_source"] in ("proxy", "none")
                    and existing.get(r["match_path"]) in ai_pids):
                r["scope_source"] = "ai"
        seen = set()
        created = updated = 0
        paper_ids = {}
        for r in rows:
            seen.add(r["match_path"])
            fields = (r["file_path"], r["file_basename"], r["variant_paths"],
                      r["school"], r["grade"], r["lang_stream"], r["academic_year"],
                      r["week_number"], r["exam_kind"], r["calendar_event_id"],
                      r["link_confidence"], r["scope_source"])
            pid = existing.get(r["match_path"])
            if pid:
                cur.execute(
                    "UPDATE exam_rev_papers SET file_path=%s, file_basename=%s, "
                    "variant_paths=%s, school=%s, grade=%s, lang_stream=%s, "
                    "academic_year=%s, week_number=%s, exam_kind=%s, "
                    "calendar_event_id=%s, link_confidence=%s, scope_source=%s "
                    "WHERE id=%s", fields + (pid,))
                updated += 1
            else:
                cur.execute(
                    "INSERT INTO exam_rev_papers (file_path, file_basename, "
                    "variant_paths, school, grade, lang_stream, academic_year, "
                    "week_number, exam_kind, calendar_event_id, link_confidence, "
                    "scope_source, match_path) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    fields + (r["match_path"],))
                pid = cur.lastrowid
                created += 1
            paper_ids[r["match_path"]] = pid

        gone = [pid for mp, pid in existing.items() if mp not in seen]
        for pid in gone:
            cur.execute("DELETE FROM exam_rev_papers WHERE id=%s", (pid,))

        cur.execute("DELETE FROM exam_rev_paper_concepts "
                    "WHERE source IN ('event', 'code', 'proxy')")
        concept_rows = []
        for r in rows:
            if r["scope_source"] in ("event", "code", "proxy"):
                pid = paper_ids[r["match_path"]]
                for cid, conf in r["concepts"]:
                    concept_rows.append((pid, cid, conf, r["scope_source"]))
        # INSERT IGNORE: an event scope can map two alias generations of the
        # same concept onto one paper
        cur.executemany(
            "INSERT IGNORE INTO exam_rev_paper_concepts "
            "(paper_id, concept_id, confidence, source) VALUES (%s, %s, %s, %s)",
            concept_rows)
        conn.commit()
        print(f"\npapers: {created} created, {updated} updated, {len(gone)} removed")
        cur.execute("SELECT COUNT(*) FROM exam_rev_paper_concepts")
        print(f"exam_rev_paper_concepts now has {cur.fetchone()[0]} rows")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
