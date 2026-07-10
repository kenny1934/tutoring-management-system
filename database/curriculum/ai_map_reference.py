"""Map 中學參考教材 scans to curriculum concepts via Gemini filename classification.

The reference-materials share is organised as
    中學參考教材\\F1..F6\\SCHOOL-CODE\\(Term)\\Role_topic (date).pdf
so grade, school, stream and role come straight from the path; only the
topic text needs judgement. This is the "AI batch" channel the courseware
backfill deliberately left for uncoded files (source='ai' in the schema).

Two-step by design: a plain run classifies and writes a review file, and
nothing touches the database until --write is passed after the sample has
been eyeballed.

Usage (from repo root, DB reachable e.g. via Cloud SQL proxy):
    DB_HOST=127.0.0.1 DB_PORT=13306 webapp/backend/venv/bin/python \
        database/curriculum/ai_map_reference.py [--grades F1,F2,F3]
        [--limit N] [--write --min-conf 0.6]
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from collections import Counter

import pymysql
from dotenv import load_dotenv

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO_ROOT, "webapp", "backend"))
from curriculum.paths import normalize, to_alias_path  # noqa: E402

load_dotenv(os.path.join(REPO_ROOT, "webapp", "backend", ".env"))

TREE = os.path.join(REPO_ROOT, "private", "curriculum_data", "drive_trees",
                    "tree_v_reference_raw.txt")
OUT = os.path.join(REPO_ROOT, "private", "curriculum_data",
                   "ai_reference_mappings.json")
# -preview suffix retired ~July 2026; the GA name is the accessible one.
MODEL = "gemini-3.1-flash-lite"
BATCH = 40

ANS_RE = re.compile(r"(?i)_ans\.pdf$|\\ans\\|answer")
# Stricter net for the write step: school scans name answers loosely
# ("...----ANS.pdf", "_ans (23.03.20).pdf", "...參考答案.pdf")
ANS_WRITE_RE = re.compile(
    r"(?i)[_\- ]ans(wers?)?[ _\-)]*(\([^)]*\))?\.pdf$|答案|\bsolutions?\b"
)
# Scanner default names and bare numbers carry no topic — skip, don't spend tokens
NO_TOPIC_RE = re.compile(r"(?i)^(SKM_C\w+|=? ?\d+)\.pdf$")

ROLE_PATTERNS = [
    ("revision", re.compile(r"(?i)^Rev\d*[ _-]|溫習|温习|複習|复习")),
    ("quiz", re.compile(r"(?i)^Quiz\d*[ _-]|quiz")),
    ("past_paper", re.compile(r"(?i)^(Test\d*|Mid-?Terms?|Exam|UT\d*)[ _-]|\btest\b|\bexam\b")),
    ("exercise", re.compile(r"(?i)^(Ws|Hw|Practice|CW|Ex)\d*[ _-]|工作紙|工作纸")),
]

CJK_RE = re.compile(r"[一-鿿]")


def detect_role(basename):
    for role, pat in ROLE_PATTERNS:
        if pat.search(basename):
            return role
    return None


def detect_lang(school, basename):
    if school.endswith("-E"):
        return "e"
    if school.endswith("-C"):
        return "c"
    if CJK_RE.search(basename):
        return "c"
    if re.search(r"[A-Za-z]{4,}", re.sub(r"(?i)\.pdf$|^(Rev|Ws|Hw|Test|Quiz|Practice|Exam)\d*[ _-]", "", basename)):
        return "e"
    return None


def connect():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"), port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER"), password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"), charset="utf8mb4", connect_timeout=10,
    )


def load_vocab(cur, grades):
    """Junior concept vocabulary the model may map to."""
    placeholders = ",".join(["%s"] * len(grades))
    cur.execute(
        f"SELECT id, kind, grade, name_en, name_zh FROM curriculum_concepts "
        f"WHERE grade IN ({placeholders}) OR kind = 'extension'",
        grades,
    )
    return [
        {"id": cid, "kind": kind, "grade": g, "name_en": en, "name_zh": zh}
        for cid, kind, g, en, zh in cur.fetchall()
    ]


def gemini_client():
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


def classify_batch(client, vocab_text, files):
    from google.genai import types

    lines = "\n".join(f"{i} | {f['grade']} | {f['basename']}" for i, f in enumerate(files))
    prompt = f"""You match Hong Kong secondary school maths worksheet filenames to curriculum topics.

TOPICS (id | grade | English name | Chinese name):
{vocab_text}

FILES (index | school grade level | filename):
{lines}

