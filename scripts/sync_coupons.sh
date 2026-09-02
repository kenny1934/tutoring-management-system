#!/bin/bash
#
# Sync student coupon counts from the company system's TerminationList exports.
#
# Usage:
#   ./scripts/sync_coupons.sh <excel_file> [<excel_file> ...]
#
# Example, syncing both branches in one go:
#   ./scripts/sync_coupons.sh ~/lists/TerminationList_MSA_*.xls ~/lists/TerminationList_MSB_*.xls
#
# What it does, in order:
#   1. Turns each .xls into a coupon_updates_*.sql file (scripts/process_coupons.py,
#      which needs pandas and xlrd, so it runs on the analysis_env venv).
#   2. Shows you a dry run of every generated file against the live database, so you
#      can see how many rows would be inserted, changed or left alone before anything
#      is written (scripts/apply_coupon_sql.py, which runs on the backend venv because
#      it borrows the backend's own database connection and reads its .env).
#   3. Asks you to confirm, then applies all the files in a single transaction.
#
# Nothing is written to the database until you answer the confirmation prompt.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ANALYSIS_PY="$REPO_ROOT/analysis_env/bin/python"
BACKEND_PY="$REPO_ROOT/webapp/backend/venv/bin/python"
GENERATOR="$REPO_ROOT/scripts/process_coupons.py"
APPLIER="$REPO_ROOT/scripts/apply_coupon_sql.py"

if [ $# -eq 0 ]; then
    echo "Usage: ./scripts/sync_coupons.sh <excel_file> [<excel_file> ...]"
    echo ""
    echo "Pass both branch exports at once so they apply in the same transaction:"
    echo "  ./scripts/sync_coupons.sh TerminationList_MSA_*.xls TerminationList_MSB_*.xls"
    exit 1
fi

if [ ! -x "$ANALYSIS_PY" ]; then
    echo "Error: the analysis venv is missing its interpreter at $ANALYSIS_PY"
    echo "Rebuild it with:"
    echo "  python3 -m venv $REPO_ROOT/analysis_env"
    echo "  $REPO_ROOT/analysis_env/bin/pip install pandas openpyxl xlrd"
    exit 1
fi

if [ ! -x "$BACKEND_PY" ]; then
    echo "Error: the backend venv is missing its interpreter at $BACKEND_PY"
    echo "It supplies the database connection, so the apply step cannot run without it."
    exit 1
fi

# Resolve every input to an absolute path and check it exists, before doing any work.
INPUTS=()
for f in "$@"; do
    if [ ! -f "$f" ]; then
        echo "Error: file not found: $f"
        exit 1
    fi
    INPUTS+=("$(cd "$(dirname "$f")" && pwd)/$(basename "$f")")
done

# Generated SQL carries student IDs, so it goes in a gitignored directory rather than
# the repo root. Each run gets its own timestamped folder and keeps the old ones.
RUN_STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_DIR="$REPO_ROOT/coupon-sync/$RUN_STAMP"
mkdir -p "$OUT_DIR"

echo "=== Coupon Sync ==="
echo ""
echo "Files to process: ${#INPUTS[@]}"
for f in "${INPUTS[@]}"; do
    echo "  - $(basename "$f")"
done
echo "Output directory: $OUT_DIR"
echo ""

# Step 1: generate one .sql per input.
#
# process_coupons.py names its output after the current time and drops it in the working
# directory, so two inputs processed in the same second would collide and a plain "newest
# file" search could pick up the wrong one. Giving each input its own empty staging
# directory avoids both problems, and the result is renamed after its source file.
echo "1. Generating SQL from the Excel exports..."
echo ""

SQL_FILES=()
for f in "${INPUTS[@]}"; do
    base="$(basename "${f%.*}")"
    stage="$OUT_DIR/.staging/$base"
    mkdir -p "$stage"

    ( cd "$stage" && "$ANALYSIS_PY" "$GENERATOR" "$f" )

    produced="$(find "$stage" -maxdepth 1 -name 'coupon_updates_*.sql' -print -quit)"
    if [ -z "$produced" ]; then
        echo "Error: no SQL was generated for $(basename "$f"). Stopping without touching the database."
        exit 1
    fi

    mv "$produced" "$OUT_DIR/$base.sql"
    SQL_FILES+=("$OUT_DIR/$base.sql")
    echo ""
done

rm -rf "$OUT_DIR/.staging"

echo "   Generated ${#SQL_FILES[@]} file(s):"
for s in "${SQL_FILES[@]}"; do
    echo "     $(basename "$s")"
done
echo ""

# Step 2: dry run against the live database. This only reads.
echo "2. Dry run against the database (nothing is written yet)..."
echo ""
"$BACKEND_PY" "$APPLIER" --dry-run "${SQL_FILES[@]}"
echo ""

# Step 3: confirm before writing.
echo "Read the dry run above. Unmatched rows are students in the exports that do not"
echo "exist in CSM, and they are skipped rather than created."
echo ""
read -r -p "Apply these changes to the database? (y/n): " REPLY
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled. Nothing was written."
    echo "The generated SQL is kept at $OUT_DIR if you want to look at it."
    exit 0
fi

# Step 4: apply everything in one transaction.
echo "3. Applying..."
echo ""
"$BACKEND_PY" "$APPLIER" --apply "${SQL_FILES[@]}"
echo ""
echo "Done. The SQL that was applied is kept at $OUT_DIR"
