"""Repair SummerApplication.verified_branch_origin where a linked P6 prospect
exists but the origin was overwritten by the destination CSM Student's
home_location.

Background: an earlier auto-fill (summer_course.py admin update path) set
verified_branch_origin = student.home_location whenever an existing_student_id
was linked. For F1 applicants from a primary branch (e.g. MTA) joining MSA/MSB,
this flipped origin from MTA → MSA/MSB and silently dropped the 26SummerMC
receipt code suggestion.

The runtime path is now fixed to prefer prospect.source_branch. This script
back-fills already-affected rows.

Idempotent. Defaults to dry-run; pass --apply to write.
"""
import argparse
import os
import sys
import pymysql
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "webapp", "backend", ".env"))

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually write changes. Without this flag, the script only prints what would change.",
    )
    args = parser.parse_args()

    conn = pymysql.connect(
        host=DB_HOST, port=DB_PORT,
        user=DB_USER, password=DB_PASSWORD, database=DB_NAME,
    )
    try:
        with conn.cursor() as cur:
            # Every application with a linked prospect whose source_branch
            # disagrees with the stored verified_branch_origin.
            cur.execute(
                """
                SELECT
                    sa.id              AS application_id,
                    sa.reference_code,
                    sa.student_name,
                    sa.grade,
                    sa.verified_branch_origin AS current_origin,
                    pp.id              AS prospect_id,
                    pp.source_branch   AS prospect_branch
                FROM summer_applications sa
                JOIN primary_prospects pp
                  ON pp.summer_application_id = sa.id
                WHERE pp.source_branch IS NOT NULL
                  AND (
                       sa.verified_branch_origin IS NULL
                    OR sa.verified_branch_origin
                       <> pp.source_branch COLLATE utf8mb4_unicode_ci
                  )
                ORDER BY sa.id
                """
            )
            rows = cur.fetchall()

            if not rows:
                print("No applications need repair.")
                return

            print(f"{len(rows)} application(s) to update:")
            print(f"  {'app_id':>6}  {'ref':<14} {'grade':<5} {'origin → prospect':<22} student")
            for app_id, ref, name, grade, current, _pid, prospect_branch in rows:
                arrow = f"{current or 'NULL'} → {prospect_branch}"
                print(f"  {app_id:>6}  {ref:<14} {grade:<5} {arrow:<22} {name}")

            if not args.apply:
                print("\nDry run. Re-run with --apply to write changes.")
                return

            cur.executemany(
                "UPDATE summer_applications SET verified_branch_origin = %s WHERE id = %s",
                [(prospect_branch, app_id) for app_id, *_, prospect_branch in rows],
            )
            conn.commit()
            print(f"\nUpdated {cur.rowcount} row(s).")
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
