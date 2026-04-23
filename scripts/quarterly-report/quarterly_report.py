#!/usr/bin/env python3
"""
All-in-One Quarterly Termination Report

Generates per-location reports containing:
1. Terminated students list (ID#, Student, Grade, Instructor, Schedule, LastLesson)
2. Tutor enrollment statistics (Opening, Enrollment/Transfer, Termination, Closing, Net)

Usage:
  python3 quarterly_report.py [--year 2025] [--quarter Q4]
  python3 quarterly_report.py --year 2025 --quarter Q4 --export-sheets
"""

import argparse
import csv
import os
import sys
import requests
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Google Sheets imports (optional - only needed for --export-sheets)
try:
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    SHEETS_AVAILABLE = True
except ImportError:
    SHEETS_AVAILABLE = False


def load_env_file(path):
    """Load environment variables from a .env file."""
    if not os.path.exists(path):
        return
    with open(path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                # Remove quotes if present
                value = value.strip().strip('"').strip("'")
                os.environ.setdefault(key.strip(), value)


# Load environment from webapp/backend/.env
# Script is in scripts/quarterly-report/, so go up 2 levels to project root
project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
env_path = os.path.join(project_root, 'webapp', 'backend', '.env')
load_env_file(env_path)

# Database configuration
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)

API_BASE_URL = "http://localhost:8000/api"

# Custom Quarter definitions (start_month, start_day, end_month, end_day)
# Q4 crosses the year boundary: Oct 22 - Jan 21 of next year
QUARTERS = {
    "Q1": (1, 22, 4, 21),   # Jan 22 - Apr 21
    "Q2": (4, 22, 7, 21),   # Apr 22 - Jul 21
    "Q3": (7, 22, 10, 21),  # Jul 22 - Oct 21
    "Q4": (10, 22, 1, 21),  # Oct 22 - Jan 21 (next year)
}

OPENING_PERIOD_DAYS = 7  # Jan 22-28, Apr 22-28, Jul 22-28, Oct 22-28


def get_quarter_dates(year, quarter):
    """
    Get key dates for a quarter.

    Args:
        year: The reporting year for the quarter
        quarter: Quarter string ("Q1", "Q2", "Q3", "Q4")

    Returns:
        tuple: (opening_start, opening_end, closing_end) as date objects

    Note: For Q4, the year parameter is the start year.
          Q4 2025 runs from Oct 22, 2025 to Jan 21, 2026.
    """
    start_month, start_day, end_month, end_day = QUARTERS[quarter]

    # Opening period start and end
    opening_start = datetime(year, start_month, start_day).date()
    opening_end = datetime(year, start_month, start_day + OPENING_PERIOD_DAYS - 1).date()

    # Closing end date
    if quarter == "Q4":
        # Q4 ends in January of the NEXT year
        closing_end = datetime(year + 1, end_month, end_day).date()
    else:
        closing_end = datetime(year, end_month, end_day).date()

    return opening_start, opening_end, closing_end


def get_quarter_number(quarter):
    """Convert Q1/Q2/Q3/Q4 to 1/2/3/4."""
    return int(quarter[1])


# =============================================================================
# Database Queries
# =============================================================================

def fetch_terminated_students_from_db(year, quarter_num):
    """Fetch terminated students from database view, joined with user-editable
    termination_records (reason_category, reason, count_as_terminated) and the
    students table for grade."""
    db = SessionLocal()
    try:
        query = text("""
            SELECT ts.student_id, ts.student_name, ts.school_student_id, ts.home_location,
                   ts.company_id, ts.termination_date,
                   s.grade,
                   tr.reason_category, tr.reason, tr.count_as_terminated
            FROM terminated_students ts
            JOIN students s ON s.id = ts.student_id
            LEFT JOIN termination_records tr
              ON tr.student_id = ts.student_id
             AND tr.year = :year
             AND tr.quarter = :quarter
            WHERE ts.termination_year = :year
            AND ts.termination_quarter = :quarter
            ORDER BY ts.home_location, ts.termination_date
        """)
        result = db.execute(query, {"year": year, "quarter": quarter_num})
        rows = result.fetchall()
        return [dict(row._mapping) for row in rows]
    finally:
        db.close()


