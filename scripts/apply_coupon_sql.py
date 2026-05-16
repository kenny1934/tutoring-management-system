#!/usr/bin/env python3
"""
Apply generated coupon_updates_*.sql files to Cloud MySQL via backend SQLAlchemy engine.

Usage:
    # From repo root, using backend venv:
    ./webapp/backend/venv/bin/python scripts/apply_coupon_sql.py --dry-run FILE [FILE ...]
    ./webapp/backend/venv/bin/python scripts/apply_coupon_sql.py --apply   FILE [FILE ...]

Dry-run computes how many rows would be inserted vs updated vs unchanged by
comparing the desired (student_id -> available_coupons) state against current
DB state, without writing anything. Apply runs every statement in a single
transaction and commits only if all succeed.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "webapp" / "backend"))

from sqlalchemy import text  # noqa: E402

from database import SessionLocal, engine  # noqa: E402


STATEMENT_PATTERN = re.compile(
    r"WHERE\s+home_location\s*=\s*'(?P<loc>[^']+)'\s+AND\s+school_student_id\s*=\s*'(?P<sid>[^']+)'\s+ON DUPLICATE KEY UPDATE\s+available_coupons\s*=\s*(?P<count>\d+)",
    re.IGNORECASE,
)


def parse_desired_state(sql_text: str) -> list[tuple[str, str, int]]:
    """Extract (location, school_student_id, available_coupons) tuples from a generated SQL file."""
    return [
        (m.group("loc"), m.group("sid"), int(m.group("count")))
        for m in STATEMENT_PATTERN.finditer(sql_text)
    ]


def split_statements(sql_text: str) -> list[str]:
    """Split a multi-statement .sql file into individual statements, dropping comments and empty lines."""
    cleaned_lines = []
    for line in sql_text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            continue
        cleaned_lines.append(line)
    blob = "\n".join(cleaned_lines)
    return [stmt.strip() for stmt in blob.split(";") if stmt.strip()]


def dry_run(files: list[Path]) -> int:
    desired: dict[tuple[str, str], int] = {}
    for f in files:
        for loc, sid, count in parse_desired_state(f.read_text()):
            desired[(loc, sid)] = count
    print(f"Parsed {len(desired)} unique (location, student_id) rows from {len(files)} file(s).")

    with SessionLocal() as db:
        rows = db.execute(
            text(
                "SELECT s.home_location, s.school_student_id, s.id AS student_id, "
                "sc.available_coupons AS current_coupons "
                "FROM students s LEFT JOIN student_coupons sc ON sc.student_id = s.id"
            )
        ).all()

    by_key = {(r.home_location, r.school_student_id): r for r in rows}

    matched = unmatched = insert = update_changed = update_unchanged = 0
    sample_unmatched = []
    sample_changes = []
    for (loc, sid), new_count in desired.items():
        existing = by_key.get((loc, sid))
        if existing is None:
            unmatched += 1
            if len(sample_unmatched) < 5:
                sample_unmatched.append(f"{loc}{sid}")
            continue
        matched += 1
        if existing.current_coupons is None:
            insert += 1
            if new_count > 0 and len(sample_changes) < 5:
                sample_changes.append(f"INSERT {loc}{sid}: NULL -> {new_count}")
        elif existing.current_coupons != new_count:
            update_changed += 1
            if len(sample_changes) < 5:
                sample_changes.append(
                    f"UPDATE {loc}{sid}: {existing.current_coupons} -> {new_count}"
                )
        else:
            update_unchanged += 1

    print()
    print("=== Dry-run summary ===")
    print(f"  Matched students:          {matched}")
    print(f"  Unmatched (skipped):       {unmatched}")
    print(f"  → New coupon rows:         {insert}")
    print(f"  → Updates that change val: {update_changed}")
    print(f"  → Updates with same val:   {update_unchanged}")

    if sample_unmatched:
        print("\n  Sample unmatched company IDs (no such student in DB):")
        for s in sample_unmatched:
            print(f"    - {s}")
    if sample_changes:
        print("\n  Sample changes:")
        for s in sample_changes:
            print(f"    - {s}")

    return 0


def apply(files: list[Path]) -> int:
    statements_per_file: list[tuple[Path, list[str]]] = []
    total_statements = 0
    for f in files:
        statements = split_statements(f.read_text())
        # Drop the leading "START TRANSACTION" — we manage the transaction in Python.
        statements = [s for s in statements if s.upper() != "START TRANSACTION"]
        # Drop the trailing verification SELECT — we'll run our own after.
        statements = [s for s in statements if not s.upper().startswith("SELECT")]
        statements_per_file.append((f, statements))
        total_statements += len(statements)

    print(f"Applying {total_statements} statement(s) from {len(files)} file(s) in one transaction...")

    with engine.begin() as conn:
        for f, statements in statements_per_file:
            print(f"  → {f.name}: {len(statements)} statement(s)")
            for stmt in statements:
                conn.execute(text(stmt))

        result = conn.execute(
            text(
                "SELECT COUNT(*) AS total_rows, "
                "SUM(CASE WHEN available_coupons > 0 THEN 1 ELSE 0 END) AS with_coupons, "
                "SUM(available_coupons) AS total_coupons "
                "FROM student_coupons"
            )
        ).one()
        print()
        print("=== Post-apply state (uncommitted) ===")
        print(f"  Total student_coupon rows:    {result.total_rows}")
        print(f"  Rows with > 0 coupons:        {result.with_coupons}")
        print(f"  Sum of available_coupons:     {result.total_coupons}")
        print()
        print("Committing transaction...")

    print("✅ Committed.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true")
    group.add_argument("--apply", action="store_true")
    parser.add_argument("files", nargs="+", type=Path)
    args = parser.parse_args()

    for f in args.files:
        if not f.exists():
            print(f"❌ File not found: {f}", file=sys.stderr)
            return 1

    return dry_run(args.files) if args.dry_run else apply(args.files)


if __name__ == "__main__":
    raise SystemExit(main())
