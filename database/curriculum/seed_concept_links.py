"""Seed concept_links (cross-series equivalence) from concept_links_seed.json.

Data file lives in private/curriculum_data/ (gitignored). The seed is a curated
version of the dry-run XSER table — see the _comment block in the JSON for the
corrections made against the dry run.

Idempotent by rebuild: deletes all kind='equivalent' rows with source in
('xser','manual') and re-inserts from the JSON. Never touches other kinds
(prerequisite rows, when they exist, are managed by their own seed).

Usage (from repo root):
    webapp/backend/venv/bin/python database/curriculum/seed_concept_links.py [--dry-run]
"""
import argparse
import json
import os
import sys

import pymysql
from dotenv import load_dotenv

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_DATA = os.path.join(REPO_ROOT, "private", "curriculum_data", "concept_links_seed.json")

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
    """Resolve a seed reference to exactly one concept id.

    Coded ref: ["SPACE", "code"] via concept_code_aliases (must be unambiguous —
    MAS and HK_NEW codes each alias exactly one concept, unlike HK_OLD splits).
    Name ref: {"name_en": ...} for extension concepts, which carry no codes.
    """
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=DEFAULT_DATA)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(args.data):
        sys.exit(f"Data file not found: {args.data}")

    links = json.load(open(args.data, encoding="utf-8"))["links"]
    print(f"Loaded {len(links)} equivalence links from {args.data}")

    conn = connect()
    try:
        cur = conn.cursor()
        resolved = []
        for link in links:
            from_id = resolve(cur, link["from"])
            to_id = resolve(cur, link["to"])
            if from_id == to_id:
                sys.exit(f"Link {link['from']} -> {link['to']} resolved to the "
                         f"same concept ({from_id}) — remove it from the seed.")
            resolved.append((from_id, to_id, link["source"],
                             link["confidence"], link.get("note")))

        if args.dry_run:
            for from_id, to_id, source, conf, note in resolved:
                print(f"  {from_id} <-> {to_id}  {source} {conf} {note or ''}")
            print("Dry run — no writes.")
            return

        cur.execute(
            "DELETE FROM concept_links WHERE kind = 'equivalent' "
            "AND source IN ('xser','manual')"
        )
        deleted = cur.rowcount
        cur.executemany(
            "INSERT INTO concept_links "
            "(from_concept_id, to_concept_id, kind, source, confidence, note) "
            "VALUES (%s, %s, 'equivalent', %s, %s, %s)",
            resolved,
        )
        conn.commit()
        print(f"Replaced {deleted} rows with {len(resolved)} equivalence links.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
