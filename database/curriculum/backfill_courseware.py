"""Backfill courseware_concepts from drive tree listings + assignment history.

Channels, in priority order (first mapping of a physical file wins):
  1. code     — canonical series/collection paths on the shares (tree listings)
  2. code     — weekly prep-folder copies whose basename has no canonical row yet
  3. code     — assigned PDFs (session_exercises) not present on the trees
  4. filename_term — uncoded files under international/reference roots matching
                     extension-concept terms (conservative regexes)

Answer files (Z:\\ANS, *_ans.pdf, ...\\Ans\\...) are skipped — the exercise modal
auto-finds answers from the question path.

Usage (from repo root):
    webapp/backend/venv/bin/python database/curriculum/backfill_courseware.py [--dry-run]
"""
import argparse
import os
import re
import sys
from collections import Counter, defaultdict

import pymysql
from dotenv import load_dotenv

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO_ROOT, "webapp", "backend"))
from curriculum.parser import parse_pdf_name  # noqa: E402
from curriculum.paths import normalize, to_alias_path  # noqa: E402

load_dotenv(os.path.join(REPO_ROOT, "webapp", "backend", ".env"))

TREES = os.path.join(REPO_ROOT, "private", "curriculum_data", "drive_trees")

ANS_RE = re.compile(r"(?i)_ans\.pdf$|\\ans\\|^Z:\\ANS\\")
WEEKLY_RE = re.compile(r"\\Finalised\\20\d\d-20\d\d\\")
SKIP_ROOT_RE = re.compile(
    r"(?i)\\(math1-6[^\\]*|Kindergarten|K-MO|Sudoku|SSPA_[^\\]+|SAT|SG|PS|PS_chi_eng"
    r"|DSE|DSE_question_bank|DSE Mock|IGCSE|IB)\\"
)
# extension-term channel applies ONLY under these roots (uncoded files elsewhere
# wait for the AI batch — usage-first principle)
TERM_ROOT_RE = re.compile(r"(?i)\\(IGCSE|IB)\\|中學參考教材")

# Unambiguous terms — safe to match anywhere under the term roots
TERMS_SPECIFIC = [
    ("Remainder and Factor Theorems (Polynomial Division)",
     re.compile(r"(?i)餘式定理|余式定理|因式定理|綜合除法|长除法|長除法|remainder.{0,3}theorem|factor.{0,3}theorem|synthetic.{0,3}division")),
    ("Sets and Venn Diagrams", re.compile(r"(?i)venn|文氏")),
    ("Travel Graphs", re.compile(r"(?i)行程圖|travel.{0,3}graph|distance.{0,3}time.{0,3}graph")),
    ("Basic Properties of Circles",
     re.compile(r"(?i)圓的基本性質|properties.{0,3}of.{0,3}circles?|circle.{0,3}theorems?")),
]
# Generic terms — only trusted when the file was actually assigned to an
# F1-F3 student (cohort-scoped evidence, per the dry-run lesson: unscoped
# matching pulled senior IB/DSE files onto junior concepts)
TERMS_COHORT = TERMS_SPECIFIC + [
    ("Sets and Venn Diagrams", re.compile(r"(?i)集合")),
    ("Sequences", re.compile(r"(?i)數列|数列|\bsequences?\b")),
    ("Introduction to Functions and Graphs", re.compile(r"(?i)函數|函数|\bfunctions?\b")),
]
# Clearly-senior giveaways: never term-match a filename containing these
SENIOR_BLOCK = re.compile(
    r"(?i)對數|对数|\blog\b|logarithm|微分|導數|积分|積分|三角函數|三角函数|線性規劃|线性规划"
    r"|向量|複數|复数|calculus|differentiat|integrat|trigonometric.{0,3}function|IBDP"
)


def connect():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"), port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER"), password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"), charset="utf8mb4", connect_timeout=10,
    )


def load_maps(cur):
    """(code_space, code) -> [concept_id]; extension name_en -> concept_id."""
    cur.execute("SELECT code_space, code, concept_id FROM concept_code_aliases")
    alias_map = defaultdict(list)
    for space, code, cid in cur.fetchall():
        alias_map[(space, code)].append(cid)
    cur.execute("SELECT id, name_en FROM curriculum_concepts WHERE kind = 'extension'")
    ext_map = {name: cid for cid, name in cur.fetchall()}
    return alias_map, ext_map


