"""Seed concept_links (kind='prerequisite') from concept_prereqs_seed.json.

Data file lives in private/curriculum_data/ (gitignored). Edges were curated
per series and veto-reviewed by Kenny (2026-07-09). Direction is meaningful:
from = the prerequisite topic, to = the topic that builds on it.

Idempotent by rebuild: deletes all kind='prerequisite' rows with source
'manual' and re-inserts from the JSON. Never touches kind='equivalent' rows
(managed by seed_concept_links.py) or future source='ai' prerequisite rows.

Rejects self-links and cycles — a prerequisite graph must be acyclic.

Usage (from repo root):
    webapp/backend/venv/bin/python database/curriculum/seed_concept_prereqs.py [--dry-run]
"""
import argparse
import json
import os
import sys
from collections import defaultdict

import pymysql
from dotenv import load_dotenv

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_DATA = os.path.join(REPO_ROOT, "private", "curriculum_data", "concept_prereqs_seed.json")

load_dotenv(os.path.join(REPO_ROOT, "webapp", "backend", ".env"))


def connect():
    return pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
        charset="utf8mb4",
        connect_timeout=10,
    )


def resolve(cur, ref):
    """Resolve a seed reference to exactly one concept id (same contract as
    seed_concept_links.py)."""
    if isinstance(ref, list):
        space, code = ref
        cur.execute(
            "SELECT DISTINCT concept_id FROM concept_code_aliases "
            "WHERE code_space = %s AND code = %s",
            (space, code),
        )
        rows = cur.fetchall()
        label = f"{space} {code}"
    else:
        cur.execute(
            "SELECT id FROM curriculum_concepts WHERE name_en = %s",
            (ref["name_en"],),
        )
        rows = cur.fetchall()
        label = ref["name_en"]
    if len(rows) != 1:
        sys.exit(f"Reference {label!r} resolved to {len(rows)} concepts — "
                 f"seed requires exactly one. Aborting (nothing written).")
    return rows[0][0]


def assert_acyclic(edges):
    """DFS cycle check over the seed batch. edges = [(from_id, to_id), ...]."""
    succs = defaultdict(list)
    for f, t in edges:
        succs[f].append(t)
    WHITE, GREY, BLACK = 0, 1, 2
    state = defaultdict(int)

    def visit(node, path):
        state[node] = GREY
        for nxt in succs[node]:
            if state[nxt] == GREY:
                cycle = path + [node, nxt]
                sys.exit(f"Cycle detected: {' -> '.join(map(str, cycle))} — "
                         f"fix the seed. Aborting (nothing written).")
            if state[nxt] == WHITE:
                visit(nxt, path + [node])
        state[node] = BLACK

    for start in list(succs):
        if state[start] == WHITE:
            visit(start, [])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=DEFAULT_DATA)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(args.data):
        sys.exit(f"Data file not found: {args.data}")

    links = json.load(open(args.data, encoding="utf-8"))["links"]
    print(f"Loaded {len(links)} prerequisite links from {args.data}")

    conn = connect()
    try:
        cur = conn.cursor()
        resolved = []
        seen_pairs = set()
        for link in links:
            from_id = resolve(cur, link["from"])
            to_id = resolve(cur, link["to"])
            if from_id == to_id:
                sys.exit(f"Link {link['from']} -> {link['to']} resolved to the "
                         f"same concept ({from_id}) — remove it from the seed.")
            if (from_id, to_id) in seen_pairs:
                sys.exit(f"Duplicate edge {from_id} -> {to_id} in the seed.")
            seen_pairs.add((from_id, to_id))
            resolved.append((from_id, to_id, link["source"],
                             link["confidence"], link.get("note")))

        assert_acyclic([(f, t) for f, t, *_ in resolved])

        if args.dry_run:
            for from_id, to_id, source, conf, note in resolved:
                print(f"  {from_id} -> {to_id}  {source} {conf} {note or ''}")
            print("Dry run — no writes.")
            return

        cur.execute(
            "DELETE FROM concept_links WHERE kind = 'prerequisite' "
            "AND source = 'manual'"
        )
        deleted = cur.rowcount
        cur.executemany(
            "INSERT INTO concept_links "
            "(from_concept_id, to_concept_id, kind, source, confidence, note) "
            "VALUES (%s, %s, 'prerequisite', %s, %s, %s)",
            resolved,
        )
        conn.commit()
        print(f"Replaced {deleted} rows with {len(resolved)} prerequisite links.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
