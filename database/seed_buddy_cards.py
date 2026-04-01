"""Seed buddy_access_cards with RFID card → branch mappings."""
import os
import pymysql
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "webapp", "backend", ".env"))

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

# Card number → branch mapping
# Add cards here, one per line: (card_number, branch, staff_name)
CARDS = [
    ("0001348283", "ALL", "Kenny Chiu"),
]


def main():
    if not CARDS:
        print("No cards to seed. Edit CARDS list in this file first.")
        return

    conn = pymysql.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER,
        password=DB_PASSWORD, database=DB_NAME,
    )
    cursor = conn.cursor()

    for card_number, branch, staff_name in CARDS:
        cursor.execute(
            "INSERT INTO buddy_access_cards (card_number, branch, staff_name) "
            "VALUES (%s, %s, %s) "
            "ON DUPLICATE KEY UPDATE branch = VALUES(branch), staff_name = VALUES(staff_name)",
            (card_number, branch, staff_name),
        )
        print(f"  {card_number} → {branch} ({staff_name})")

    conn.commit()
    cursor.close()
    conn.close()
    print(f"Done — {len(CARDS)} card(s) seeded.")


if __name__ == "__main__":
    main()
