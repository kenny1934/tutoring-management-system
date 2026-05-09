"""Promote each student's grade by one step once per calendar year.

Idempotent via Student.last_promoted_year. Usage from backend dir:

    ./venv/bin/python scripts/promote_grades.py            # current HK year, apply
    ./venv/bin/python scripts/promote_grades.py --dry-run  # preview only
    ./venv/bin/python scripts/promote_grades.py --year 2026

This is the standalone counterpart to POST /api/admin/promote-grades, useful
for one-off runs against Cloud MySQL outside the running app.
"""

import argparse
import os
import sys
from datetime import datetime, timezone, timedelta

# Allow running from the backend directory.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal  # noqa: E402
from models import Student  # noqa: E402
from utils.grades import PROMOTE_MAP  # noqa: E402

HK_TZ = timezone(timedelta(hours=8))


def main() -> int:
    parser = argparse.ArgumentParser(description="Promote student grades.")
    parser.add_argument("--year", type=int, default=datetime.now(HK_TZ).year)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    current_hk_year = datetime.now(HK_TZ).year
    if args.year > current_hk_year + 1:
        print(f"Refusing: --year {args.year} too far in the future (max {current_hk_year + 1}).")
        return 1

    db = SessionLocal()
    try:
        candidates = (
            db.query(Student)
            .filter(
                (Student.last_promoted_year.is_(None))
                | (Student.last_promoted_year < args.year)
            )
            .all()
        )

        promoted = 0
        skipped = 0
        by_grade: dict[str, int] = {}
        for student in candidates:
            current = student.grade
            nxt = PROMOTE_MAP.get(current) if current else None
            if not nxt:
                # Graduated/unknown/empty — stamp the year so they drop out
                # of next year's candidate set.
                skipped += 1
                if not args.dry_run:
                    student.last_promoted_year = args.year
                continue
            by_grade[current] = by_grade.get(current, 0) + 1
            if not args.dry_run:
                student.grade = nxt
                student.last_promoted_year = args.year
            promoted += 1

        if not args.dry_run:
            db.commit()

        print(f"target_year={args.year} dry_run={args.dry_run}")
        print(f"  promoted: {promoted}")
        print(f"  skipped:  {skipped}")
        for g, n in sorted(by_grade.items()):
            print(f"  {g} -> {PROMOTE_MAP.get(g)}: {n}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
