"""Seed curriculum_concepts + concept_code_aliases from concept_seed.json.

Data file lives in private/curriculum_data/ (gitignored — regenerate with
private/curriculum_data/build_concept_seed.py from the drive tree listings).

Idempotent: concepts are identified by (kind, name_en, name_zh); existing rows
are updated in place, aliases inserted only when missing. Safe to re-run.

Usage (from repo root):
    webapp/backend/venv/bin/python database/curriculum/seed_concepts.py [--dry-run]
"""
import argparse
import json
import os
import sys

import pymysql
from dotenv import load_dotenv

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_DATA = os.path.join(REPO_ROOT, "private", "curriculum_data", "concept_seed.json")

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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=DEFAULT_DATA)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(args.data):
        sys.exit(f"Data file not found: {args.data}\n"
                 f"Generate it with private/curriculum_data/build_concept_seed.py")

    concepts = json.load(open(args.data, encoding="utf-8"))
    print(f"Loaded {len(concepts)} concepts "
          f"({sum(len(c['aliases']) for c in concepts)} aliases) from {args.data}")
    if args.dry_run:
        for c in concepts[:5]:
            print(" ", c["kind"], c["name_en"] or c["name_zh"], c["aliases"])
        print("Dry run — no writes.")
        return

    conn = connect()
    created = updated = alias_new = 0
    try:
        cur = conn.cursor()
        for c in concepts:
            cur.execute(
                "SELECT id FROM curriculum_concepts WHERE kind = %s "
                "AND name_en <=> %s AND name_zh <=> %s",
                (c["kind"], c["name_en"], c["name_zh"]),
            )
            row = cur.fetchone()
            if row:
                concept_id = row[0]
                cur.execute(
                    "UPDATE curriculum_concepts "
                    "SET grade = %s, display_order = %s, notes = %s WHERE id = %s",
                    (c["grade"], c["display_order"], c["notes"], concept_id),
                )
                updated += 1
            else:
                cur.execute(
                    "INSERT INTO curriculum_concepts "
                    "(kind, name_en, name_zh, grade, display_order, notes) "
                    "VALUES (%s, %s, %s, %s, %s, %s)",
                    (c["kind"], c["name_en"], c["name_zh"],
                     c["grade"], c["display_order"], c["notes"]),
                )
                concept_id = cur.lastrowid
                created += 1
            for code_space, code in c["aliases"]:
                cur.execute(
                    "SELECT id FROM concept_code_aliases "
                    "WHERE code_space = %s AND code = %s AND concept_id = %s",
                    (code_space, code, concept_id),
                )
                if not cur.fetchone():
                    cur.execute(
                        "INSERT INTO concept_code_aliases (concept_id, code_space, code) "
                        "VALUES (%s, %s, %s)",
                        (concept_id, code_space, code),
                    )
                    alias_new += 1
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print(f"Concepts: {created} created, {updated} updated. Aliases: {alias_new} inserted.")


if __name__ == "__main__":
    main()
