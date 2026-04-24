"""Patch the 2026 SummerCourseConfig.pricing_config with receipt_codes
and academic-year window for the receipt-code suggestion feature.

Idempotent: re-running just overwrites the same keys.
"""
import os
import json
import pymysql
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "webapp", "backend", ".env"))

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

RECEIPT_CODES = {
    "partial": "26SUMMERS",
    "new": "26SSNEW",
    "f1_primary_prospect": "26SummerMC",
    "returning_secondary": "26SummerRT",
    "returning_primary_no_prospect": "26SummerRT",
}
ACADEMIC_YEAR_START = "2025-09-01"
ACADEMIC_YEAR_END = "2026-09-01"  # exclusive upper bound


def main():
    conn = pymysql.connect(
        host=DB_HOST, port=DB_PORT,
        user=DB_USER, password=DB_PASSWORD, database=DB_NAME,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, pricing_config FROM summer_course_configs WHERE year = %s",
                (2026,),
            )
            row = cur.fetchone()
            if not row:
                raise SystemExit("No summer_course_configs row for year=2026")
            config_id, pricing_json = row
            pricing = json.loads(pricing_json) if isinstance(pricing_json, str) else (pricing_json or {})

            pricing["receipt_codes"] = RECEIPT_CODES
            pricing["academic_year_start"] = ACADEMIC_YEAR_START
            pricing["academic_year_end"] = ACADEMIC_YEAR_END

            cur.execute(
                "UPDATE summer_course_configs SET pricing_config = %s WHERE id = %s",
                (json.dumps(pricing), config_id),
            )
            conn.commit()
            print(f"Patched config id={config_id}:")
            print(json.dumps(pricing, indent=2, ensure_ascii=False))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
