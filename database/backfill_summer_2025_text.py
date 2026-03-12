"""Backfill text_content, banner_image_url, and location image_urls for the 2025 summer config."""
import os
import json
import pymysql
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "webapp", "backend", ".env"))

if not os.getenv("DB_USER"):
    load_dotenv("/home/kenny/projects/tutoring-management-system/webapp/backend/.env")

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

TEXT_CONTENT = {
    # Step 1: Student Info
    "title_zh": "2025年度暑期課程留位",
    "title_en": "2025 Summer Course Seat Reservation",
    "intro_zh": "感謝家長和學生對 MathConcept 「中學教室」的支持！\n\n現誠邀有意就讀中學暑期課程的學生家長填寫貴子女最理想的上課時間，以便導師處理留位手續。",
    "intro_en": "Thank you for your continued support of MathConcept Secondary Academy!\n\nPlease share your preferred class time for our upcoming summer course so we can arrange your schedule.",
    "target_grades_zh": "升F1 至 升F3（中／英文部／國際學校）",
    "target_grades_en": "Pre-F1 to Pre-F3 (Chinese-medium / English-medium / International)",
    "schedule_format_zh": "共8堂 · 每週1堂 · 90分鐘/堂",
    "schedule_format_en": "8 lessons · 1 class/week · 90 min each",
    # Step 2: Background
    "existing_student_question_zh": "學生是否現正就讀於MathConcept旗下教育中心？（包括MathConcept數學思維 和 MathConcept中學教室）",
    "existing_student_question_en": "Are you currently a MathConcept student? (including MathConcept Education and MathConcept Secondary Academy)",
    "center_selection_prompt_zh": "如為現讀學生，請選擇現時所就讀的分校：",
    "center_selection_prompt_en": "If you are a current student, please select the center you are attending:",
    # Step 3: Schedule
    "preference_1_label_zh": "請家長選擇 第一理想 上課日子和時間。",
    "preference_1_label_en": "Please select your 1st preferred day and time.",
    "preference_2_label_zh": "請家長選擇 第二理想 上課日子和時間。",
    "preference_2_label_en": "Please select your 2nd preferred day and time.",
    "unavailability_prompt_zh": "為能令課堂安排更完整，如學生於暑假已有外出計劃或其他事宜不能出席課堂，請填上日子(如：7月14至21日)，讓導師們為您提早安排補堂。",
    "unavailability_prompt_en": "If your child will be unavailable on certain dates during summer (e.g. July 14\u201321), please let us know so we can arrange make-up classes in advance.",
    # Step 4: Contact
    "wechat_prompt_zh": "我們會在微信給您發放上課的信息，請提供微信號。",
    "wechat_prompt_en": "We will send you the class information via WeChat. Please provide your WeChat ID.",
    "phone_prompt_zh": "請留下聯絡電話，以便我們和您聯絡！",
    "phone_prompt_en": "Please provide a contact phone number.",
    "buddy_title_zh": "同行優惠",
    "buddy_title_en": "Buddy Group Discount",
    "buddy_description_zh": "三人或以上同行報名可享團報優惠。您可以輸入同行碼加入已有的小組，或建立新的同行碼分享給朋友。",
    "buddy_description_en": "Groups of 3 or more get a group discount. Enter a buddy code to join an existing group, or create a new code to share with friends.",
    # Step 5: Review
    "disclaimer_zh": "此表單僅用於收集學生的理想上課時間，正式開班時間將根據多數學生的選擇而定，如我們未能配合您所選擇之時段，敬希見諒！（暑期班之上課時間將於5月21日或之前確定。）",
    "disclaimer_en": "This form collects your preferred class times only \u2014 final schedules will be arranged based on overall demand and may differ from your selection. We appreciate your understanding. (The summer course schedule will be confirmed by 21 May.)",
    "success_message_zh": "再次感謝家長和學生對MathConcept「中學教室」的支持！",
    "success_message_en": "Thank you again for your support of MathConcept Secondary Academy!",
}

BANNER_IMAGE_URL = "/summer/summer-banner.jpg"

LOCATION_IMAGES = {
    "Jardim de Vasco Center": "/summer/vasco-center.jpg",
    "Flora Garden Center": "/summer/flora-center.jpg",
}

# Corrected open_days order (Sunday first) and per-location per-day time slots
DEFAULT_TIME_SLOTS = ["10:00 - 11:30", "11:45 - 13:15", "14:30 - 16:00", "16:15 - 17:45", "18:00 - 19:30"]

LOCATION_OPEN_DAYS = {
    "Jardim de Vasco Center": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    "Flora Garden Center": ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
}


def main():
    print(f"Connecting to {DB_HOST}:{DB_PORT}/{DB_NAME} as {DB_USER}...")
    conn = pymysql.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER,
        password=DB_PASSWORD, database=DB_NAME,
        charset="utf8mb4", connect_timeout=10,
    )
    cursor = conn.cursor()

    # Get existing 2025 config
    cursor.execute("SELECT id, locations FROM summer_course_configs WHERE year = 2025")
    row = cursor.fetchone()
    if not row:
        print("No 2025 config found.")
        cursor.close()
        conn.close()
        return

    config_id, locations_json = row
    print(f"  Found 2025 config (id={config_id})")

    # Update locations with image_url
    locations = json.loads(locations_json) if isinstance(locations_json, str) else locations_json
    for loc in locations:
        name_en = loc.get("name_en", "")
        img = LOCATION_IMAGES.get(name_en)
        if img:
            loc["image_url"] = img
            print(f"  Set image_url for {name_en}: {img}")
        # Fix open_days order and add per-day time_slots
        if name_en in LOCATION_OPEN_DAYS:
            loc["open_days"] = LOCATION_OPEN_DAYS[name_en]
            loc["time_slots"] = {day: DEFAULT_TIME_SLOTS for day in loc["open_days"]}
            print(f"  Updated open_days and time_slots for {name_en}")

    clean_title = "2025年度暑期課程留位 Intended class time for 2025 Summer"
    cursor.execute(
        "UPDATE summer_course_configs SET title = %s, text_content = %s, banner_image_url = %s, locations = %s WHERE id = %s",
        (clean_title, json.dumps(TEXT_CONTENT, ensure_ascii=False), BANNER_IMAGE_URL, json.dumps(locations, ensure_ascii=False), config_id),
    )
    conn.commit()
    print(f"  Updated title, text_content ({len(TEXT_CONTENT)} keys), banner_image_url, and location images.")

    cursor.close()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
