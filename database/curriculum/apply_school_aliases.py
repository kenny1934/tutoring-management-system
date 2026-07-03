"""Re-apply the school alias FIX map to school_topic_observations.

The backfill canonicalises school names through
private/curriculum_data/school_aliases.json, but rows written before an
alias was added keep the variant spelling, splitting one school's timeline
in two. This applies the current FIX map to existing rows, then removes any
exact duplicates the merge produced (keeping the oldest row).

Idempotent: reruns find nothing to change.

Usage (from repo root):
    webapp/backend/venv/bin/python database/curriculum/apply_school_aliases.py [--dry-run]
"""
import argparse
import json
import os

import pymysql
from dotenv import load_dotenv

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(REPO_ROOT, "webapp", "backend", ".env"))
ALIASES_PATH = os.path.join(REPO_ROOT, "private", "curriculum_data", "school_aliases.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    fix = json.load(open(ALIASES_PATH, encoding="utf-8"))["FIX"]
    renames = {variant: canon for variant, canon in fix.items() if variant != canon}

    conn = pymysql.connect(
        host=os.getenv("DB_HOST", "localhost"), port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER"), password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"), charset="utf8mb4", connect_timeout=10,
    )
    cur = conn.cursor()

    total = 0
    for variant, canon in renames.items():
        cur.execute(
            "SELECT COUNT(*) FROM school_topic_observations WHERE school = %s",
            (variant,),
        )
        count = cur.fetchone()[0]
        if not count:
            continue
        print(f"  {variant!r} -> {canon!r}: {count} rows")
        total += count
        if not args.dry_run:
            cur.execute(
                "UPDATE school_topic_observations SET school = %s WHERE school = %s",
                (canon, variant),
            )

    if total == 0:
        print("Nothing to rename.")

    if args.dry_run:
        conn.rollback()
        print("Dry run — rolled back.")
        return

    # Drop exact duplicates a merge may have produced (keep the oldest row).
    cur.execute("""
        DELETE a FROM school_topic_observations a
        JOIN school_topic_observations b
          ON b.id < a.id
         AND b.school = a.school AND b.grade = a.grade
         AND (b.lang_stream <=> a.lang_stream)
         AND b.academic_year = a.academic_year
         AND b.week_number = a.week_number
         AND b.concept_id = a.concept_id
         AND b.source = a.source
         AND (b.source_ref <=> a.source_ref)
    """)
    if cur.rowcount:
        print(f"removed {cur.rowcount} duplicate rows after merge")
    conn.commit()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
