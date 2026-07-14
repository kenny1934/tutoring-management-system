"""Map residual exam-scope lines to curriculum concepts via Gemini.

The mechanical parser (webapp/backend/curriculum/exam_scope.py) resolves
~2/3 of scope lines; what remains is mostly bare textbook chapter numbers
("Ch8") whose numbering is edition-specific, school-specific section
names, and free phrasings. Each batch carries the same school-grade's
already-resolved lines as calibration examples, so the model can infer
that school's textbook chapter map instead of guessing from a universal
one.

Two-step by design: a plain run classifies and writes a review file, and
nothing touches the database until --write is passed after the sample has
been eyeballed. Writes go to exam_scope_concepts (source='ai'), keyed to
the description line so a re-synced description retires stale rows.

Usage (from repo root, DB reachable e.g. via Cloud SQL proxy):
    DB_HOST=127.0.0.1 DB_PORT=13306 webapp/backend/venv/bin/python \
        database/curriculum/ai_map_exam_scopes.py [--limit N]
        [--write --min-conf 0.6]
"""
import argparse
import json
import os
import sys
import time
from collections import Counter, defaultdict

import pymysql
from dotenv import load_dotenv

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO_ROOT, "webapp", "backend"))
from curriculum.exam_scope import ScopeMatcher, summarize  # noqa: E402

load_dotenv(os.path.join(REPO_ROOT, "webapp", "backend", ".env"))

OUT = os.path.join(REPO_ROOT, "private", "curriculum_data",
                   "ai_exam_scope_mappings.json")
MODEL = "gemini-3.1-flash-lite"
BATCH = 30
GRADES = ("F1", "F2", "F3")
# AI rows never outrank a mechanical exact-name match (0.9).
CONF_CAP = 0.85


def connect():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"), port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER"), password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"), charset="utf8mb4", connect_timeout=10,
    )


def load_matcher(cur):
    cur.execute("""
        SELECT id, name_en, name_zh, kind, COALESCE(grade, atlas_grade)
        FROM curriculum_concepts
    """)
    concepts = cur.fetchall()
    cur.execute("SELECT concept_id, code_space, code FROM concept_code_aliases")
    return ScopeMatcher(concepts, cur.fetchall()), concepts


def school_series_map(cur):
    # Deduplicate aliases per (concept, side) first: most HK concepts carry
    # both an HK_NEW and an HK_OLD row, and a bare join would double their
    # weight against MAS (same fix as curriculum/exam_scope.school_series).
    cur.execute("""
        SELECT o.school, a.s, SUM(o.confidence)
        FROM school_topic_observations o
        JOIN (
            SELECT DISTINCT concept_id,
                   CASE WHEN code_space = 'MAS' THEN 'MAS' ELSE 'HK' END AS s
            FROM concept_code_aliases
        ) a ON a.concept_id = o.concept_id
        GROUP BY o.school, a.s
    """)
    weights = defaultdict(dict)
    for school, series, w in cur.fetchall():
        weights[school][series] = float(w or 0)
    return {school: max(d, key=d.get) for school, d in weights.items()}


def gemini_client():
    import subprocess

    from google import genai
    from google.oauth2.credentials import Credentials

    # Local ADC may be stale; the gcloud user credential is the reliable one here.
    token = subprocess.check_output(
        ["gcloud", "auth", "print-access-token"], text=True
    ).strip()
    return genai.Client(
        vertexai=True,
        project=os.getenv("GOOGLE_CLOUD_PROJECT", "csm-database-project"),
        location="global",
        credentials=Credentials(token=token),
    )


def _parse_json_array(text):
    """The model sometimes appends stray text after the array — take the
    first complete JSON value instead of requiring a clean document."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        value, _ = json.JSONDecoder().raw_decode(text[text.index("["):])
        return value


def classify_batch(client, vocab_text, school, grade, series, calibration, items):
    from google.genai import types

    calib_text = "\n".join(
        f'- "{line}" -> {name}' for line, name in calibration[:20]
    ) or "(none known)"
    lines = "\n".join(f'{i} | {it["line"]}' for i, it in enumerate(items))
    prompt = f"""You match lines from a school's maths test-scope notices to curriculum topics.

School: {school} ({grade}, {"人教-order textbook" if series == "MAS" else "Hong Kong textbook"}).

TOPICS (id | grade | English name | Chinese name):
{vocab_text}

Lines from THIS school's other test notices that are already resolved — use
them to infer this school's own textbook chapter numbering (bare "Ch N"
numbers refer to that textbook, not to any universal order):
{calib_text}

UNRESOLVED LINES (index | text):
{lines}

For each line, identify which topic(s) it refers to.
Rules:
- A line may name several topics — return each.
- Bare chapter numbers ("Ch8", "8.1~8.3"): resolve ONLY if the calibration
  examples pin down this school's numbering; otherwise return an empty list.
- Administrative lines (page ranges, book names, "bring calculator") get an
  empty list.
- conf: 0.9 = same topic by name, 0.7 = clearly this topic phrased
  differently or confidently calibrated, 0.5 = plausible. Below 0.5, omit
  the topic instead of guessing.
