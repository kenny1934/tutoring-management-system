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
    "intro_zh": "\u2728感謝家長和學生對 MathConcept 「中學教室」的支持！\u2728\n\n現誠邀有意就讀中學暑期課程的學生家長填寫貴子女最理想的上課時間，以便導師處理留位手續。",
    "intro_en": "\u2728 Thank you to all parents and students for your continuous support for MathConcept Secondary Academy! \u2728\n\nTo confirm our summer class schedule, we invite you to share your preferred time slot for our upcoming summer course - the Secondary Preparatory Course. This will help us make the necessary arrangement for reserving your seat.",
    "disclaimer_zh": "\U0001f4e3\U0001f4e3此表單僅用於收集學生的理想上課時間，正式開班時間將根據多數學生的選擇而定，如我們未能配合您所選擇之時段，敬希見諒！（暑期班之上課時間將於5月21日或之前確定。）",
    "disclaimer_en": "\U0001f4e3\U0001f4e3 This form is intended solely for collecting students\u2019 preferences for summer course time slots. Class schedules will be arranged based on the time slots chosen by the majority of students. We apologise for any inconvenience if your preferred time slot is not available. (The schedule for summer course will be confirmed on or before May 21.)",
    "success_message_zh": "再次感謝家長和學生對MathConcept「中學教室」的支持！\U0001f970",
    "success_message_en": "Thank you again for your support to MathConcept Secondary Academy! \U0001f970",
}

BANNER_IMAGE_URL = "/summer/summer-banner.jpg"

LOCATION_IMAGES = {
    "Jardim de Vasco Center": "/summer/vasco-center.jpg",
    "Flora Garden Center": "/summer/flora-center.jpg",
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
        img = LOCATION_IMAGES.get(loc.get("name_en"))
        if img:
            loc["image_url"] = img
            print(f"  Set image_url for {loc['name_en']}: {img}")

    cursor.execute(
        "UPDATE summer_course_configs SET text_content = %s, banner_image_url = %s, locations = %s WHERE id = %s",
        (json.dumps(TEXT_CONTENT, ensure_ascii=False), BANNER_IMAGE_URL, json.dumps(locations, ensure_ascii=False), config_id),
    )
    conn.commit()
    print(f"  Updated text_content ({len(TEXT_CONTENT)} keys), banner_image_url, and location images.")

    cursor.close()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
