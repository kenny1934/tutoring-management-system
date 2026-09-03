"""Map the curriculum-sheet strings the parser cannot place, via Gemini.

import_curriculum_sheets.py resolves most sheet entries mechanically and
leaves the rest in each year file's "unmatched" list: bare chapter numbers
from a school's own textbook, section names, free phrasings. This script
sends those to Gemini per school and grade, with that school's already
resolved entries as calibration so the model can infer the school's own
chapter numbering, and writes a review file.

Two-step by design, like the other AI passes: a plain run only classifies
and writes the review file, and nothing is kept until --write is passed
after the sample has been eyeballed. --write merges the answers into
sheets/ai_sheet_mappings.json, keyed by school, grade and the normalised
string, and the importer reads that file on its next run, so a string only
has to be resolved once. An entry the model judged not to be a topic is
kept with an empty topic list, so the importer stops asking about it; an
answer below the confidence floor is not kept, so the string stays
unmatched and can be asked again. To correct an answer, edit the mappings
file and re-run the importer.

Usage (from the repo root, with the backend venv):
    webapp/backend/venv/bin/python database/curriculum/ai_map_sheet_strings.py
        [--year 2026-2027]   only this year's unmatched strings
        [--limit N]          classify only the first N school-grade groups
        [--include-answered] ask again about strings already in the mappings
        [--write --min-conf 0.6]
"""
import argparse
import datetime as dt
import glob
import json
import os
import sys
import time
from collections import Counter, defaultdict

from _common import PRIV, connect, gemini_client, parse_json_array  # noqa: E402  (sets sys.path + .env)
from curriculum.exam_scope import normalize  # noqa: E402

SHEETS_DIR = os.path.join(PRIV, "sheets")
REVIEW = os.path.join(SHEETS_DIR, "ai_sheet_review.json")
MAPPINGS = os.path.join(SHEETS_DIR, "ai_sheet_mappings.json")
MODEL = "gemini-3.1-flash-lite"
BATCH = 30


def ai_key(school, grade, part):
    return f"{school}|{grade}|{normalize(part)}"


def load_year_files(year=None):
    pattern = f"sheet_{year}.json" if year else "sheet_*.json"
    files = sorted(glob.glob(os.path.join(SHEETS_DIR, pattern)))
    out = []
    for path in files:
        with open(path, encoding="utf-8") as fh:
            out.append(json.load(fh))
    return out


def load_vocab(cur):
    cur.execute("""
        SELECT id, name_en, name_zh, kind, COALESCE(grade, atlas_grade)
        FROM curriculum_concepts
    """)
    concepts = cur.fetchall()
    by_id = {c[0]: c for c in concepts}
    vocab_text = "\n".join(
        f"{c[0]} | {c[4] or '-'} | {c[1] or '-'} | {c[2] or '-'}" for c in concepts
    )
    return by_id, vocab_text


def classify_batch(client, vocab_text, school, grade, series, calibration, items):
    from google.genai import types

    calib_text = "\n".join(
        f'- "{text}" -> {name}' for text, name in calibration[:20]
    ) or "(none known yet)"
    lines = "\n".join(f'{i} | {it["part"]}' for i, it in enumerate(items))
    book = ("人教-order textbook" if series == "MAS"
            else "Hong Kong textbook" if series == "HK" else "textbook order unknown")
    prompt = f"""You match entries from a tutoring centre's weekly curriculum sheet to maths curriculum topics.
Each entry is what a tutor wrote down as the topic a school's class was covering in one week.

School: {school} ({grade}, {book}).

TOPICS (id | grade | English name | Chinese name):
{vocab_text}

Entries from THIS school's sheet that are already resolved. Use them to infer
this school's own textbook chapter numbering (a bare "Ch 3" or "3.2" refers
to that textbook, not to any universal order):
{calib_text}

UNRESOLVED ENTRIES (index | text):
{lines}

For each entry, identify which topic(s) it refers to.
Rules:
- An entry may name several topics. Return each.
- Bare chapter or section numbers: resolve ONLY if the resolved examples pin
  down this school's numbering; otherwise return an empty list.
- Entries that are not topics (holidays, test or exam weeks that name no
  topic, revision weeks that name no topic, administrative notes) get an
  empty list.
- conf: 0.9 = the same topic by name, 0.7 = clearly this topic phrased
  differently or confidently calibrated, 0.5 = plausible. Below 0.5, omit the
  topic instead of guessing.
Return JSON only: [{{"i": <entry index>, "topics": [{{"id": <topic id>, "conf": <number>}}]}}] with one object per entry index."""

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


