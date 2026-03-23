"""Seed summer_course_configs with 2025 data (verified against actual 2025 Google Form)."""
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

DEFAULT_TIME_SLOTS = ["10:00 - 11:30", "11:45 - 13:15", "14:30 - 16:00", "16:15 - 17:45", "18:00 - 19:30"]

CONFIG_2025 = {
    "year": 2025,
    "title": "2025年度暑期課程留位 Intended class time for 2025 Summer",
    "description": None,
    "application_open_date": "2025-03-01 00:00:00",
    "application_close_date": "2025-07-31 23:59:59",
    "course_start_date": "2025-07-05",
    "course_end_date": "2025-08-29",
    "total_lessons": 8,
    "pricing_config": json.dumps({
        "base_fee": 3200,
        "registration_fee": 100,
        "discounts": [
            {
                "code": "EB",
                "name_zh": "早鳥優惠",
                "name_en": "Early Bird",
                "amount": 200,
                "conditions": {"before_date": "2025-06-15"},
            },
            {
                "code": "EB3P",
                "name_zh": "早鳥三人同行",
                "name_en": "Early Bird Group of 3+",
                "amount": 500,
                "conditions": {"before_date": "2025-06-15", "min_group_size": 3},
            },
            {
                "code": "3P",
                "name_zh": "三人同行",
                "name_en": "Group of 3+",
                "amount": 300,
                "conditions": {"min_group_size": 3},
            },
        ],
    }),
    "locations": json.dumps([
        {
            "name": "華士古分校",
            "name_en": "Jardim de Vasco Center",
            "address": "澳門若翰亞美打街10號東輝閣地下B座",
            "address_en": "Rua de João de Almeida No 10, Tung Fai Kock, B R/C, Macau",
            "open_days": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
            "open_days_label": "一星期開七日",
            "open_days_label_en": "Open 7 days a week",
            "time_slots": {d: DEFAULT_TIME_SLOTS for d in ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]},
        },
        {
            "name": "二龍喉分校",
            "name_en": "Flora Garden Center",
            "address": "澳門士多紐拜斯大馬路47B號楹峯疊翠地下A座",
            "address_en": "Avenida de Sidonio Pais No. 47B, The Paramount, A R/C, Macau",
            "open_days": ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
            "open_days_label": "星期日一休息",
            "open_days_label_en": "Closed on Sun & Mon",
            "time_slots": {d: DEFAULT_TIME_SLOTS for d in ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]},
        },
    ]),
    "available_grades": json.dumps([
        {"name": "中一", "name_en": "Form 1", "value": "F1"},
        {"name": "中二", "name_en": "Form 2", "value": "F2"},
        {"name": "中三", "name_en": "Form 3", "value": "F3"},
    ]),
    "time_slots": json.dumps([
        "10:00 - 11:30",
        "11:45 - 13:15",
        "14:30 - 16:00",
        "16:15 - 17:45",
        "18:00 - 19:30",
    ]),
    "existing_student_options": json.dumps([
        {"name": "MathConcept數學思維", "name_en": "MathConcept Education"},
        {"name": "MathConcept中學教室", "name_en": "MathConcept Secondary Academy"},
        {"name": "以上皆非", "name_en": "None"},
    ]),
    "center_options": json.dumps([
        {"name": "高士德分校", "name_en": "Costa Center"},
        {"name": "水坑尾分校", "name_en": "Campo Center"},
        {"name": "東方明珠分校", "name_en": "Areia Preta Center"},
        {"name": "林茂塘分校", "name_en": "Lam Mau Tong Center"},
        {"name": "二龍喉分校", "name_en": "Flora Garden Center"},
        {"name": "氹仔美景I分校", "name_en": "Taipa Mei Keng Center I"},
        {"name": "氹仔美景II分校", "name_en": "Taipa Mei Keng Center II"},
        {"name": "MathConcept中學教室 (華士古分校)", "name_en": "MathConcept Secondary Academy (Jardim de Vasco Center)"},
        {"name": "MathConcept中學教室 (二龍喉分校)", "name_en": "MathConcept Secondary Academy (Flora Garden Center)"},
    ]),
    "is_active": True,
}


def main():
    print(f"Connecting to {DB_HOST}:{DB_PORT}/{DB_NAME} as {DB_USER}...")
    conn = pymysql.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER,
        password=DB_PASSWORD, database=DB_NAME,
        charset="utf8mb4", connect_timeout=10,
    )
    cursor = conn.cursor()

    # Delete existing 2025 config (re-seed with corrected data)
    cursor.execute("SELECT id FROM summer_course_configs WHERE year = 2025")
    existing = cursor.fetchone()
    if existing:
        print(f"  Deleting existing 2025 config (id={existing[0]})...")
        cursor.execute("DELETE FROM summer_course_configs WHERE year = 2025")
        conn.commit()

    cols = ", ".join(CONFIG_2025.keys())
    placeholders = ", ".join(["%s"] * len(CONFIG_2025))
    sql = f"INSERT INTO summer_course_configs ({cols}) VALUES ({placeholders})"
    cursor.execute(sql, list(CONFIG_2025.values()))
    conn.commit()
    print(f"  Seeded 2025 config (id={cursor.lastrowid}), is_active=True")

    cursor.close()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
