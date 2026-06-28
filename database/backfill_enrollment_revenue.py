"""Backfill / recompute enrollments.revenue_total for the revenue views.

Run AFTER migration 122 (which adds the column + rewrites enrollment_costs).
The column starts NULL on every existing row; until it is populated the view
falls back to the old (wrong-for-Summer) formula, so run this right after the
migration. It is idempotent — re-running recomputes every row, so it doubles as
a repair tool if a write path is ever missed.

IMPORTANT: this writes ONLY the revenue_total column, via a raw UPDATE. It must
NOT go through the ORM, because Enrollment.last_modified_time has
onupdate=func.now(), and the unique key `unique_active_enrollment_period`
includes a functional expression on cancelled rows derived from
last_modified_time (second precision). Bumping last_modified_time on several
cancelled rows for the same slot in one second collides on that key. Updating
only revenue_total leaves that index untouched.

Connection: uses the Cloud SQL Python Connector (works from WSL2 where the DB is
firewalled). Requires fresh ADC:
    gcloud auth application-default login --no-launch-browser
and the backend venv (google-cloud-sql-connector, pymysql, sqlalchemy, models).

Usage (from repo root, with backend venv active):
    python database/backfill_enrollment_revenue.py            # all enrollments
    python database/backfill_enrollment_revenue.py --dry-run  # report only, no writes
"""
import os
import sys

BACKEND = os.path.join(os.path.dirname(__file__), "..", "webapp", "backend")
sys.path.insert(0, os.path.abspath(BACKEND))

from dotenv import load_dotenv
load_dotenv(os.path.join(BACKEND, ".env"))

from google.cloud.sql.connector import Connector
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from models import Enrollment
from routers.enrollments import compute_enrollment_revenue_total

DRY_RUN = "--dry-run" in sys.argv
BATCH = 200


def main():
    icn = os.environ["INSTANCE_CONNECTION_NAME"]
    user = os.environ["DB_USER"]
    pw = os.environ["DB_PASSWORD"]
    db_name = os.environ["DB_NAME"]

    connector = Connector()
    engine = create_engine(
        "mysql+pymysql://",
        creator=lambda: connector.connect(icn, "pymysql", user=user, password=pw, db=db_name),
    )
    db = sessionmaker(bind=engine)()

    try:
        enrollments = db.query(Enrollment).all()
        total = len(enrollments)
        print(f"Recomputing revenue_total for {total} enrollment(s){' (DRY RUN)' if DRY_RUN else ''}...")

        # Phase 1: compute every value read-only. Never mutate ORM objects, so
        # there is no dirty state to autoflush (and no last_modified_time bump).
        plan = []  # (id, value)
        unresolved = []
        by_type = {}
        with db.no_autoflush:
            for e in enrollments:
                value = compute_enrollment_revenue_total(e, db)
                plan.append((e.id, value))
                if value is None:
                    unresolved.append(e.id)
                else:
                    by_type[e.enrollment_type] = by_type.get(e.enrollment_type, 0) + 1

        # Phase 2: write ONLY revenue_total via raw UPDATE (no ORM onupdate hook).
        written = 0
        if not DRY_RUN:
            stmt = text("UPDATE enrollments SET revenue_total = :v WHERE id = :i")
            for eid, value in plan:
                db.execute(stmt, {"v": value, "i": eid})
                written += 1
                if written % BATCH == 0:
                    db.commit()
                    print(f"  committed {written}/{total}")
            db.commit()

        print("\nDone.")
        print(f"  rows {'computed' if DRY_RUN else 'written'}: {total if DRY_RUN else written}")
        print(f"  priced by type: {by_type}")
        if unresolved:
            print(f"  UNRESOLVED (revenue_total left NULL — view keeps fallback): {len(unresolved)}")
            print(f"    sample ids: {unresolved[:20]}")
        else:
            print("  all rows priced (no NULLs).")
    finally:
        db.close()
        connector.close()


if __name__ == "__main__":
    main()