def fetch_locations_from_db():
    """Fetch distinct locations from terminated_students, excluding 'Various'."""
    db = SessionLocal()
    try:
        query = text("""
            SELECT DISTINCT home_location
            FROM students
            WHERE home_location IS NOT NULL
            AND home_location != 'Various'
            ORDER BY home_location
        """)
        result = db.execute(query)
        return [row[0] for row in result.fetchall()]
    finally:
        db.close()


# =============================================================================
# API Calls
# =============================================================================

def fetch_student_enrollments(student_id):
    """Fetch all enrollments for a student via API."""
    try:
        response = requests.get(f"{API_BASE_URL}/enrollments",
                                params={"student_id": student_id, "limit": 500})
        if response.status_code == 200:
            return response.json()
    except Exception as e:
        print(f"  Warning: Error fetching enrollments for student {student_id}: {e}")
    return []


def fetch_tutors():
    """Fetch all tutors via API."""
    try:
        response = requests.get(f"{API_BASE_URL}/tutors")
        if response.status_code == 200:
            return response.json()
    except Exception as e:
        print(f"Error fetching tutors: {e}")
    return []


# =============================================================================
# Helper Functions
# =============================================================================

def get_last_enrollment(enrollments):
    """Get most recent enrollment by first_lesson_date."""
    if not enrollments:
        return None
    sorted_enrollments = sorted(
        enrollments,
        key=lambda e: e.get("first_lesson_date") or "1900-01-01",
        reverse=True
    )
    return sorted_enrollments[0]


def format_time(time_str):
    """Format time as [HH:MM], extracting only start time."""
    if not time_str:
        return ""
    time_str = time_str.split(" - ")[0].strip()
    try:
        if ":" in time_str:
            parts = time_str.split(":")
            return f"[{parts[0].zfill(2)}:{parts[1].zfill(2)}]"
    except:
        pass
    return f"[{time_str}]"


def format_day_abbrev(day):
    """Convert full day name to abbreviation."""
    day_map = {
        "Monday": "Mon", "Tuesday": "Tue", "Wednesday": "Wed",
        "Thursday": "Thu", "Friday": "Fri", "Saturday": "Sat", "Sunday": "Sun"
    }
    return day_map.get(day, day[:3] if day else "")


def get_tutor_sort_name(name):
    """Strip Mr/Ms/Mrs prefix for sorting by first name."""
    import re
    return re.sub(r'^(Mr\.?|Ms\.?|Mrs\.?)\s*', '', name, flags=re.IGNORECASE)


# =============================================================================
# Google Sheets Export
# =============================================================================

def get_sheets_service():
    """
    Initialize Google Sheets API service using OAuth2.
    On first run, opens browser for user login. Token is saved for future runs.
    """
    if not SHEETS_AVAILABLE:
        raise RuntimeError(
            "Google API libraries not installed. Run:\n"
            "pip install google-auth google-auth-oauthlib google-api-python-client"
        )

    SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
    creds = None

    # Paths for OAuth files
    script_dir = os.path.dirname(__file__)
    token_path = os.path.join(script_dir, 'sheets_token.json')
    client_secrets_path = os.getenv("GOOGLE_SHEETS_CLIENT_SECRETS")

    if client_secrets_path and not os.path.isabs(client_secrets_path):
        client_secrets_path = os.path.join(script_dir, client_secrets_path)

    # Load existing token if available
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)

    # If no valid credentials, authenticate via browser
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not client_secrets_path or not os.path.exists(client_secrets_path):
                raise RuntimeError(
                    f"OAuth client secrets file not found.\n"
                    f"1. Go to Google Cloud Console > APIs & Services > Credentials\n"
                    f"2. Create OAuth 2.0 Client ID (Desktop app)\n"
                    f"3. Download JSON and save as 'client_secrets.json' in project root\n"
                    f"4. Set GOOGLE_SHEETS_CLIENT_SECRETS=client_secrets.json in .env"
                )

            flow = InstalledAppFlow.from_client_secrets_file(client_secrets_path, SCOPES)
            # Use run_local_server with open_browser=False for WSL
            # Copy the URL into your browser manually
            print("\n" + "="*60)
            print("AUTHENTICATION REQUIRED")
            print("Copy the URL below into your browser to authenticate:")
            print("="*60)
            creds = flow.run_local_server(port=8085, open_browser=False)

        # Save token for future runs
        with open(token_path, 'w') as token:
            token.write(creds.to_json())
        print(f"  Token saved to {token_path}")

    return build('sheets', 'v4', credentials=creds)


