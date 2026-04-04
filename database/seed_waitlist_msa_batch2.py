"""Seed waitlist entries from MSA tutor's list (batch 2).

For entries with a 4-digit school_student_id, look up the student in the DB
to get full info and determine entry_type (Slot Change if active enrollment exists).
"""
import os
import pymysql
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "webapp", "backend", ".env"))

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

CREATED_BY = 2  # tutor_id for the MSA tutor
LOCATION = "MSA"


def get_connection():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


def lookup_student(cur, school_student_id: str):
    """Look up student by school_student_id, return dict or None."""
    cur.execute(
        "SELECT id, student_name, school, grade, lang_stream, phone "
        "FROM students WHERE school_student_id = %s",
        (school_student_id,),
    )
    return cur.fetchone()


def has_active_enrollment(cur, student_id: int) -> bool:
    """Check if student has a non-cancelled enrollment."""
    cur.execute(
        "SELECT 1 FROM enrollments WHERE student_id = %s AND payment_status != 'Cancelled' LIMIT 1",
        (student_id,),
    )
    return cur.fetchone() is not None


def insert_entry(cur, data: dict, slot_prefs: list):
    """Insert a waitlist entry and its slot preferences."""
    cur.execute(
        """INSERT INTO waitlist_entries
        (student_name, school, grade, lang_stream, phone, parent_name, notes,
         entry_type, student_id, created_by)
        VALUES (%(student_name)s, %(school)s, %(grade)s, %(lang_stream)s,
                %(phone)s, %(parent_name)s, %(notes)s,
                %(entry_type)s, %(student_id)s, %(created_by)s)""",
        data,
    )
    entry_id = cur.lastrowid
    for sp in slot_prefs:
        cur.execute(
            """INSERT INTO waitlist_slot_preferences
            (waitlist_entry_id, location, day_of_week, time_slot)
            VALUES (%s, %s, %s, %s)""",
            (entry_id, sp.get("location", LOCATION), sp.get("day"), sp.get("time")),
        )
    return entry_id


def make_entry(
    student_name="",
    school="",
    grade="",
    lang_stream=None,
    phone="",
    parent_name=None,
    notes=None,
    entry_type="New",
    student_id=None,
):
    return {
        "student_name": student_name,
        "school": school,
        "grade": grade,
        "lang_stream": lang_stream,
        "phone": phone,
        "parent_name": parent_name,
        "notes": notes,
        "entry_type": entry_type,
        "student_id": student_id,
        "created_by": CREATED_BY,
    }


