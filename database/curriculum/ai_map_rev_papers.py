"""Map topic-worded rev paper filenames to concepts via Gemini classification.

Covers the papers backfill_rev_papers.py could not index: no linked event
scope and no chapter code, but the filename names its topics ("三角比 Mock",
"Simultaneous Equations Test Rev"). Papers whose filename carries no topic
text at all are skipped, they stay browse-only by school and week.

Two-step by design: a plain run classifies and writes a review file, and
nothing touches the database until --write is passed after the sample has
been eyeballed.

Usage (from repo root, DB reachable e.g. via Cloud SQL proxy):
    webapp/backend/venv/bin/python database/curriculum/ai_map_rev_papers.py
        [--limit N] [--write --min-conf 0.6]
"""
import argparse
import json
import os
import re
import sys
import time
import unicodedata
from collections import Counter

from _common import REPO_ROOT, connect, gemini_client, parse_json_array  # noqa: E402  (sets sys.path + .env)

OUT = os.path.join(REPO_ROOT, "private", "curriculum_data",
                   "ai_rev_paper_mappings.json")
MODEL = "gemini-3.1-flash-lite"
BATCH = 40

DATE_PAREN_RE = re.compile(r"[(（][\d\s.,，、~\-–]*[)）]")
# marker words that carry no topic signal on a rev paper
STOP_EN = {
    "mock", "exam", "test", "quiz", "rev", "revision", "practice", "paper",
    "papers", "term", "mid", "midterm", "final", "ans", "answer", "answers",
    "week", "form", "chapter", "with", "and",
}
STOP_CJK = re.compile(
    r"溫習|温习|複習|复习|考試|考试|測驗|测验|統測|统测|大測|小測|補測"
    r"|試卷|模擬|答案|練習|工作紙|中[一二三]"
)


def has_topic_text(basename):
    s = unicodedata.normalize("NFKC", basename)
    s = re.sub(r"(?i)\.(pdf|docx?)$", "", s)
    s = DATE_PAREN_RE.sub(" ", s)
    s = STOP_CJK.sub(" ", s)
    if re.search(r"[一-鿿]{2,}", s):
        return True
    for tok in re.split(r"[^A-Za-z]+", s):
        if len(tok) >= 4 and tok.lower() not in STOP_EN:
            return True
    return False


def load_vocab(cur):
    cur.execute(
        "SELECT id, kind, grade, name_en, name_zh FROM curriculum_concepts "
        "WHERE grade IN ('F1', 'F2', 'F3') OR kind = 'extension'"
    )
    return [
        {"id": cid, "kind": kind, "grade": g, "name_en": en, "name_zh": zh}
        for cid, kind, g, en, zh in cur.fetchall()
    ]


def classify_batch(client, vocab_text, files):
    from google.genai import types

    lines = "\n".join(f"{i} | {f['grade'] or '-'} | {f['basename']}"
                      for i, f in enumerate(files))
    prompt = f"""You match Hong Kong secondary school maths revision paper filenames to curriculum topics.
These papers were tailor-made for one school's test or exam and usually aggregate several topics.

TOPICS (id | grade | English name | Chinese name):
{vocab_text}

FILES (index | student grade | filename):
{lines}

For each file, identify which topic(s) the filename's topic text refers to.
Rules:
- Match on topic text only. Ignore school codes, dates, week numbers, and markers like Rev/Mock/Test/Exam/溫習/統測.
- A filename may list several topics (e.g. 一元二次方程、相似三角形 is two) — return each, up to 6.
- If there is no recognisable topic text (e.g. "Mock2 (23.01.05)"), return an empty topics list.
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
            return parse_json_array(resp.text or "")
        except (json.JSONDecodeError, ValueError, TypeError):
            if attempt == 2:
                raise
            time.sleep(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, help="classify only the first N files (smoke test)")
    ap.add_argument("--write", action="store_true",
                    help="insert reviewed mappings into exam_rev_paper_concepts")
    ap.add_argument("--min-conf", type=float, default=0.6)
    args = ap.parse_args()

    if args.write:
        write_mode(args)
        return

    conn = connect()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, file_basename, school, grade, academic_year "
        "FROM exam_rev_papers WHERE scope_source IN ('proxy', 'none')"
    )
    files = [
        {"paper_id": pid, "basename": base, "school": school,
         "grade": grade, "year": year}
        for pid, base, school, grade, year in cur.fetchall()
        if has_topic_text(base)
    ]
    if args.limit:
        files = files[: args.limit]
    print(f"files to classify: {len(files)}")

    vocab = load_vocab(cur)
    conn.close()
    by_id = {v["id"]: v for v in vocab}
    vocab_text = "\n".join(
        f"{v['id']} | {v['grade'] or '-'} | {v['name_en'] or '-'} | {v['name_zh'] or '-'}"
        for v in vocab
    )
    print(f"vocabulary: {len(vocab)} concepts")

    client = gemini_client()
    results = []

    # Checkpoint after every batch: a network error near the end must not
    # discard the classifications already paid for.
    def flush(partial):
        with open(OUT, "w", encoding="utf-8") as fh:
            json.dump({"model": MODEL, "partial": partial, "files": results},
                      fh, ensure_ascii=False, indent=1)

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
        flush(partial=True)
        print(f"  {min(start + BATCH, len(files))}/{len(files)}")

    flush(partial=False)

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
        print(f"  {r['year']} {(r['school'] or '?'):<10} {r['basename'][:52]:<52} -> {names}")


def write_mode(args):
    """Insert the reviewed mapping file into exam_rev_paper_concepts."""
    data = json.load(open(OUT, encoding="utf-8"))
    if data.get("partial"):
        sys.exit("Review file is a partial checkpoint from an interrupted "
                 "run — re-run the classify step before --write.")
    rows = []
    for f in data["files"]:
        for t in f["topics"]:
            if t["conf"] >= args.min_conf:
                rows.append((f["paper_id"], t["concept_id"], min(t["conf"], 0.85)))
    print(f"prepared {len(rows)} rows (min conf {args.min_conf})")
    conn = connect()
    cur = conn.cursor()
    try:
        cur.executemany(
            "INSERT IGNORE INTO exam_rev_paper_concepts "
            "(paper_id, concept_id, confidence, source) VALUES (%s, %s, %s, 'ai')",
            rows,
        )
        # the filename names this paper's own topics: stronger than a scope
        # borrowed from another year's event
        cur.execute(
            "UPDATE exam_rev_papers p SET scope_source = 'ai' "
            "WHERE scope_source IN ('proxy', 'none') AND EXISTS "
            "(SELECT 1 FROM exam_rev_paper_concepts c "
            " WHERE c.paper_id = p.id AND c.source = 'ai')"
        )
        conn.commit()
        cur.execute("SELECT COUNT(*) FROM exam_rev_paper_concepts WHERE source = 'ai'")
        print(f"exam_rev_paper_concepts now has {cur.fetchone()[0]} ai rows")
        cur.execute("SELECT scope_source, COUNT(*) FROM exam_rev_papers GROUP BY scope_source")
        print("papers by scope_source:", dict(cur.fetchall()))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
