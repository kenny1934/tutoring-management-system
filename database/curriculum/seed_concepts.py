"""Seed curriculum_concepts + concept_code_aliases from concept_seed.json.

Data file lives in private/curriculum_data/ (gitignored — regenerate with
private/curriculum_data/build_concept_seed.py from the drive tree listings).

Idempotent: concepts are resolved through their code aliases first, then by
(kind, name_en, name_zh); existing rows are updated in place, aliases inserted
only when missing. Safe to re-run, including after fill_concept_names.py.

Usage (from repo root):
    webapp/backend/venv/bin/python database/curriculum/seed_concepts.py [--dry-run]
"""
import argparse
import json
import os
import sys

from _common import REPO_ROOT, connect  # noqa: E402  (sets sys.path + .env)

DEFAULT_DATA = os.path.join(REPO_ROOT, "private", "curriculum_data", "concept_seed.json")


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

    def resolve_existing(cur, c):
        """Existing concept id for a seed entry, or None.

        Aliases are the stable identity: fill_concept_names.py patches NULL
        name halves in the DB, so a regenerated seed (names still None) would
        fail the name match and re-insert every chapter. A couple of HK_OLD
        codes are legitimately shared between two concepts, so intersect the
        per-alias hits and let the name break any remaining tie.
        """
        hit_sets = []
        for code_space, code in c["aliases"]:
            cur.execute(
                "SELECT concept_id FROM concept_code_aliases "
                "WHERE code_space = %s AND code = %s",
                (code_space, code),
            )
            rows = {r[0] for r in cur.fetchall()}
            if rows:
                hit_sets.append(rows)
        candidates = set.intersection(*hit_sets) if hit_sets else set()
        cur.execute(
            "SELECT id FROM curriculum_concepts WHERE kind = %s "
            "AND name_en <=> %s AND name_zh <=> %s",
            (c["kind"], c["name_en"], c["name_zh"]),
        )
        row = cur.fetchone()
        name_id = row[0] if row else None
        if len(candidates) == 1:
            return candidates.pop()
        if candidates:
            if name_id in candidates:
                return name_id
            sys.exit(f"Aliases of '{c['name_en'] or c['name_zh']}' point at "
                     f"concepts {sorted(candidates)} and the names match none "
                     f"of them — resolve by hand before re-seeding.")
        return name_id

    try:
        cur = conn.cursor()
        for c in concepts:
            concept_id = resolve_existing(cur, c)
            if concept_id is not None:
                # COALESCE keeps names patched by fill_concept_names.py when
                # the seed half is still None, while applying deliberate
                # renames the seed does carry.
                cur.execute(
                    "UPDATE curriculum_concepts "
                    "SET name_en = COALESCE(%s, name_en), "
                    "    name_zh = COALESCE(%s, name_zh), "
                    "    grade = %s, display_order = %s, notes = %s WHERE id = %s",
                    (c["name_en"], c["name_zh"],
                     c["grade"], c["display_order"], c["notes"], concept_id),
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
