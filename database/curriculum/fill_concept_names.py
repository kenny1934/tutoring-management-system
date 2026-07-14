"""Fill the missing half of each chapter concept's bilingual name.

HK concepts were seeded from English master filenames (the Chi tree mirrors
filenames, so no Chinese names existed mechanically). The OFFICIAL Chinese
chapter titles live in the title text of the Chi masters' first page —
extracted to private/curriculum_data/hk_zh_titles.json (code -> title) and
applied here via the HK_NEW code aliases.

MAS has no official English titles (in-house Chinese series), so the English
side uses standard textbook translations of the 人教-order chapter names.

Also patches private/curriculum_data/concept_seed.json in place: the seeder
matches concepts by (kind, name_en, name_zh), so the seed must carry the same
names as the DB or a re-run would insert duplicates.

Idempotent: only fills where the target side IS NULL.

Usage (from repo root):
    webapp/backend/venv/bin/python database/curriculum/fill_concept_names.py [--dry-run]
"""
import argparse
import json
import os

from _common import PRIV, connect  # noqa: E402  (sets sys.path + .env)

SEED_PATH = os.path.join(PRIV, "concept_seed.json")
HK_TITLES_PATH = os.path.join(PRIV, "hk_zh_titles.json")

# MAS chapters: name_zh (existing identity) -> name_en. Standard textbook
# translations — no official English exists for the in-house MAS series.
MAS_EN = {
    "有理數": "Rational Numbers",
    "整式": "Algebraic Expressions",
    "一元一次方程": "Linear Equations in One Unknown",
    "幾何圖形初步": "Introduction to Geometric Figures",
    "相交線與平行線": "Intersecting and Parallel Lines",
    "實數": "Real Numbers",
    "平面直角坐標系": "Rectangular Coordinate System",
    "二元一次方程組": "Systems of Linear Equations in Two Unknowns",
    "不等式與不等式組": "Inequalities and Systems of Inequalities",
    "數據的收集、整理與描述": "Collection, Organisation and Description of Data",
    "三角形": "Triangles",
    "全等三角形": "Congruent Triangles",
    "軸對稱": "Axial Symmetry",
    "整式乘法與因式分解": "Multiplication of Polynomials and Factorization",
    "分式": "Algebraic Fractions",
    "二次根式": "Quadratic Surds",
    "勾股定理": "Pythagoras' Theorem",
    "平行四邊形": "Parallelograms",
    "一次函數": "Linear Functions",
    "數據的分析": "Data Analysis",
    "一元二次方程": "Quadratic Equations in One Unknown",
    "二次函數": "Quadratic Functions",
    "旋轉": "Rotation",
    "圓": "Circles",
    "概率初步": "Introduction to Probability",
    "反比例函數": "Inverse Proportion Functions",
    "相似": "Similarity",
    "銳角三角函數": "Trigonometric Ratios of Acute Angles",
    "投影與視圖": "Projections and Views",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    hk_titles = json.load(open(HK_TITLES_PATH, encoding="utf-8"))

    conn = connect()
    cur = conn.cursor()

    # HK side: official Chinese titles, keyed by HK_NEW code.
    filled_zh = 0
    hk_name_by_en = {}  # name_en -> official zh, for the seed patch
    for code, zh in hk_titles.items():
        cur.execute(
            "SELECT c.id, c.name_en FROM curriculum_concepts c "
            "JOIN concept_code_aliases a ON a.concept_id = c.id "
            "WHERE a.code_space = 'HK_NEW' AND a.code = %s AND c.kind = 'chapter'",
            (code,),
        )
        rows = cur.fetchall()
        if len(rows) != 1:
            print(f"  SKIP HK {code}: {len(rows)} concepts matched")
            continue
        cid, name_en = rows[0]
        hk_name_by_en[name_en] = zh
        cur.execute(
            "UPDATE curriculum_concepts SET name_zh = %s WHERE id = %s AND name_zh IS NULL",
            (zh, cid),
        )
        filled_zh += cur.rowcount

    filled_en = 0
    for name_zh, name_en in MAS_EN.items():
        cur.execute(
            "UPDATE curriculum_concepts SET name_en = %s "
            "WHERE kind = 'chapter' AND name_zh = %s AND name_en IS NULL",
            (name_en, name_zh),
        )
        filled_en += cur.rowcount

    print(f"DB: filled name_zh on {filled_zh} HK concepts, name_en on {filled_en} MAS concepts")
    cur.execute(
        "SELECT COUNT(*) FROM curriculum_concepts "
        "WHERE kind = 'chapter' AND (name_en IS NULL OR name_zh IS NULL)"
    )
    print(f"DB: chapter concepts still missing a name: {cur.fetchone()[0]}")

    seed = json.load(open(SEED_PATH, encoding="utf-8"))
    patched = 0
    for entry in seed:
        if entry.get("kind") != "chapter":
            continue
        if entry.get("name_zh") is None and entry.get("name_en") in hk_name_by_en:
            entry["name_zh"] = hk_name_by_en[entry["name_en"]]
            patched += 1
        elif entry.get("name_en") is None and entry.get("name_zh") in MAS_EN:
            entry["name_en"] = MAS_EN[entry["name_zh"]]
            patched += 1
    print(f"seed: patched {patched} entries")

    if args.dry_run:
        conn.rollback()
        print("Dry run — rolled back, seed not written.")
        return
    conn.commit()
    conn.close()
    with open(SEED_PATH, "w", encoding="utf-8") as f:
        json.dump(seed, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("Done.")


if __name__ == "__main__":
    main()
