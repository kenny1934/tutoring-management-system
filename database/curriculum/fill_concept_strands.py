"""Fill curriculum_concepts.strand / atlas_grade from concept_strands_seed.json.

Data file lives in private/curriculum_data/ (gitignored). Assignments were
veto-reviewed by Kenny (2026-07-09). Requires migration 127 (strand +
atlas_grade columns).

Idempotent by full re-apply: every concept referenced in the seed gets its
strand (and atlas_grade, when present) UPDATEd; concepts not in the seed are
left untouched. Run this after seed_concepts.py on any fresh seed --
build_concept_seed.py does not carry strands.

Usage (from repo root):
    webapp/backend/venv/bin/python database/curriculum/fill_concept_strands.py [--dry-run]
"""
import argparse
import json
import os
import sys

import pymysql
from dotenv import load_dotenv

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_DATA = os.path.join(REPO_ROOT, "private", "curriculum_data", "concept_strands_seed.json")

load_dotenv(os.path.join(REPO_ROOT, "webapp", "backend", ".env"))

VALID_STRANDS = {"number", "algebra", "geometry", "data"}


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
    seed_concept_links.py: coded ref via concept_code_aliases, name ref for
    extension concepts without codes)."""
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

    entries = json.load(open(args.data, encoding="utf-8"))["strands"]
    print(f"Loaded {len(entries)} strand assignments from {args.data}")

    bad = [e for e in entries if e["strand"] not in VALID_STRANDS]
    if bad:
        sys.exit(f"Invalid strand values: {[e['strand'] for e in bad]}")

    conn = connect()
    try:
        cur = conn.cursor()
        resolved = []
        seen = set()
        for e in entries:
            cid = resolve(cur, e["ref"])
            if cid in seen:
                sys.exit(f"Concept {cid} appears twice in the seed — fix the data.")
            seen.add(cid)
            resolved.append((e["strand"], e.get("atlas_grade"), cid))

        cur.execute("SELECT COUNT(*) FROM curriculum_concepts")
        total = cur.fetchone()[0]
        if len(resolved) != total:
            print(f"NOTE: seed covers {len(resolved)} of {total} concepts — "
                  f"the rest keep their current strand.")

        if args.dry_run:
            for strand, atlas_grade, cid in resolved:
                print(f"  concept {cid}: strand={strand}"
                      + (f" atlas_grade={atlas_grade}" if atlas_grade else ""))
            print("Dry run — no writes.")
            return

        cur.executemany(
            "UPDATE curriculum_concepts SET strand = %s, atlas_grade = %s WHERE id = %s",
            resolved,
        )
        conn.commit()
        print(f"Updated {len(resolved)} concepts.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