def get_sheet_id_for_location(location):
    """Get the Google Sheet spreadsheet ID for a location from environment."""
    env_key = f"GOOGLE_SHEET_{location}"
    sheet_id = os.getenv(env_key)
    if not sheet_id:
        print(f"  Warning: {env_key} not set in .env, skipping Google Sheets export for {location}")
        return None
    return sheet_id


def write_to_sheet(service, spreadsheet_id, tab_name, headers, data, columns=None):
    """
    Write data to a specific tab in a Google Sheet.

    Args:
        columns: If specified, list of column letters to write to (e.g., ['A', 'B', 'E']).
                 Data should have same number of elements as columns.
                 If None, writes all data starting from column A.
    """
    if columns:
        # Write to specific columns only (don't clear, just update specific ranges)
        total_cells = 0
        num_rows = len(data) + 1  # +1 for header

        for col_idx, col_letter in enumerate(columns):
            # Extract this column's data
            col_values = [[headers[col_idx]]]  # Header
            for row in data:
                col_values.append([row[col_idx]])

            # Write this column
            range_str = f"'{tab_name}'!{col_letter}1:{col_letter}{num_rows}"
            body = {'values': col_values}
            try:
                result = service.spreadsheets().values().update(
                    spreadsheetId=spreadsheet_id,
                    range=range_str,
                    valueInputOption='RAW',
                    body=body
                ).execute()
                total_cells += result.get('updatedCells', 0)
            except Exception as e:
                print(f"  Error writing column {col_letter}: {e}")

        return total_cells
    else:
        # Write all columns starting from A (original behavior)
        values = [headers]
        for row in data:
            values.append(row)

        # Clear the tab first
        try:
            service.spreadsheets().values().clear(
                spreadsheetId=spreadsheet_id,
                range=f"'{tab_name}'!A:Z"
            ).execute()
        except Exception as e:
            print(f"  Note: Could not clear tab '{tab_name}', it may not exist. Error: {e}")

        # Write data
        body = {'values': values}
        try:
            result = service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=f"'{tab_name}'!A1",
                valueInputOption='RAW',
                body=body
            ).execute()
            return result.get('updatedCells', 0)
        except Exception as e:
            print(f"  Error writing to sheet: {e}")
            return 0


def export_to_google_sheets(location, terminated_list, enrollment_stats, termination_counts,
                             location_totals=None):
    """Export report data to Google Sheets for a location."""
    sheet_id = get_sheet_id_for_location(location)
    if not sheet_id:
        return False

    try:
        service = get_sheets_service()
    except Exception as e:
        print(f"  Error initializing Google Sheets: {e}")
        return False

    # Export Terminated Students to "Reasons" tab (columns A:I)
    print(f"  Exporting to 'Reasons' tab...")
    terminated_headers = ["ID#", "Student", "Grade", "Instructor", "Schedule", "LastLesson",
                          "Category", "Reason", "Count as Term?"]
    terminated_data = [
        [
            s["company_id"], s["student_name"], s["grade"], s["tutor_name"], s["schedule"],
            s["termination_date"],
            s.get("reason_category", ""),
            s.get("reason", ""),
            bool(s.get("count_as_terminated")),  # Sheets checkbox: must be actual bool
        ]
        for s in terminated_list
    ]
    cells = write_to_sheet(service, sheet_id, "Reasons", terminated_headers, terminated_data,
                           columns=['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'])
    print(f"    Updated {cells} cells")

    # Export Enrollment Stats to "Term Rate" tab (columns A:E - don't touch F or beyond)
    print(f"  Exporting to 'Term Rate' tab...")
    stats_headers = ["Instructor", "Opening", "Enrollment / Transfer", "Termination", "Closing"]
    stats_data = []

    sorted_tutors = sorted(enrollment_stats.keys(), key=get_tutor_sort_name)
    for tutor_name in sorted_tutors:
        stats = enrollment_stats[tutor_name]
        opening = stats["opening"]
        closing = stats["closing"]
        termination = termination_counts.get(tutor_name, 0)

        # Skip tutors with no activity at this location
        if opening == 0 and closing == 0 and termination == 0:
            continue

        enrollment_transfer = closing - opening + termination
        stats_data.append([tutor_name, opening, enrollment_transfer, termination, closing])

    cells = write_to_sheet(service, sheet_id, "Term Rate", stats_headers, stats_data,
                           columns=['A', 'B', 'C', 'D', 'E'])
    print(f"    Updated {cells} cells")

    # Location-wide totals at I3:J3 (Opening, Terminated)
    if location_totals is not None:
        print(f"  Writing location totals to 'Term Rate'!I3:J3...")
        try:
            service.spreadsheets().values().update(
                spreadsheetId=sheet_id,
                range="'Term Rate'!I3:J3",
                valueInputOption='RAW',
                body={'values': [[location_totals["opening"], location_totals["terminated"]]]}
            ).execute()
            print(f"    Opening={location_totals['opening']}, Terminated={location_totals['terminated']}")
        except Exception as e:
            print(f"  Error writing location totals: {e}")

    return True


