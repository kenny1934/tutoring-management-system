#!/usr/bin/env python3
"""Quick debug script to check why a specific student isn't being counted."""

import os
import sys
import requests
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Load environment
project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
sys.path.insert(0, os.path.join(project_root, 'scripts', 'quarterly-report'))

def load_env_file(path):
    if not os.path.exists(path):
        return
    with open(path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                value = value.strip().strip('"').strip("'")
                os.environ.setdefault(key.strip(), value)

env_path = os.path.join(project_root, 'webapp', 'backend', '.env')
load_env_file(env_path)

# Database setup
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv("DB_HOST", "34.92.182.103")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)

API_BASE_URL = "http://localhost:8000/api"

# Load holidays from database
HOLIDAYS = set()
db = SessionLocal()
try:
    result = db.execute(text("SELECT holiday_date FROM holidays"))
    HOLIDAYS = {row[0] for row in result.fetchall()}
    print(f"Loaded {len(HOLIDAYS)} holidays from database")
finally:
    db.close()


def parse_date(date_str):
    if not date_str:
        return None
    if isinstance(date_str, datetime):
        return date_str.date()
    if hasattr(date_str, 'date'):
        return date_str
    try:
        return datetime.strptime(str(date_str), "%Y-%m-%d").date()
    except:
        return None


def calculate_effective_end_date_python(first_lesson_date, lessons_paid, extension_weeks):
    """Python's calculation."""
    first_lesson = parse_date(first_lesson_date)
    if not first_lesson:
        return None
    total_lesson_dates = (lessons_paid or 0) + (extension_weeks or 0)

    current_date = first_lesson
    lessons_counted = 0
    end_date = first_lesson

    while lessons_counted < total_lesson_dates:
        if current_date not in HOLIDAYS:
            lessons_counted += 1
            end_date = current_date
        current_date = current_date + timedelta(weeks=1)

    return end_date