Return JSON only: [{{"i": <line index>, "topics": [{{"id": <topic id>, "conf": <number>}}]}}] with one entry per line index."""

    for attempt in (1, 2):
        resp = client.models.generate_content(
            model=MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0,
                thinking_config=types.ThinkingConfig(
                    thinking_level=types.ThinkingLevel.LOW
                ),
            ),
        )
        try:
            return _parse_json_array(resp.text or "")
        except (json.JSONDecodeError, ValueError, TypeError):
            if attempt == 2:
                raise
            time.sleep(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, help="classify only the first N groups (smoke test)")
    ap.add_argument("--write", action="store_true",
                    help="insert reviewed mappings into exam_scope_concepts")
    ap.add_argument("--min-conf", type=float, default=0.6)
    args = ap.parse_args()

    if args.write:
        write_mode(args)
        return

    conn = connect()
    cur = conn.cursor()
    matcher, concepts = load_matcher(cur)
    series_of = school_series_map(cur)
    cur.execute("""
        SELECT id, school, grade, description FROM calendar_events
        WHERE description IS NOT NULL AND TRIM(description) != ''
          AND grade IN %s
    """, (GRADES,))
    events = cur.fetchall()
    conn.close()

    by_id = {c[0]: c for c in concepts}
    vocab_text = "\n".join(
        f"{c[0]} | {c[4] or '-'} | {c[1] or '-'} | {c[2] or '-'}"
        for c in concepts
    )

    # Residual lines and calibration pairs, both grouped per school-grade.
    residual = defaultdict(dict)      # (school, grade) -> {line: [event ids]}
    calibration = defaultdict(list)   # (school, grade) -> [(line, topic name)]
    for eid, school, grade, description in events:
        series = series_of.get(school)
        lines = matcher.parse(description, series=series, grade=grade)
        concepts_found, unmatched = summarize(lines)
        for u in unmatched:
            residual[(school, grade)].setdefault(u, []).append(eid)
        for cid, entry in concepts_found.items():
            c = by_id.get(cid)
            name = (c[2] or c[1]) if c else str(cid)
            for line in entry["lines"]:
                calibration[(school, grade)].append((line, name))

    groups = sorted(residual.items(), key=lambda kv: -len(kv[1]))
    if args.limit:
        groups = groups[: args.limit]
    total_lines = sum(len(v) for _, v in groups)
    print(f"residual lines: {total_lines} across {len(groups)} school-grade groups")

    client = gemini_client()
    results = []
    done = 0

    # Checkpoint after every batch: a network error near the end must not
    # discard the classifications already paid for.
    def flush(partial):
        with open(OUT, "w", encoding="utf-8") as fh:
            json.dump({"model": MODEL, "partial": partial, "lines": results},
                      fh, ensure_ascii=False, indent=1)

    for (school, grade), line_events in groups:
        series = series_of.get(school)
        items = [{"line": line, "event_ids": eids}
                 for line, eids in line_events.items()]
        for start in range(0, len(items), BATCH):
            chunk = items[start:start + BATCH]
            answer = classify_batch(
                client, vocab_text, school, grade, series,
                calibration.get((school, grade), []), chunk,
            )
            got = {row["i"]: row.get("topics", []) for row in answer if "i" in row}
            for i, item in enumerate(chunk):
                topics = [
                    {
                        "concept_id": t["id"],
                        "name_en": by_id[t["id"]][1],
                        "name_zh": by_id[t["id"]][2],
                        "conf": round(float(t["conf"]), 2),
                    }
                    for t in got.get(i, [])
                    if t.get("id") in by_id and float(t.get("conf", 0)) >= 0.5
                ]
                results.append({
                    "school": school, "grade": grade, "series": series,
                    "line": item["line"], "event_ids": item["event_ids"],
                    "topics": topics,
                })
            done += len(chunk)
            flush(partial=True)
            print(f"  {done}/{total_lines}  ({school} {grade})")

    flush(partial=False)

    mapped = [r for r in results if r["topics"]]
    confs = Counter()
    for r in mapped:
        for t in r["topics"]:
            confs[">=0.9" if t["conf"] >= 0.9 else ">=0.7" if t["conf"] >= 0.7 else ">=0.5"] += 1
    print(f"\nmapped {len(mapped)}/{len(results)} lines "
          f"({sum(len(r['topics']) for r in mapped)} topic links: {dict(confs)})")
    print(f"review file: {OUT}")
    print("\nsample:")
    step = max(1, len(mapped) // 15)
    for r in mapped[::step][:15]:
        names = ", ".join(f"{t['name_zh'] or t['name_en']} ({t['conf']})" for t in r["topics"])
        print(f"  {r['school']:<8} {r['grade']} {r['line'][:46]:<46} -> {names}")


def write_mode(args):
    """Insert the reviewed mapping file into exam_scope_concepts."""
    data = json.load(open(OUT, encoding="utf-8"))
    if data.get("partial"):
        sys.exit("Review file is a partial checkpoint from an interrupted "
                 "run — re-run the classify step before --write.")
    rows = []
    for r in data["lines"]:
        for t in r["topics"]:
            if t["conf"] < args.min_conf:
                continue
            for eid in r["event_ids"]:
                rows.append((
                    eid, t["concept_id"], r["line"][:500],
                    min(t["conf"], CONF_CAP), "ai",
                ))
    print(f"prepared {len(rows)} rows (min conf {args.min_conf})")
    conn = connect()
    cur = conn.cursor()
    try:
        cur.executemany(
            "INSERT IGNORE INTO exam_scope_concepts "
            "(calendar_event_id, concept_id, matched_text, confidence, source) "
            "VALUES (%s, %s, %s, %s, %s)",
            rows,
        )
        conn.commit()
        cur.execute("SELECT COUNT(*) FROM exam_scope_concepts WHERE source = 'ai'")
        print(f"exam_scope_concepts now has {cur.fetchone()[0]} ai-sourced rows")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