# =============================================================================
# Report Generation
# =============================================================================

def build_terminated_students_list(terminated_students):
    """Build detailed terminated students list with grade, tutor, schedule."""
    results = []
    total = len(terminated_students)

    for i, student in enumerate(terminated_students):
        if (i + 1) % 10 == 0:
            print(f"  Processing terminated students: {i + 1}/{total}")

        student_id = student["student_id"]
        company_id = student["company_id"]
        student_name = student["student_name"]
        termination_date = student["termination_date"]
        grade = student.get("grade") or ""

        # Fetch last enrollment for tutor and schedule
        enrollments = fetch_student_enrollments(student_id)
        last_enrollment = get_last_enrollment(enrollments)

        tutor_name = ""
        schedule = ""

        if last_enrollment:
            tutor_name = last_enrollment.get("tutor_name", "")
            assigned_time = last_enrollment.get("assigned_time", "")
            assigned_day = last_enrollment.get("assigned_day", "")

            if assigned_time and assigned_day:
                schedule = f"{format_time(assigned_time)}, {format_day_abbrev(assigned_day)}"
            elif assigned_time:
                schedule = format_time(assigned_time)
            elif assigned_day:
                schedule = format_day_abbrev(assigned_day)

        # Format date
        if hasattr(termination_date, 'strftime'):
            formatted_date = termination_date.strftime("%Y-%m-%d")
        else:
            formatted_date = str(termination_date)

        results.append({
            "company_id": company_id,
            "student_name": student_name,
            "grade": grade,
            "tutor_name": tutor_name,
            "schedule": schedule,
            "termination_date": formatted_date,
            "reason_category": student.get("reason_category") or "",
            "reason": student.get("reason") or "",
            "count_as_terminated": bool(student.get("count_as_terminated")),
        })

    return results


