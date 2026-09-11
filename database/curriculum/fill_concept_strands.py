"""Fill curriculum_concepts.strand / atlas_grade / atlas_series from
concept_strands_seed.json.

Data file lives in private/curriculum_data/ (gitignored). Assignments were
veto-reviewed by Kenny (2026-07-09). Requires migration 127 (strand +
atlas_grade columns) and migration 174 (atlas_series).

atlas_series is only set on extension topics that belong to one series. The
atlas otherwise reads a topic's series from its chapter codes, and a topic with
no codes shows in both.

Idempotent by full re-apply: every concept referenced in the seed gets its
strand, atlas_grade and atlas_series UPDATEd (a missing key writes NULL);
concepts not in the seed are left untouched. Run this after seed_concepts.py on any fresh seed --
build_concept_seed.py does not carry strands.

Usage (from repo root):
    webapp/backend/venv/bin/python database/curriculum/fill_concept_strands.py [--dry-run]
"""
import argparse
import json
import os
import sys

from _common import REPO_ROOT, connect, resolve  # noqa: E402  (sets sys.path + .env)

DEFAULT_DATA = os.path.join(REPO_ROOT, "private", "curriculum_data", "concept_strands_seed.json")

VALID_STRANDS = {"number", "algebra", "geometry", "data"}
VALID_SERIES = {"MAS", "HK"}


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
    bad = [e for e in entries if e.get("atlas_series") not in VALID_SERIES | {None}]
    if bad:
        sys.exit(f"Invalid atlas_series values: {[e['atlas_series'] for e in bad]}")

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
            resolved.append((e["strand"], e.get("atlas_grade"), e.get("atlas_series"), cid))

        cur.execute("SELECT COUNT(*) FROM curriculum_concepts")
        total = cur.fetchone()[0]
        if len(resolved) != total:
            print(f"NOTE: seed covers {len(resolved)} of {total} concepts — "
                  f"the rest keep their current strand.")

        if args.dry_run:
            for strand, atlas_grade, atlas_series, cid in resolved:
                print(f"  concept {cid}: strand={strand}"
                      + (f" atlas_grade={atlas_grade}" if atlas_grade else "")
                      + (f" atlas_series={atlas_series}" if atlas_series else ""))
            print("Dry run — no writes.")
            return

        cur.executemany(
            "UPDATE curriculum_concepts SET strand = %s, atlas_grade = %s, atlas_series = %s "
            "WHERE id = %s",
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