def seed(cur):
    created = 0

    # --- Helper: resolve student by school_student_id ---
    def resolve(ssid: str):
        """Look up student, return (entry_defaults, student_id)."""
        s = lookup_student(cur, ssid)
        if not s:
            print(f"  WARNING: school_student_id={ssid} not found in DB")
            return None, None
        etype = "Slot Change" if has_active_enrollment(cur, s["id"]) else "New"
        return {
            "student_name": s["student_name"],
            "school": s["school"] or "",
            "grade": s["grade"] or "",
            "lang_stream": s["lang_stream"],
            "phone": s["phone"] or "",
            "student_id": s["id"],
            "entry_type": etype,
        }, s["id"]

    entries = []

    # 1. 1536 Sun 11:45-13:15
    info, _ = resolve("1536")
    if info:
        entries.append((make_entry(**info), [{"day": "Sunday", "time": "11:45", "location": LOCATION}]))

    # 2. 1673 Sun 11:45-13:15
    info, _ = resolve("1673")
    if info:
        entries.append((make_entry(**info), [{"day": "Sunday", "time": "11:45", "location": LOCATION}]))

    # 3. 1561 Mon all time
    info, _ = resolve("1561")
    if info:
        entries.append((make_entry(**info, notes="Any time on Monday"), [{"day": "Monday", "time": None, "location": LOCATION}]))

    # 4. 1896 Kingsley Wong 想要星期六日
    info, _ = resolve("1896")
    if info:
        entries.append((make_entry(**info, notes="Wants Saturday or Sunday"),
                        [{"day": "Saturday", "time": None, "location": LOCATION},
                         {"day": "Sunday", "time": None, "location": LOCATION}]))

    # 5. 1291 Sun 18:00-19:30
    info, _ = resolve("1291")
    if info:
        entries.append((make_entry(**info), [{"day": "Sunday", "time": "18:00", "location": LOCATION}]))

    # 6. 1899 Sat 11:45-13:15
    info, _ = resolve("1899")
    if info:
        entries.append((make_entry(**info), [{"day": "Saturday", "time": "11:45", "location": LOCATION}]))

    # 7. 1897 Sat afternoon
    info, _ = resolve("1897")
    if info:
        entries.append((make_entry(**info, notes="Wants Saturday afternoon"),
                        [{"day": "Saturday", "time": None, "location": LOCATION}]))

    # 8. 62370528 PTMS F1 — new student, phone number
    entries.append((
        make_entry(student_name="", school="PTMS", grade="F1", phone="62370528",
                   notes="New enquiry, name unknown"),
        [],
    ))

    # 9. 1580 Astar Lai — wants Sat/Sun quiet time, NOT Mon/Thu
    info, _ = resolve("1580")
    if info:
        entries.append((make_entry(**info, notes="Wants quiet time on Sat/Sun. NOT Mon or Thu"),
                        [{"day": "Saturday", "time": None, "location": LOCATION},
                         {"day": "Sunday", "time": None, "location": LOCATION}]))

    # 10. 1960 Jayden Wong — wants Wed at Eric Sir's time
    info, _ = resolve("1960")
    if info:
        entries.append((make_entry(**info, notes="Wants Wednesday at Eric Sir's time"),
                        [{"day": "Wednesday", "time": None, "location": LOCATION}]))

    # 11. 開心果 FRI 18:25-19:55 JAMES SIR — parent wechat=開心果, wants only Mr James Lo's slots
    entries.append((
        make_entry(student_name="", school="", grade="", parent_name="開心果",
                   notes="Wants only Mr James Lo's slots. Fri 18:25-19:55"),
        [{"day": "Friday", "time": "18:25", "location": LOCATION}],
    ))

    # 12. SHCC-E F2 Katrina Lam — wants Sat/Sun
    entries.append((
        make_entry(student_name="Katrina Lam", school="SHCC", grade="F2", lang_stream="E",
                   notes="Wants Saturday or Sunday"),
        [{"day": "Saturday", "time": None, "location": LOCATION},
         {"day": "Sunday", "time": None, "location": LOCATION}],
    ))

    # 13. 1809 Christy — wants Sun
    info, _ = resolve("1809")
    if info:
        entries.append((make_entry(**info, notes="Wants Sunday"),
                        [{"day": "Sunday", "time": None, "location": LOCATION}]))

    # 14. Donald F1 CDSJ5-E — wants Sat 11:45 or 14:30
    entries.append((
        make_entry(student_name="Donald", school="CDSJ5", grade="F1", lang_stream="E",
                   notes="Wants Saturday 11:45 or 14:30"),
        [{"day": "Saturday", "time": "11:45", "location": LOCATION},
         {"day": "Saturday", "time": "14:30", "location": LOCATION}],
    ))

    # 15. Julio F2 葡文學校 — wants Sat or Wed 16:45
    entries.append((
        make_entry(student_name="Julio", school="葡文學校", grade="F2",
                   notes="Wants Saturday or Wednesday 16:45-18:15"),
        [{"day": "Saturday", "time": "16:45", "location": LOCATION},
         {"day": "Wednesday", "time": "16:45", "location": LOCATION}],
    ))

    # 16. 1296 Jason 高一 — wants F4 class, no time specified
    info, _ = resolve("1296")
    if info:
        entries.append((make_entry(**info, notes="高一 — wants F4 class, no time preference specified"), []))

    # 17. Tyler — TIS F3, Stella's friend, VIP, Fri/Sat/Sun anytime
    entries.append((
        make_entry(student_name="Tyler", school="TIS", grade="F3", phone="66211111",
                   notes="VIP — Stella's friend"),
        [{"day": "Friday", "time": None, "location": LOCATION},
         {"day": "Saturday", "time": None, "location": LOCATION},
         {"day": "Sunday", "time": None, "location": LOCATION}],
    ))

    # 18. Katniss — PCMS-CO F1, Stella's friend, VIP, Fri/Sat/Sun anytime
    entries.append((
        make_entry(student_name="Katniss", school="PCMS-CO", grade="F1", phone="66211111",
                   notes="VIP — Stella's friend"),
        [{"day": "Friday", "time": None, "location": LOCATION},
         {"day": "Saturday", "time": None, "location": LOCATION},
         {"day": "Sunday", "time": None, "location": LOCATION}],
    ))

    # 19. SHCC-E F4 1670 Carina Kwok — wants to enrol with another friend
    info, _ = resolve("1670")
    if info:
        entries.append((make_entry(**info, notes="Wants to enrol with another friend (2位)"), []))
    else:
        entries.append((
            make_entry(student_name="Carina Kwok", school="SHCC", grade="F4", lang_stream="E",
                       notes="school_student_id=1670. Wants to enrol with another friend (2位)"),
            [],
        ))

    # 20. MCP1128 教業 F2 — wants Sunday
    entries.append((
        make_entry(student_name="", school="教業", grade="F2",
                   notes="Primary branch student ID: MCP1128. Name unknown. Wants Sunday"),
        [{"day": "Sunday", "time": None, "location": LOCATION}],
    ))

    # 21. HKMS F3 Lei Hoi I — phone 66636322, wants Sun 18:00
    entries.append((
        make_entry(student_name="Lei Hoi I", school="HKMS", grade="F3", phone="66636322",
                   notes="Wants Sunday 18:00-19:30"),
        [{"day": "Sunday", "time": "18:00", "location": LOCATION}],
    ))

    # 22. PCMS-CO F1 — phone 66925233, wants Mon or Sat 11:45 or Sun after 4pm
    entries.append((
        make_entry(student_name="", school="PCMS-CO", grade="F1", phone="66925233",
                   notes="Wants Mon or Sat 11:45-13:15, or Sun after 4pm"),
        [{"day": "Monday", "time": "11:45", "location": LOCATION},
         {"day": "Saturday", "time": "11:45", "location": LOCATION},
         {"day": "Sunday", "time": "16:45", "location": LOCATION}],
    ))

    # 23. Carrie F3 CDSJ2-E — wants any time
    entries.append((
        make_entry(student_name="Carrie", school="CDSJ2", grade="F3", lang_stream="E",
                   notes="Any time"),
        [],
    ))

    # --- Insert all ---
    for data, prefs in entries:
        eid = insert_entry(cur, data, prefs)
        etype = data["entry_type"]
        name = data["student_name"] or "(unnamed)"
        print(f"  Created #{eid}: {name} [{etype}] — {len(prefs)} slot pref(s)")
        created += 1

    return created


def main():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            print("Seeding MSA waitlist batch 2...")
            count = seed(cur)
            conn.commit()
            print(f"\nDone — {count} entries created.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