def calculate_enrollment_stats(tutors, location, opening_start, opening_end, closing_end):
    """Calculate Opening/Closing enrollment stats per tutor for a location.

    Runs the same SQL as /api/terminations/stats so the numbers match the
    Terminated Students page exactly. Uses the MySQL calculate_effective_end_date
    function and the 21-day grace window for holiday-delayed renewals.
    """
    prev_closing_end = opening_start - timedelta(days=1)

    opening_query = text("""
        SELECT
            e.tutor_id,
            COUNT(DISTINCT e.student_id) as opening_count
        FROM enrollments e
        JOIN students s ON e.student_id = s.id
        WHERE e.payment_status IN ('Paid', 'Pending Payment')
        AND e.enrollment_type = 'Regular'
        AND e.first_lesson_date IS NOT NULL
        AND e.first_lesson_date <= DATE_ADD(:opening_end, INTERVAL 21 DAY)
        AND calculate_effective_end_date(
            e.first_lesson_date,
            e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
        ) >= :opening_start
        AND (
            e.first_lesson_date <= :opening_end
            OR e.student_id IN (
                SELECT DISTINCT e2.student_id
                FROM enrollments e2
                WHERE e2.payment_status IN ('Paid', 'Pending Payment')
                AND e2.enrollment_type = 'Regular'
                AND e2.first_lesson_date IS NOT NULL
                AND e2.first_lesson_date <= :opening_end
                AND calculate_effective_end_date(
                    e2.first_lesson_date,
                    e2.lessons_paid,
                    COALESCE(e2.deadline_extension_weeks, 0)
                ) >= DATE_SUB(:prev_closing_end, INTERVAL 21 DAY)
            )
        )
        AND e.location = :location
        GROUP BY e.tutor_id
    """)

    closing_query = text("""
        SELECT
            e.tutor_id,
            COUNT(DISTINCT e.student_id) as closing_count
        FROM enrollments e
        JOIN students s ON e.student_id = s.id
        WHERE e.payment_status IN ('Paid', 'Pending Payment')
        AND e.enrollment_type = 'Regular'
        AND e.first_lesson_date IS NOT NULL
        AND e.first_lesson_date <= DATE_ADD(:closing_end, INTERVAL 21 DAY)
        AND calculate_effective_end_date(
            e.first_lesson_date,
            e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
        ) > :closing_end
        AND e.student_id IN (
            SELECT DISTINCT e2.student_id
            FROM enrollments e2
            WHERE e2.payment_status IN ('Paid', 'Pending Payment')
            AND e2.enrollment_type = 'Regular'
            AND e2.first_lesson_date IS NOT NULL
            AND e2.first_lesson_date <= :closing_end
            AND calculate_effective_end_date(
                e2.first_lesson_date,
                e2.lessons_paid,
                COALESCE(e2.deadline_extension_weeks, 0)
            ) >= :opening_start
        )
        AND e.location = :location
        GROUP BY e.tutor_id
    """)

    db = SessionLocal()
    try:
        opening_rows = db.execute(opening_query, {
            "opening_start": opening_start,
            "opening_end": opening_end,
            "prev_closing_end": prev_closing_end,
            "location": location,
        }).fetchall()
        opening_by_tutor = {row.tutor_id: row.opening_count for row in opening_rows}

        closing_rows = db.execute(closing_query, {
            "opening_start": opening_start,
            "closing_end": closing_end,
            "location": location,
        }).fetchall()
        closing_by_tutor = {row.tutor_id: row.closing_count for row in closing_rows}
    finally:
        db.close()

    results = {}
    for tutor in tutors:
        tutor_id = tutor["id"]
        tutor_name = tutor["tutor_name"]
        results[tutor_name] = {
            "opening": opening_by_tutor.get(tutor_id, 0),
            "closing": closing_by_tutor.get(tutor_id, 0),
        }

    return results


def fetch_termination_counts_by_tutor(year, quarter_num, location, tutors, opening_start, closing_end):
    """Count terminations per tutor for a location using the same SQL as
    /api/terminations/stats. Only counts students with count_as_terminated=TRUE
    for the quarter; attributes them to the tutor of their latest enrollment
    within closing_end + 30 days. Returns {tutor_name: count}."""
    query = text("""
        WITH quarter_enrollments AS (
            SELECT e.*,
                   calculate_effective_end_date(
                       e.first_lesson_date,
                       e.lessons_paid,
                       COALESCE(e.deadline_extension_weeks, 0)
                   ) as eff_end_date,
                   ROW_NUMBER() OVER (
                       PARTITION BY e.student_id
                       ORDER BY e.first_lesson_date DESC
                   ) as rn
            FROM enrollments e
            WHERE e.payment_status IN ('Paid', 'Pending Payment')
            AND e.enrollment_type = 'Regular'
            AND e.first_lesson_date IS NOT NULL
            AND e.first_lesson_date <= DATE_ADD(:closing_end, INTERVAL 30 DAY)
        ),
        termed AS (
            SELECT qe.student_id, qe.tutor_id
            FROM quarter_enrollments qe
            WHERE qe.rn = 1
            AND qe.eff_end_date >= :opening_start
            AND qe.eff_end_date <= :closing_end
        )
        SELECT te.tutor_id, COUNT(*) as terminated_count
        FROM termed te
        JOIN students s ON te.student_id = s.id
        JOIN termination_records tr
          ON te.student_id = tr.student_id
         AND tr.quarter = :quarter AND tr.year = :year
        WHERE tr.count_as_terminated = TRUE
        AND s.home_location = :location
        GROUP BY te.tutor_id
    """)

    db = SessionLocal()
    try:
        rows = db.execute(query, {
            "year": year,
            "quarter": quarter_num,
            "opening_start": opening_start,
            "closing_end": closing_end,
            "location": location,
        }).fetchall()
    finally:
        db.close()

    tutor_name_by_id = {t["id"]: t["tutor_name"] for t in tutors}
    counts = {}
    for row in rows:
        name = tutor_name_by_id.get(row.tutor_id)
        if name:
            counts[name] = row.terminated_count
    return counts


