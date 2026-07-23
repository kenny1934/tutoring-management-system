"""Seed regular_course_configs with the September 2026 intake.

Branch open days and time slots follow last year's regular-course Google Form:
華士古 open 7 days, 二龍喉 closed Tue + Wed; weekday slots 16:45/18:25,
weekend slots 10:00-19:30 in five bands.
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

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
WEEKENDS = ["Saturday", "Sunday"]
WEEKDAY_SLOTS = ["16:45 - 18:15", "18:25 - 19:55"]
WEEKEND_SLOTS = ["10:00 - 11:30", "11:45 - 13:15", "14:30 - 16:00", "16:15 - 17:45", "18:00 - 19:30"]

MSA_OPEN_DAYS = WEEKDAYS + WEEKENDS
MSB_OPEN_DAYS = ["Monday", "Thursday", "Friday", "Saturday", "Sunday"]  # closed Tue + Wed


def _slots_for(days):
    return {d: (WEEKEND_SLOTS if d in WEEKENDS else WEEKDAY_SLOTS) for d in days}


CONFIG_2026 = {
    "year": 2026,
    "title": "2026年度9月常規課程留位 Intended Class Time for 2026 September Regular Course",
    "description": None,
    "application_open_date": "2026-08-03 00:00:00",
    "application_close_date": "2026-09-30 23:59:59",
    "course_start_date": "2026-09-01",
    "locations": json.dumps([
        {
            "name": "華士古分校",
            "name_en": "Jardim de Vasco Center",
            "address": "澳門若翰亞美打街10號東輝閣地下B座",
            "address_en": "Rua de João de Almeida No 10, Tung Fai Kock, B R/C, Macau",
            "open_days": MSA_OPEN_DAYS,
            "open_days_label": "一星期開七日",
            "open_days_label_en": "Open 7 days a week",
            "time_slots": _slots_for(MSA_OPEN_DAYS),
        },
        {
            "name": "二龍喉分校",
            "name_en": "Flora Garden Center",
            "address": "澳門士多紐拜斯大馬路47B號楹峯疊翠地下A座",
            "address_en": "Avenida de Sidonio Pais No. 47B, The Paramount, A R/C, Macau",
            "open_days": MSB_OPEN_DAYS,
            "open_days_label": "星期二、三休息",
            "open_days_label_en": "Closed on Tue & Wed",
            "time_slots": _slots_for(MSB_OPEN_DAYS),
        },
    ]),
    "available_grades": json.dumps([
        {"name": "中一", "name_en": "Form 1", "value": "F1"},
        {"name": "中二", "name_en": "Form 2", "value": "F2"},
        {"name": "中三", "name_en": "Form 3", "value": "F3"},
        {"name": "中四", "name_en": "Form 4", "value": "F4", "admin_only": True},
    ]),
    "time_slots": json.dumps(WEEKDAY_SLOTS + WEEKEND_SLOTS),
    "existing_student_options": json.dumps([
        {"name": "MathConcept數學思維", "name_en": "MathConcept Education"},
        {"name": "MathConcept中學教室", "name_en": "MathConcept Secondary Academy"},
        {"name": "以上皆非", "name_en": "None"},
    ]),
    "lang_stream_options": json.dumps([
        {"name": "中文部", "name_en": "Chinese-medium", "value": "CMI"},
        {"name": "英文部", "name_en": "English-medium", "value": "EMI"},
        {"name": "國際學校", "name_en": "International School", "value": "IS"},
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
    "text_content": json.dumps({
        "title_zh": "2026年度9月常規課程留位",
        "title_en": "September 2026 Regular Course Application",
        "intro_zh": "此表單用於收集學生的理想上課時間。正式開班時間將根據多數學生的選擇而定。",
        "intro_en": "This form collects students' preferred class times. The final timetable will be arranged based on the choices of the majority of students.",
        "target_grades_zh": "中一至中三",
        "target_grades_en": "F1 to F3",
        "schedule_format_zh": "每星期一堂 · 90分鐘",
        "schedule_format_en": "Weekly · 90 min",
        "start_note_zh": "9月1日當週開課",
        "start_note_en": "Classes begin the week of 1 September",
        "existing_student_question_zh": "學生是否現正就讀於MathConcept旗下教育中心？",
        "existing_student_question_en": "Are you currently a MathConcept student?",
        "disclaimer_zh": "此表單僅用於收集學生的理想上課時間。正式開班時間將根據多數學生的選擇而定。如我們未能配合您所選擇之時段，敬希見諒。",
        "disclaimer_en": "This form is intended solely for collecting students' preferred time slots. Class schedules will be arranged based on the time slots chosen by the majority of students. We apologise for any inconvenience if your preferred time slot is not available.",
        "contact_by_date": "2026-08-17",
        "success_message_zh": "我們會在微信給您發放上課的訊息。",
        "success_message_en": "We will send you the class information via WeChat.",
        "makeup_note_zh": "📅 為能令課堂安排更完整，如學生於學費期內有事宜不能出席課堂，請提早通知導師，讓導師為您提早安排補堂。",
        "makeup_note_en": "📅 To keep class arrangements complete, if the student cannot attend a lesson within the paid period, please notify the tutor in advance so a make-up lesson can be arranged early.",
    }),
    "pricing_config": json.dumps({
        "base_fee": 2400,
        "lessons_per_block": 6,
        "registration_fee": 100,
    }),
    "course_intro": None,
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

    cursor.execute("SELECT id FROM regular_course_configs WHERE year = 2026")
    existing = cursor.fetchone()
    if existing:
        print(f"  Deleting existing 2026 config (id={existing[0]})...")
        cursor.execute("DELETE FROM regular_course_configs WHERE year = 2026")
        conn.commit()

    cols = ", ".join(CONFIG_2026.keys())
    placeholders = ", ".join(["%s"] * len(CONFIG_2026))
    sql = f"INSERT INTO regular_course_configs ({cols}) VALUES ({placeholders})"
    cursor.execute(sql, list(CONFIG_2026.values()))
    conn.commit()
    print(f"  Seeded 2026 config (id={cursor.lastrowid}), is_active=True")

    cursor.close()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