def tree_lines():
    """Yield (line, is_weekly) for all pdf paths in both tree listings, canonical first."""
    buckets = {False: [], True: []}
    for tree in ("tree_z_courseware.txt", "tree_v_secondary.txt"):
        for line in open(os.path.join(TREES, tree), encoding="utf-8", errors="replace"):
            line = line.rstrip("\n").strip()
            if not line.lower().endswith(".pdf"):
                continue
            buckets[bool(WEEKLY_RE.search(line))].append(line)
    yield from ((l, False) for l in buckets[False])
    yield from ((l, True) for l in buckets[True])


def classify(raw, alias_map, ext_map, terms=None):
    """Return list of (concept_id, role, lang, source, confidence) for one path.

    terms: term list to try for uncoded files (None = code channel only).
    """
    if ANS_RE.search(raw):
        return []
    p = parse_pdf_name(raw)
    code, space = p.get("code"), p.get("code_space")
    if code and space and space not in ("SM", "SS"):
        cids = alias_map.get((space, code), [])
        if cids:
            conf = 1.00 if p.get("space_certain") else 0.90
            return [(cid, p.get("role"), p.get("lang"), "code", conf) for cid in cids]
    if terms and not code:
        fn = p["fn"]
        # senior signatures: SS/SM series prefixes, explicit F4-F6, senior topics
        if (SENIOR_BLOCK.search(fn) or re.search(r"\bSS\d{2}|\bSM_|\bF[4-6]\b|F[4-6]_", fn)):
            return []
        for name, rx in terms:
            if rx.search(fn) and name in ext_map:
                return [(ext_map[name], p.get("role"), p.get("lang"), "filename_term", 0.80)]
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = connect()
    cur = conn.cursor()
    alias_map, ext_map = load_maps(cur)
    print(f"alias map: {len(alias_map)} codes, extensions: {len(ext_map)}")

    rows = []                     # (file_path, match_path, basename, cid, role, lang, source, conf)
    seen_match = set()            # (match_path, cid)
    seen_basename = set()         # (basename, cid) — suppress weekly/assignment copies
    stats = Counter()

    def add(raw, mappings, channel, require_new_basename=False):
        n = normalize(raw)
        if not n["basename"]:
            return
        file_path = to_alias_path(raw) or n["match_path"]
        for cid, role, lang, source, conf in mappings:
            if (n["match_path"], cid) in seen_match:
                continue
            if require_new_basename and (n["basename"], cid) in seen_basename:
                stats[f"{channel}:dup_basename"] += 1
                continue
            seen_match.add((n["match_path"], cid))
            seen_basename.add((n["basename"], cid))
            rows.append((file_path, n["match_path"], n["basename"], cid, role, lang, source, conf))
            stats[f"{channel}:{source}"] += 1

    # channels 1+2: trees (canonical first, then weekly copies)
    for line, is_weekly in tree_lines():
        if SKIP_ROOT_RE.search(line) and not TERM_ROOT_RE.search(line):
            stats["tree:skipped_root"] += 1
            continue
        terms = TERMS_SPECIFIC if TERM_ROOT_RE.search(line) else None
        m = classify(line, alias_map, ext_map, terms=terms)
        if m:
            add(line, m, "weekly" if is_weekly else "canonical", require_new_basename=is_weekly)

    # channel 3: assigned PDFs. Generic extension terms allowed only for files
    # assigned to junior (F1-F3) students — cohort-scoped evidence.
    cur.execute(
        "SELECT DISTINCT se.pdf_name, "
        "  MAX(s.grade IN ('F1','F2','F3')) AS junior "
        "FROM session_exercises se "
        "JOIN session_log sl ON sl.id = se.session_id "
        "JOIN students s ON s.id = sl.student_id "
        "WHERE se.pdf_name IS NOT NULL AND se.pdf_name != '' "
        "GROUP BY se.pdf_name"
    )
    for pdf, junior in cur.fetchall():
        terms = TERMS_COHORT if junior else (TERMS_SPECIFIC if TERM_ROOT_RE.search(pdf) else None)
        m = classify(pdf, alias_map, ext_map, terms=terms)
        if m:
            add(pdf, m, "assigned", require_new_basename=True)

    print(f"prepared {len(rows)} rows")
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}")

    if args.dry_run:
        for r in rows[:8]:
            print(" ", r[0][:70], "| cid", r[3], r[6], r[7])
        print("Dry run — no writes.")
        return

    try:
        cur.executemany(
            "INSERT IGNORE INTO courseware_concepts "
            "(file_path, match_path, file_basename, concept_id, role, lang, source, confidence) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            rows,
        )
        conn.commit()
        cur.execute("SELECT COUNT(*) FROM courseware_concepts")
        print(f"courseware_concepts now has {cur.fetchone()[0]} rows")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