def fetch_location_totals(year, quarter_num, location, opening_start, opening_end, closing_end):
    """Compute location-wide Opening and Terminated totals using COUNT(DISTINCT).

    These are NOT the sum of per-tutor counts: a student enrolled with two
    tutors contributes 2 to the per-tutor sum but only 1 to the location total.
    Matches the location_stats block in /api/terminations/stats.
    """
    prev_closing_end = opening_start - timedelta(days=1)

    opening_query = text("""
        SELECT COUNT(DISTINCT e.student_id) as cnt
        FROM enrollments e
        JOIN students s ON e.student_id = s.id
        WHERE e.payment_status IN ('Paid', 'Pending Payment')
        AND e.enrollment_type = 'Regular'
        AND e.first_lesson_date IS NOT NULL
        AND e.first_lesson_date <= DATE_ADD(:opening_end, INTERVAL 21 DAY)
        AND calculate_effective_end_date(
            e.first_lesson_date, e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
        ) >= :opening_start
        AND (
            e.first_lesson_date <= :opening_end
            OR e.student_id IN (
                SELECT DISTINCT e2.student_id
                FROM enrollments e2
                WHERE e2.payment_status IN ('Paid', 'Pending Payment')
                AND e2.enrollment_type = 'Regular'
                AND e2.first_lesson_date IS NOT NULL
                AND e2.first_lesson_date <= :opening_end
                AND calculate_effective_end_date(
                    e2.first_lesson_date, e2.lessons_paid,
                    COALESCE(e2.deadline_extension_weeks, 0)
                ) >= DATE_SUB(:prev_closing_end, INTERVAL 21 DAY)
            )
        )
        AND e.location = :location
    """)

    terminated_query = text("""
        WITH quarter_enrollments AS (
            SELECT e.*,
                   calculate_effective_end_date(
                       e.first_lesson_date, e.lessons_paid,
                       COALESCE(e.deadline_extension_weeks, 0)
                   ) as eff_end_date,
                   ROW_NUMBER() OVER (
                       PARTITION BY e.student_id
                       ORDER BY e.first_lesson_date DESC
                   ) as rn
            FROM enrollments e
            WHERE e.payment_status IN ('Paid', 'Pending Payment')
            AND e.enrollment_type = 'Regular'
            AND e.first_lesson_date IS NOT NULL
            AND e.first_lesson_date <= DATE_ADD(:closing_end, INTERVAL 30 DAY)
        ),
        termed AS (
            SELECT qe.student_id
            FROM quarter_enrollments qe
            WHERE qe.rn = 1
            AND qe.eff_end_date >= :opening_start
            AND qe.eff_end_date <= :closing_end
        )
        SELECT COUNT(DISTINCT te.student_id) as cnt
        FROM termed te
        JOIN students s ON te.student_id = s.id
        JOIN termination_records tr ON te.student_id = tr.student_id
            AND tr.quarter = :quarter AND tr.year = :year
        WHERE tr.count_as_terminated = TRUE
        AND s.home_location = :location
    """)

    db = SessionLocal()
    try:
        opening = db.execute(opening_query, {
            "opening_start": opening_start,
            "opening_end": opening_end,
            "prev_closing_end": prev_closing_end,
            "location": location,
        }).scalar() or 0
        terminated = db.execute(terminated_query, {
            "quarter": quarter_num,
            "year": year,
            "opening_start": opening_start,
            "closing_end": closing_end,
            "location": location,
        }).scalar() or 0
    finally:
        db.close()

    return {"opening": int(opening), "terminated": int(terminated)}