def classify_mode(args):
    years = load_year_files(args.year)
    if not years:
        sys.exit("No year files under private/curriculum_data/sheets. Run "
                 "import_curriculum_sheets.py first.")
    mappings = {}
    if os.path.exists(MAPPINGS):
        with open(MAPPINGS, encoding="utf-8") as fh:
            mappings = json.load(fh)

    conn = connect()
    cur = conn.cursor()
    by_id, vocab_text = load_vocab(cur)
    conn.close()

    # Unmatched strings and calibration pairs, both grouped per school-grade.
    groups = defaultdict(dict)        # (school, grade, series) -> {key: item}
    calibration = defaultdict(list)   # (school, grade) -> [(text, topic name)]
    skipped = 0
    for data in years:
        for u in data["unmatched"]:
            key = ai_key(u["school"], u["grade"], u["part"])
            if key in mappings and not args.include_answered:
                skipped += 1
                continue
            item = groups[(u["school"], u["grade"], u.get("series"))].setdefault(
                key, {"key": key, "part": u["part"], "weeks": [], "years": set()}
            )
            item["weeks"].extend(u["weeks"])
            item["years"].add(data["academic_year"])
        for row in data["rows"]:
            if row.get("via") != "parser":
                continue
            for c in row["concepts"]:
                concept = by_id.get(c["concept_id"])
                if concept:
                    calibration[(row["school"], row["grade"])].append(
                        (row["text"], concept[2] or concept[1])
                    )

    ordered = sorted(groups.items(), key=lambda kv: -len(kv[1]))
    if args.limit:
        ordered = ordered[: args.limit]
    total = sum(len(v) for _, v in ordered)
    print(f"unmatched strings: {total} across {len(ordered)} school-grade groups"
          + (f" ({skipped} already answered, skipped)" if skipped else ""))
    if not total:
        return

    client = gemini_client()
    results = []
    done = 0

    # Checkpoint after every batch: a network error near the end must not
    # discard the classifications already paid for.
    def flush(partial):
        os.makedirs(SHEETS_DIR, exist_ok=True)
        with open(REVIEW, "w", encoding="utf-8") as fh:
            json.dump({"model": MODEL, "partial": partial, "lines": results},
                      fh, ensure_ascii=False, indent=1)

    for (school, grade, series), items_by_key in ordered:
        items = list(items_by_key.values())
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
                    "key": item["key"], "school": school, "grade": grade,
                    "series": series, "part": item["part"],
                    "weeks": sorted(set(item["weeks"])),
                    "years": sorted(item["years"]),
                    "answered": i in got, "topics": topics,
                })
            done += len(chunk)
            flush(partial=True)
            print(f"  {done}/{total}  ({school} {grade})")

    flush(partial=False)

    mapped = [r for r in results if r["topics"]]
    confs = Counter()
    for r in mapped:
        for t in r["topics"]:
            confs[">=0.9" if t["conf"] >= 0.9 else ">=0.7" if t["conf"] >= 0.7 else ">=0.5"] += 1
    print(f"\nmapped {len(mapped)}/{len(results)} strings "
          f"({sum(len(r['topics']) for r in mapped)} topic links: {dict(confs)})")
    print(f"review file: {REVIEW}")
    print("\nsample:")
    step = max(1, len(mapped) // 15)
    for r in mapped[::step][:15]:
        names = ", ".join(f"{t['name_zh'] or t['name_en']} ({t['conf']})" for t in r["topics"])
        print(f"  {r['school']:<9}{r['grade']} {r['part'][:44]:<44} -> {names}")


def write_mode(args):
    """Merge the reviewed answers into the mappings file the importer reads."""
    if not os.path.exists(REVIEW):
        sys.exit("There is no review file yet. Run the classify step (no --write) "
                 "first, look at the sample it prints, then come back with --write.")
    with open(REVIEW, encoding="utf-8") as fh:
        data = json.load(fh)
    if data.get("partial"):
        sys.exit("The review file is a partial checkpoint from an interrupted "
                 "run. Re-run the classify step before --write.")
    mappings = {}
    if os.path.exists(MAPPINGS):
        with open(MAPPINGS, encoding="utf-8") as fh:
            mappings = json.load(fh)

    now = dt.datetime.now().isoformat(timespec="seconds")
    kept = nontopic = left = 0
    for r in data["lines"]:
        topics = [{"concept_id": t["concept_id"], "conf": t["conf"]}
                  for t in r["topics"] if t["conf"] >= args.min_conf]
        if topics:
            kept += 1
        elif r.get("answered") and not r["topics"]:
            # The model saw the entry and said it names no topic.
            nontopic += 1
        else:
            # Only low-confidence guesses: leave it unmatched for another look.
            left += 1
            continue
        mappings[r["key"]] = {
            "school": r["school"], "grade": r["grade"], "part": r["part"],
            "topics": topics, "model": data.get("model"), "written_at": now,
        }

    os.makedirs(SHEETS_DIR, exist_ok=True)
    tmp = MAPPINGS + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(mappings, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, MAPPINGS)
    print(f"mappings file now holds {len(mappings)} entries: {kept} resolved and "
          f"{nontopic} marked as no topic this round, {left} left unmatched "
          f"(below {args.min_conf}).")
    print("Re-run import_curriculum_sheets.py (or wait for tonight's re-scan) "
          "to apply them.")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--year")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--include-answered", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--min-conf", type=float, default=0.6)
    args = ap.parse_args()
    if args.write:
        write_mode(args)
    else:
        classify_mode(args)


if __name__ == "__main__":
    main()
