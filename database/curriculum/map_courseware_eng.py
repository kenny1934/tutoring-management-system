"""Map V:\\Secondary\\Finalised\\!Courseware (Eng) into courseware_concepts.

That folder holds ENGLISH materials for MAS-order topics (the in-house MAS
series is otherwise Chinese-only), organised by topic-name folders with no
chapter codes — so the code backfill channel missed them. They are the
English-stream answer for schools that pace by the MAS order (e.g. SRL-E
doing quadratics in junior forms).

Folders are hand-mapped to concepts below. Where the topic exists in BOTH
series the file maps to both concepts, so it surfaces from either school
timeline. Answer PDFs and Word sources are skipped (only main PDFs are
assignable).

Idempotent by rebuild: deletes previous rows for this subtree, re-inserts.

Usage (from repo root):
    webapp/backend/venv/bin/python database/curriculum/map_courseware_eng.py [--dry-run]
"""
import argparse
import os

from _common import REPO_ROOT, connect  # noqa: E402  (sets sys.path + .env)
from curriculum.parser import parse_pdf_name  # noqa: E402
from curriculum.paths import normalize  # noqa: E402

TREE_V = os.path.join(REPO_ROOT, "private", "curriculum_data", "drive_trees", "tree_v_secondary.txt")

SUBTREE = "!Courseware (Eng)"
CONFIDENCE = 0.95

# folder name -> concept refs. Bilingual names collide across series (HK 704
# and MAS both read 一元一次方程), so refs carry the series:
#   ("mas", name_zh) -> concept holding a MAS code alias
#   ("hk", name_en)  -> concept holding an HK_NEW code alias
#   ("ext", name_en) -> extension concept
FOLDER_MAP = {
    "Absolute Value": [("mas", "有理數")],
    "Algebraic Fractions and Formulae": [("hk", "Algebraic Fractions and Formulae"), ("mas", "分式")],
    "Angles Related to Straight Lines and Triangles": [("mas", "相交線與平行線"), ("hk", "Angles Related to Lines")],
    "Applications of Linear Equations in One Unknown": [("mas", "一元一次方程"), ("hk", "Linear Equations in One Unknown")],
    "Approximate Values": [("hk", "Approximate values and Numerical estimation")],
    "Area and Volume(III)": [("hk", "Areas and Volumes(III)")],
    "Basic Properties of Circles (I)": [("ext", "Basic Properties of Circles")],
    "Basic Properties of Circles (II)": [("ext", "Basic Properties of Circles")],
    "Centres of Triangles": [("hk", "Special Lines and Centres in a Triangle")],
    "Congruent Triangles": [("mas", "全等三角形"), ("hk", "Congruence")],
    "Factorization": [("mas", "整式乘法與因式分解"), ("hk", "Factorization of Polynomials")],
    "Fractional Indices": [("hk", "Laws of Integral Indices")],
    "Functions and Graphs": [("ext", "Introduction to Functions and Graphs")],
    "Identities": [("hk", "Identities"), ("mas", "整式乘法與因式分解")],
    "Inequalities": [("mas", "不等式與不等式組"), ("hk", "Linear Inequalities in One Unknown")],
    "Laws of Integral Indices": [("hk", "Laws of Integral Indices")],
    "Linear Equations in Two Unknowns": [("hk", "Linear Equations in Two Unknowns"), ("mas", "二元一次方程組")],
    "Linear Function": [("mas", "一次函數")],
    "Matrix": [],  # F4+/no junior concept — deliberately unmapped
    "More about Statistical Diagrams": [("hk", "More about Statistical Diagrams")],
    "Percentage (II)": [("hk", "Percentage(II)")],
    "Polynomial": [("mas", "整式"), ("hk", "Manipulation of Simple Polynomials")],
    "Probability of Dropping a Coin": [("mas", "概率初步"), ("hk", "Intro to Prob")],
    "Quadratic Equations in One Unknown": [("mas", "一元二次方程")],
    "Sequence": [("ext", "Sequences")],
    "Similar Triangles": [("mas", "相似"), ("hk", "Similarity")],
    "Triangle Inequality": [("mas", "三角形")],
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    conn = connect()
    cur = conn.cursor()

    def concept_id(ref):
        series, name = ref
        if series == "ext":
            cur.execute(
                "SELECT id FROM curriculum_concepts WHERE kind = 'extension' AND name_en = %s",
                (name,),
            )
        else:
            col = "name_zh" if series == "mas" else "name_en"
            space = "MAS" if series == "mas" else "HK_NEW"
            cur.execute(
                f"SELECT DISTINCT c.id FROM curriculum_concepts c "
                f"JOIN concept_code_aliases a ON a.concept_id = c.id "
                f"WHERE c.{col} = %s AND a.code_space = %s",
                (name, space),
            )
        rows = cur.fetchall()
        if len(rows) != 1:
            raise SystemExit(f"concept lookup failed for {ref}: {len(rows)} rows")
        return rows[0][0]

    ids = {folder: [concept_id(r) for r in refs] for folder, refs in FOLDER_MAP.items()}

    rows, skipped, unmapped = [], 0, set()
    for line in open(TREE_V, encoding="utf-8", errors="replace"):
        line = line.strip()
        if SUBTREE not in line or not line.lower().endswith(".pdf"):
            continue
        parts = line.split("\\")
        i = parts.index(SUBTREE)
        folder = parts[i + 1] if i + 1 < len(parts) else ""
        if "\\Ans\\" in line or "\\Word Files\\" in line or line.lower().endswith("_ans.pdf"):
            skipped += 1
            continue
        if folder not in FOLDER_MAP:
            unmapped.add(folder)
            continue
        n = normalize(line)
        alias_path = f"Courseware Developer 中學\\{n['match_path']}"
        p = parse_pdf_name(n["basename"])
        role = p.get("role") or ("revision" if p.get("is_rev") else None)
        for cid in ids[folder]:
            rows.append((alias_path, n["match_path"], n["basename"], cid, role, "e", "manual", CONFIDENCE))

    print(f"rows to insert: {len(rows)} (skipped ans/word: {skipped})")
    if unmapped:
        print("UNMAPPED folders:", sorted(unmapped))
    by_folder = {}
    for r in rows:
        by_folder.setdefault(r[1].split("\\")[3], []).append(r)
    for f, rs in sorted(by_folder.items()):
        print(f"  {f}: {len(rs)}")

    if args.dry_run:
        print("Dry run — no writes.")
        return

    like = "Secondary\\\\Finalised\\\\!Courseware (Eng)\\\\%"
    cur.execute("DELETE FROM courseware_concepts WHERE match_path LIKE %s", (like,))
    print(f"deleted {cur.rowcount} existing rows for this subtree")
    cur.executemany(
        "INSERT IGNORE INTO courseware_concepts "
        "(file_path, match_path, file_basename, concept_id, role, lang, source, confidence) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        rows,
    )
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM courseware_concepts")
    print(f"courseware_concepts now has {cur.fetchone()[0]} rows")
    conn.close()


if __name__ == "__main__":
    main()