def main():
    student_id = 2213
    closing_end = datetime(2025, 12, 31).date()

    print(f"\n{'='*60}")
    print(f"Debugging student_id={student_id}")
    print(f"{'='*60}")

    # 1. Check what the API returns for this student's enrollments
    print("\n1. Fetching enrollments from API...")
    response = requests.get(f"{API_BASE_URL}/enrollments", params={"student_id": student_id, "limit": 500})
    if response.status_code != 200:
        print(f"   API error: {response.status_code}")
        return

    enrollments = response.json()
    print(f"   Found {len(enrollments)} enrollments from API")

    for e in enrollments:
        print(f"\n   Enrollment id={e.get('id')}:")
        print(f"     payment_status: {e.get('payment_status')}")
        print(f"     enrollment_type: {e.get('enrollment_type')}")
        print(f"     location: {e.get('location')}")
        print(f"     tutor_id: {e.get('tutor_id')}")
        print(f"     tutor_name: {e.get('tutor_name')}")
        print(f"     first_lesson_date: {e.get('first_lesson_date')}")
        print(f"     lessons_paid: {e.get('lessons_paid')}")
        print(f"     deadline_extension_weeks: {e.get('deadline_extension_weeks')}")

        # Calculate effective end date
        python_end = calculate_effective_end_date_python(
            e.get('first_lesson_date'),
            e.get('lessons_paid'),
            e.get('deadline_extension_weeks')
        )
        print(f"     Python effective_end: {python_end}")
        print(f"     closing_end: {closing_end}")
        if python_end:
            print(f"     python_end > closing_end: {python_end > closing_end}")

    # 2. Check what MySQL calculates directly
    print("\n2. Checking MySQL calculation directly...")
    db = SessionLocal()
    try:
        query = text("""
            SELECT
                e.id,
                e.student_id,
                e.tutor_id,
                e.payment_status,
                e.enrollment_type,
                e.location,
                e.first_lesson_date,
                e.lessons_paid,
                e.deadline_extension_weeks,
                calculate_effective_end_date(
                    e.first_lesson_date,
                    e.lessons_paid,
                    COALESCE(e.deadline_extension_weeks, 0)
                ) as mysql_effective_end
            FROM enrollments e
            WHERE e.student_id = :student_id
        """)
        result = db.execute(query, {"student_id": student_id})
        rows = result.fetchall()

        for row in rows:
            print(f"\n   Enrollment id={row.id}:")
            print(f"     payment_status: {row.payment_status}")
            print(f"     enrollment_type: {row.enrollment_type}")
            print(f"     location: {row.location}")
            print(f"     tutor_id: {row.tutor_id}")
            print(f"     first_lesson_date: {row.first_lesson_date}")
            print(f"     lessons_paid: {row.lessons_paid}")
            print(f"     deadline_extension_weeks: {row.deadline_extension_weeks}")
            print(f"     MySQL effective_end: {row.mysql_effective_end}")
            print(f"     closing_end: {closing_end}")
            if row.mysql_effective_end:
                print(f"     mysql_end > closing_end: {row.mysql_effective_end > closing_end}")
    finally:
        db.close()

    # 3. Check if enrollment appears in fetch_all_enrollments style query
    print("\n3. Checking if enrollment appears in paginated fetch...")
    all_enrollments = []
    offset = 0
    limit = 500
    found_2213 = False

    while True:
        response = requests.get(f"{API_BASE_URL}/enrollments", params={"limit": limit, "offset": offset})
        if response.status_code != 200:
            print(f"   API error at offset {offset}")
            break
        batch = response.json()
        if not batch:
            break

        for e in batch:
            if e.get("student_id") == student_id:
                found_2213 = True
                print(f"   FOUND student {student_id} at offset {offset}:")
                print(f"     enrollment_id: {e.get('id')}")
                print(f"     location: {e.get('location')}")
                print(f"     tutor_id: {e.get('tutor_id')}")

        all_enrollments.extend(batch)
        if len(batch) < limit:
            break
        offset += limit

    print(f"   Total enrollments fetched: {len(all_enrollments)}")
    print(f"   Student {student_id} found in paginated fetch: {found_2213}")

    # 4. Filter by location and check
    location = "MSA"
    location_enrollments = [e for e in all_enrollments if e.get("location") == location]
    print(f"\n4. Filtering by location '{location}'...")
    print(f"   Enrollments at {location}: {len(location_enrollments)}")

    student_at_location = [e for e in location_enrollments if e.get("student_id") == student_id]
    print(f"   Student {student_id} enrollments at {location}: {len(student_at_location)}")
    for e in student_at_location:
        print(f"     id={e.get('id')}, tutor_id={e.get('tutor_id')}, payment={e.get('payment_status')}, type={e.get('enrollment_type')}")

    # 5. Check enrollment 2106411 directly in database
    print("\n5. Checking enrollment 2106411 directly in database...")
    db = SessionLocal()
    try:
        query = text("""
            SELECT e.id, e.student_id, e.tutor_id, e.first_lesson_date,
                   s.id as s_id, t.id as t_id
            FROM enrollments e
            LEFT JOIN students s ON e.student_id = s.id
            LEFT JOIN tutors t ON e.tutor_id = t.id
            WHERE e.id = 2106411
        """)
        result = db.execute(query)
        row = result.fetchone()
        if row:
            print(f"   Enrollment exists in DB:")
            print(f"     student_id: {row.student_id}, student exists: {row.s_id is not None}")
            print(f"     tutor_id: {row.tutor_id}, tutor exists: {row.t_id is not None}")
            print(f"     first_lesson_date: {row.first_lesson_date}")
        else:
            print("   Enrollment 2106411 NOT FOUND in database!")

        # Count total enrollments in DB vs API
        count_query = text("SELECT COUNT(*) FROM enrollments WHERE student_id IS NOT NULL AND tutor_id IS NOT NULL")
        total_db = db.execute(count_query).scalar()
        print(f"\n   Total enrollments in DB (with non-null FKs): {total_db}")
        print(f"   Total enrollments from API: {len(all_enrollments)}")
        print(f"   Difference: {total_db - len(all_enrollments)}")

    finally:
        db.close()

    print(f"\n{'='*60}")
    print("Done!")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