def load_report_from_csv(location, year, quarter):
    """
    Load terminated students and enrollment stats from existing CSV file.
    Returns: (terminated_list, enrollment_stats, termination_counts, location_totals)
    """
    csv_file = f"quarterly_report_{year}_{quarter}_{location}.csv"

    if not os.path.exists(csv_file):
        print(f"  CSV file not found: {csv_file}")
        return None, None, None, None

    terminated_list = []
    enrollment_stats = {}
    termination_counts = {}
    location_totals = None

    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        rows = list(reader)

    # Parse the CSV - it has two sections separated by a blank row
    section = None
    for row in rows:
        if not row or all(cell == '' for cell in row):
            section = None
            continue

        if row[0] == "=== TERMINATED STUDENTS ===":
            section = "terminated"
            continue
        elif row[0] == "=== TUTOR ENROLLMENT STATS ===":
            section = "stats"
            continue
        elif row[0] == "=== LOCATION TOTALS ===":
            section = "location"
            continue

        # Skip header rows
        if row[0] in ["ID#", "Instructor", "Opening"]:
            continue

        if section == "terminated":
            terminated_list.append({
                "company_id": row[0],
                "student_name": row[1],
                "grade": row[2],
                "tutor_name": row[3],
                "schedule": row[4],
                "termination_date": row[5] if len(row) > 5 else "",
                "reason_category": row[6] if len(row) > 6 else "",
                "reason": row[7] if len(row) > 7 else "",
                "count_as_terminated": (row[8].strip().lower() in ("true", "yes")) if len(row) > 8 else False,
            })
        elif section == "stats":
            tutor_name = row[0]
            opening = int(row[1]) if row[1] else 0
            termination = int(row[3]) if len(row) > 3 and row[3] else 0
            closing = int(row[4]) if len(row) > 4 and row[4] else 0
            enrollment_stats[tutor_name] = {
                "opening": opening,
                "closing": closing
            }
            if termination:
                termination_counts[tutor_name] = termination
        elif section == "location":
            if len(row) >= 2 and row[0] and row[1]:
                location_totals = {
                    "opening": int(row[0]),
                    "terminated": int(row[1]),
                }

    return terminated_list, enrollment_stats, termination_counts, location_totals