For each file, identify which topic(s) the filename's topic text refers to.
Rules:
- Match on topic text only. Ignore school codes, dates, term numbers, and prefixes like Rev/Ws/Hw/Test/Quiz.
- A filename may list several topics (e.g. 一元二次方程、相似三角形 is two) — return each.
- For test or exam papers covering many topics, return at most 4 main ones.
- If there is no recognisable topic text (e.g. "Test2 (23.01.05)"), return an empty topics list.
- conf: 0.9 = same topic by name, 0.7 = clearly this topic but phrased differently, 0.5 = plausible. Below 0.5, omit the topic instead of guessing.
Return JSON only: [{{"i": <file index>, "topics": [{{"id": <topic id>, "conf": <number>}}]}}] with one entry per file index."""

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


def _parse_json_array(text):
    """The model sometimes appends stray text after the array — take the
    first complete JSON value instead of requiring a clean document."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        value, _ = json.JSONDecoder().raw_decode(text[text.index("["):])
        return value


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--grades", default="F1,F2,F3")
    ap.add_argument("--limit", type=int, help="classify only the first N files (smoke test)")
    ap.add_argument("--write", action="store_true", help="insert reviewed mappings into courseware_concepts")
    ap.add_argument("--min-conf", type=float, default=0.6)
    args = ap.parse_args()
    grades = args.grades.split(",")

    if args.write:
        write_mode(args)
        return

    files = []
    grade_re = re.compile(
        r"^V:\\中學參考教材\\(" + "|".join(map(re.escape, grades)) + r")\\([^\\]+)\\.*?([^\\]+\.pdf)\s*$",
        re.I,
    )
    for line in open(TREE, encoding="utf-8"):
        m = grade_re.match(line.strip())
        if not m:
            continue
        raw = line.strip()
        grade, school, basename = m.group(1), m.group(2), m.group(3)
        if ANS_RE.search(raw) or NO_TOPIC_RE.match(basename):
            continue
        files.append({
            "raw": raw, "grade": grade, "school": school, "basename": basename,
            "role": detect_role(basename), "lang": detect_lang(school, basename),
        })
    if args.limit:
        files = files[: args.limit]
    print(f"files to classify: {len(files)}")

    conn = connect()
    cur = conn.cursor()
    vocab = load_vocab(cur, grades)
    conn.close()
    by_id = {v["id"]: v for v in vocab}
    vocab_text = "\n".join(
        f"{v['id']} | {v['grade'] or '-'} | {v['name_en'] or '-'} | {v['name_zh'] or '-'}"
        for v in vocab
    )
    print(f"vocabulary: {len(vocab)} concepts")

    client = gemini_client()
    results = []
    for start in range(0, len(files), BATCH):
        chunk = files[start:start + BATCH]
        answer = classify_batch(client, vocab_text, chunk)
        got = {row["i"]: row.get("topics", []) for row in answer if "i" in row}
        for i, f in enumerate(chunk):
            topics = [
                {
                    "concept_id": t["id"],
                    "name_en": by_id[t["id"]]["name_en"],
                    "name_zh": by_id[t["id"]]["name_zh"],
                    "conf": round(float(t["conf"]), 2),
                }
                for t in got.get(i, [])
                if t.get("id") in by_id and float(t.get("conf", 0)) >= 0.5
            ]
            results.append({**f, "topics": topics})
        print(f"  {min(start + BATCH, len(files))}/{len(files)}")

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({"model": MODEL, "grades": grades, "files": results}, fh,
                  ensure_ascii=False, indent=1)

    mapped = [r for r in results if r["topics"]]
    confs = Counter()
    for r in mapped:
        for t in r["topics"]:
            confs[">=0.9" if t["conf"] >= 0.9 else ">=0.7" if t["conf"] >= 0.7 else ">=0.5"] += 1
    print(f"\nmapped {len(mapped)}/{len(results)} files "
          f"({sum(len(r['topics']) for r in mapped)} topic links: {dict(confs)})")
    print(f"review file: {OUT}")
    print("\nsample:")
    step = max(1, len(mapped) // 15)
    for r in mapped[::step][:15]:
        names = ", ".join(f"{t['name_en'] or t['name_zh']} ({t['conf']})" for t in r["topics"])
        print(f"  {r['grade']} {r['school']:<10} {r['basename'][:52]:<52} -> {names}")


def write_mode(args):
    """Insert the reviewed mapping file into courseware_concepts."""
    data = json.load(open(OUT, encoding="utf-8"))
    rows = []
    skipped_ans = 0
    for f in data["files"]:
        if ANS_WRITE_RE.search(f["basename"]):
            skipped_ans += 1
            continue
        n = normalize(f["raw"])
        file_path = to_alias_path(f["raw"]) or n["match_path"]
        for t in f["topics"]:
            if t["conf"] < args.min_conf:
                continue
            rows.append((
                file_path, n["match_path"], n["basename"], t["concept_id"],
                f["role"], f["lang"], "ai", min(t["conf"], 0.85),
            ))
    print(f"prepared {len(rows)} rows (min conf {args.min_conf}, "
          f"{skipped_ans} answer files skipped)")
    conn = connect()
    cur = conn.cursor()
    try:
        cur.executemany(
            "INSERT IGNORE INTO courseware_concepts "
            "(file_path, match_path, file_basename, concept_id, role, lang, source, confidence) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            rows,
        )
        conn.commit()
        cur.execute("SELECT COUNT(*) FROM courseware_concepts WHERE source = 'ai'")
        print(f"courseware_concepts now has {cur.fetchone()[0]} ai-sourced rows")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