def write_report(location, year, quarter, terminated_list, enrollment_stats, termination_counts,
                 location_totals=None):
    """Write the combined report CSV for a location."""
    output_file = f"quarterly_report_{year}_{quarter}_{location}.csv"

    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)

        # Section 1: Terminated Students
        writer.writerow(["=== TERMINATED STUDENTS ==="])
        writer.writerow(["ID#", "Student", "Grade", "Instructor", "Schedule", "LastLesson",
                         "Category", "Reason", "Count as Term?"])

        for student in terminated_list:
            writer.writerow([
                student["company_id"],
                student["student_name"],
                student["grade"],
                student["tutor_name"],
                student["schedule"],
                student["termination_date"],
                student.get("reason_category", ""),
                student.get("reason", ""),
                "TRUE" if student.get("count_as_terminated") else "FALSE",
            ])

        writer.writerow([])  # Blank row

        # Section 2: Tutor Enrollment Stats
        writer.writerow(["=== TUTOR ENROLLMENT STATS ==="])
        writer.writerow(["Instructor", "Opening", "Enrollment / Transfer", "Termination", "Closing", "Net"])

        # Sort by instructor first name (stripping Mr/Ms/Mrs prefix)
        sorted_tutors = sorted(enrollment_stats.keys(), key=get_tutor_sort_name)

        for tutor_name in sorted_tutors:
            stats = enrollment_stats[tutor_name]
            opening = stats["opening"]
            closing = stats["closing"]
            termination = termination_counts.get(tutor_name, 0)

            # Skip tutors with no activity at this location
            if opening == 0 and closing == 0 and termination == 0:
                continue

            enrollment_transfer = closing - opening + termination
            net = closing - opening

            writer.writerow([
                tutor_name,
                opening,
                enrollment_transfer,
                termination,
                closing,
                net
            ])

        # Section 3: Location-wide totals (distinct student counts, not per-tutor sums)
        if location_totals is not None:
            writer.writerow([])
            writer.writerow(["=== LOCATION TOTALS ==="])
            writer.writerow(["Opening", "Terminated"])
            writer.writerow([location_totals["opening"], location_totals["terminated"]])

    return output_file


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Generate quarterly termination report")
    parser.add_argument("--year", type=int, default=2025, help="Year (default: 2025)")
    parser.add_argument("--quarter", type=str, default="Q4", help="Quarter: Q1, Q2, Q3, Q4 (default: Q4)")
    parser.add_argument("--export-sheets", action="store_true", help="Also export to Google Sheets")
    parser.add_argument("--from-csv", action="store_true",
                        help="Read from existing CSV files instead of querying database")
    args = parser.parse_args()

    year = args.year
    quarter = args.quarter.upper()
    quarter_num = get_quarter_number(quarter)
    export_sheets = args.export_sheets
    from_csv = args.from_csv

    print(f"\n{'='*60}")
    print(f"Quarterly Report: {year} {quarter}")
    if from_csv:
        print("Mode: Loading from existing CSV files")
    print(f"{'='*60}")

    # --from-csv mode: load from existing CSV files and export to sheets
    if from_csv:
        if not export_sheets:
            print("Warning: --from-csv without --export-sheets does nothing.")
            return

        # Find existing CSV files for this quarter
        import glob
        csv_pattern = f"quarterly_report_{year}_{quarter}_*.csv"
        csv_files = glob.glob(csv_pattern)

        if not csv_files:
            print(f"No CSV files found matching: {csv_pattern}")
            return

        # Extract locations from filenames
        locations = []
        for f in csv_files:
            # quarterly_report_2025_Q4_MSA.csv -> MSA
            parts = f.replace(".csv", "").split("_")
            if len(parts) >= 4:
                locations.append(parts[-1])

        print(f"Found CSV files for locations: {locations}")

        for location in locations:
            print(f"\n{'='*60}")
            print(f"Processing location: {location}")
            print(f"{'='*60}")

            terminated_list, enrollment_stats, termination_counts, location_totals = load_report_from_csv(location, year, quarter)

            if terminated_list is None:
                continue

            print(f"  Loaded {len(terminated_list)} terminated students")
            print(f"  Loaded {len(enrollment_stats)} tutor stats")
            if location_totals is None:
                print("  Warning: CSV has no LOCATION TOTALS section (regenerate to populate I3:J3)")

            print(f"Exporting to Google Sheets...")
            export_to_google_sheets(location, terminated_list, enrollment_stats, termination_counts,
                                     location_totals=location_totals)

        print(f"\n{'='*60}")
        print("DONE!")
        print(f"{'='*60}")
        return

    # Normal mode: query database and generate reports
    # Get quarter dates
    opening_start, opening_end, closing_end = get_quarter_dates(year, quarter)
    print(f"Opening period: {opening_start} to {opening_end}")
    print(f"Closing date: {closing_end}")

    # Fetch locations
    print("\nFetching locations...")
    locations = fetch_locations_from_db()
    print(f"Found locations: {locations}")

    # Fetch all terminated students for the quarter
    print(f"\nFetching terminated students for {year} {quarter}...")
    all_terminated = fetch_terminated_students_from_db(year, quarter_num)
    print(f"Found {len(all_terminated)} terminated students")

    # Fetch tutors
    print("\nFetching tutors...")
    tutors = fetch_tutors()
    print(f"Found {len(tutors)} tutors")

    # Process each location
    output_files = []

    for location in locations:
        print(f"\n{'='*60}")
        print(f"Processing location: {location}")
        print(f"{'='*60}")

        # Filter terminated students for this location
        location_terminated = [s for s in all_terminated if s["home_location"] == location]
        print(f"Terminated students at {location}: {len(location_terminated)}")

        if len(location_terminated) == 0:
            print(f"  Skipping {location} (no terminated students)")
            continue

        # Build detailed terminated students list
        print("Building terminated students list...")
        terminated_list = build_terminated_students_list(location_terminated)

        # Calculate enrollment stats for this location
        print("Calculating enrollment stats...")
        enrollment_stats = calculate_enrollment_stats(
            tutors, location, opening_start, opening_end, closing_end
        )

        # Count terminations by tutor (matches /api/terminations/stats)
        termination_counts = fetch_termination_counts_by_tutor(
            year, quarter_num, location, tutors, opening_start, closing_end
        )

        # Location-wide totals (COUNT DISTINCT, not sum of per-tutor counts)
        location_totals = fetch_location_totals(
            year, quarter_num, location, opening_start, opening_end, closing_end
        )
        print(f"Location totals: Opening={location_totals['opening']}, Terminated={location_totals['terminated']}")

        # Write report
        output_file = write_report(location, year, quarter, terminated_list, enrollment_stats,
                                    termination_counts, location_totals=location_totals)
        output_files.append(output_file)
        print(f"Report written: {output_file}")

        # Export to Google Sheets if requested
        if export_sheets:
            print(f"Exporting to Google Sheets...")
            export_to_google_sheets(location, terminated_list, enrollment_stats, termination_counts,
                                     location_totals=location_totals)

    # Summary
    print(f"\n{'='*60}")
    print("DONE!")
    print(f"{'='*60}")
    print(f"Generated {len(output_files)} report(s):")
    for f in output_files:
        print(f"  - {f}")


if __name__ == "__main__":
    main()
