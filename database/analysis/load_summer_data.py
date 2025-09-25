#!/usr/bin/env python3
"""
Summer Course to Regular Course Conversion Analysis
Load CSV data and execute SQL analysis for Google Cloud SQL
"""

import csv
import mysql.connector
import sys
import os
from pathlib import Path
from getpass import getpass

def get_db_config():
    """Get database configuration for Google Cloud SQL"""
    print("Google Cloud SQL Connection Details")
    print("-" * 40)

    # You can hardcode these if you prefer, or load from environment variables
    config = {
        'host': input("Cloud SQL Public IP or Proxy address (e.g., 34.xxx.xxx.xxx or 127.0.0.1): ").strip(),
        'user': input("Database username: ").strip(),
        'password': getpass("Database password: "),
        'database': input("Database name (e.g., tutoring_system): ").strip()
    }

    # If using Cloud SQL Proxy on localhost
    if config['host'] == '127.0.0.1' or config['host'] == 'localhost':
        config['port'] = input("Cloud SQL Proxy port (default 3306): ").strip() or '3306'
        config['port'] = int(config['port'])

    return config

def parse_coupon_category(coupon_code):
    """Extract category from coupon code"""
    if '25SSNEW' in coupon_code:
        return '25SSNEW (全新生)'
    elif '25SummerMC' in coupon_code:
        return '25SummerMC (MathConcept 學生升讀)'
    elif '25SummerRT' in coupon_code:
        return '25SummerRT (回歸學生)'
    else:
        return coupon_code  # Return as-is if pattern not recognized

def load_csv_to_database(csv_file, connection):
    """Load CSV data into temporary MySQL table"""
    cursor = connection.cursor()

    # Create temporary table
    print("Creating temporary table...")
    cursor.execute("DROP TEMPORARY TABLE IF EXISTS summer_students")
    cursor.execute("""
        CREATE TEMPORARY TABLE summer_students (
            student_id VARCHAR(100),
            student_name VARCHAR(255),
            coupon_code VARCHAR(100),
            location VARCHAR(10),
            category VARCHAR(50),
            INDEX idx_student_location (student_id, location),
            INDEX idx_name_location (student_name, location)
        )
    """)

    # Read CSV and insert data
    print(f"Loading data from {csv_file}...")
    with open(csv_file, 'r', encoding='utf-8-sig') as file:
        reader = csv.DictReader(file)

        insert_query = """
            INSERT INTO summer_students
            (student_id, student_name, coupon_code, location, category)
            VALUES (%s, %s, %s, %s, %s)
        """

        row_count = 0
        for row in reader:
            student_id = row['Student ID'].strip() if row['Student ID'] else ''
            student_name = row['Student Name'].strip() if row['Student Name'] else ''
            coupon_code = row['Coupon Code'].strip()
            location = row['Location'].strip()
            category = parse_coupon_category(coupon_code)

            # Skip rows with empty student ID
            if student_id:
                cursor.execute(insert_query, (
                    student_id,
                    student_name,
                    coupon_code,
                    location,
                    category
                ))
                row_count += 1

        connection.commit()
        print(f"Loaded {row_count} student records")

    return row_count

def run_analysis_queries(connection, output_file):
    """Execute analysis queries and save results"""
    cursor = connection.cursor(dictionary=True)

    with open(output_file, 'w', encoding='utf-8') as f:
        # Overall conversion summary
        print("\n" + "="*60)
        print("CONVERSION SUMMARY BY CATEGORY")
        print("="*60)

        cursor.execute("""
            SELECT
                ss.category,
                COUNT(*) as total_summer_students,
                COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) as students_converted,
                ROUND(
                    COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) * 100.0 / COUNT(*),
                    2
                ) as conversion_rate_percent
            FROM summer_students ss
            LEFT JOIN students s ON (
                ss.student_id = s.school_student_id
                AND ss.location = s.home_location
            )
            LEFT JOIN enrollments e ON (
                s.id = e.student_id
                AND e.payment_status IN ('Paid', 'Pending Payment')
                AND e.first_lesson_date >= '2025-09-01'
            )
            GROUP BY ss.category
            ORDER BY
                CASE ss.category
                    WHEN '25SSNEW (全新生)' THEN 1
                    WHEN '25SummerMC (MathConcept 學生升讀)' THEN 2
                    WHEN '25SummerRT (回歸學生)' THEN 3
                END
        """)

        results = cursor.fetchall()
        f.write("CONVERSION BY CATEGORY\n")
        f.write("-" * 80 + "\n")

        total_summer = 0
        total_converted = 0

        for row in results:
            total_summer += row['total_summer_students']
            total_converted += row['students_converted']

            print(f"{row['category']:<40} {row['students_converted']:>3}/{row['total_summer_students']:>3} ({row['conversion_rate_percent']:>6.2f}%)")
            f.write(f"{row['category']},{row['total_summer_students']},{row['students_converted']},{row['conversion_rate_percent']}\n")

        overall_rate = (total_converted / total_summer * 100) if total_summer > 0 else 0
        print(f"\n{'OVERALL TOTALS':<40} {total_converted:>3}/{total_summer:>3} ({overall_rate:>6.2f}%)")
        f.write(f"\nOVERALL,{total_summer},{total_converted},{overall_rate:.2f}\n")

        # Location breakdown
        print("\n" + "="*60)
        print("CONVERSION SUMMARY BY LOCATION")
        print("="*60)

        cursor.execute("""
            SELECT
                ss.location,
                COUNT(*) as total_summer_students,
                COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) as students_converted,
                ROUND(
                    COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) * 100.0 / COUNT(*),
                    2
                ) as conversion_rate_percent
            FROM summer_students ss
            LEFT JOIN students s ON (
                ss.student_id = s.school_student_id
                AND ss.location = s.home_location
            )
            LEFT JOIN enrollments e ON (
                s.id = e.student_id
                AND e.payment_status IN ('Paid', 'Pending Payment')
                AND e.first_lesson_date >= '2025-09-01'
            )
            GROUP BY ss.location
            ORDER BY ss.location
        """)

        results = cursor.fetchall()
        f.write("\n\nCONVERSION BY LOCATION\n")
        f.write("-" * 80 + "\n")

        for row in results:
            print(f"{row['location']:<10} {row['students_converted']:>3}/{row['total_summer_students']:>3} ({row['conversion_rate_percent']:>6.2f}%)")
            f.write(f"{row['location']},{row['total_summer_students']},{row['students_converted']},{row['conversion_rate_percent']}\n")

        # Detailed breakdown
        print("\n" + "="*60)
        print("DETAILED CONVERSION BREAKDOWN (Category x Location)")
        print("="*60)

        cursor.execute("""
            SELECT
                ss.category,
                ss.location,
                COUNT(*) as total_summer,
                COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) as converted,
                ROUND(
                    COUNT(DISTINCT CASE WHEN e.id IS NOT NULL THEN s.id END) * 100.0 / COUNT(*),
                    2
                ) as conversion_rate
            FROM summer_students ss
            LEFT JOIN students s ON (
                ss.student_id = s.school_student_id
                AND ss.location = s.home_location
            )
            LEFT JOIN enrollments e ON (
                s.id = e.student_id
                AND e.payment_status IN ('Paid', 'Pending Payment')
                AND e.first_lesson_date >= '2025-09-01'
            )
            GROUP BY ss.category, ss.location
            ORDER BY
                CASE ss.category
                    WHEN '25SSNEW (全新生)' THEN 1
                    WHEN '25SummerMC (MathConcept 學生升讀)' THEN 2
                    WHEN '25SummerRT (回歸學生)' THEN 3
                END,
                ss.location
        """)

        results = cursor.fetchall()
        f.write("\n\nDETAILED BREAKDOWN\n")
        f.write("-" * 80 + "\n")
        f.write("Category,Location,Total,Converted,Rate\n")

        current_category = None
        for row in results:
            if current_category != row['category']:
                if current_category:
                    print()  # Add blank line between categories
                current_category = row['category']
                print(f"\n{row['category']}")

            print(f"  {row['location']:<5} {row['converted']:>3}/{row['total_summer']:>3} ({row['conversion_rate']:>6.2f}%)")
            f.write(f"{row['category']},{row['location']},{row['total_summer']},{row['converted']},{row['conversion_rate']}\n")

    print(f"\nResults saved to {output_file}")

def generate_non_converted_list(connection, output_file):
    """Generate list of non-converted students for follow-up"""
    cursor = connection.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            ss.category,
            ss.location,
            ss.student_id,
            ss.student_name,
            CASE
                WHEN s.id IS NOT NULL THEN 'In Database - Not Enrolled'
                ELSE 'Not Found in Database'
            END as reason_not_converted
        FROM summer_students ss
        LEFT JOIN students s ON (
            ss.student_id = s.school_student_id
            AND ss.location = s.home_location
        )
        LEFT JOIN enrollments e ON (
            s.id = e.student_id
            AND e.payment_status IN ('Paid', 'Pending Payment')
            AND e.first_lesson_date >= '2025-09-01'
        )
        WHERE e.id IS NULL
        ORDER BY
            ss.category,
            ss.location,
            CAST(ss.student_id AS UNSIGNED)
    """)

    results = cursor.fetchall()

    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['category', 'location', 'student_id', 'student_name', 'reason_not_converted'])
        writer.writeheader()
        writer.writerows(results)

    print(f"Non-converted student list saved to {output_file}")
    print(f"Total non-converted: {len(results)} students")

def main():
    # File paths
    project_root = Path(__file__).parent.parent.parent
    csv_file = project_root / "Session Log - Conversion Data.csv"
    output_summary = project_root / "database" / "analysis" / "conversion_summary.txt"
    output_nonconverted = project_root / "database" / "analysis" / "non_converted_students.csv"

    # Check if CSV file exists
    if not csv_file.exists():
        print(f"Error: CSV file not found at {csv_file}")
        sys.exit(1)

    try:
        # Get database configuration
        print("="*60)
        print("Summer Course Conversion Analysis")
        print("="*60)

        print("\nThis script will connect to your Google Cloud SQL database.")
        print("You can use either:")
        print("1. Direct connection with Cloud SQL public IP")
        print("2. Cloud SQL Proxy (recommended for security)")
        print()

        db_config = get_db_config()

        # Connect to database
        print("\nConnecting to Google Cloud SQL database...")
        connection = mysql.connector.connect(**db_config)
        print("Successfully connected!")

        # Load CSV data
        row_count = load_csv_to_database(csv_file, connection)

        if row_count == 0:
            print("Error: No data loaded from CSV")
            sys.exit(1)

        # Run analysis
        run_analysis_queries(connection, output_summary)

        # Generate non-converted list
        generate_non_converted_list(connection, output_nonconverted)

        print("\n" + "="*60)
        print("ANALYSIS COMPLETE")
        print("="*60)
        print(f"Summary report: {output_summary}")
        print(f"Non-converted list: {output_nonconverted}")

    except mysql.connector.Error as err:
        print(f"Database error: {err}")
        if err.errno == 2003:
            print("\nConnection failed. Please check:")
            print("1. Cloud SQL instance is running")
            print("2. Your IP is authorized (if using direct connection)")
            print("3. Cloud SQL Proxy is running (if using proxy)")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        if 'connection' in locals() and connection.is_connected():
            connection.close()
            print("Database connection closed.")

if __name__ == "__main__":
    main()

"""
USAGE INSTRUCTIONS:

1. For Direct Connection to Cloud SQL:
   - Ensure your IP is whitelisted in Cloud SQL authorized networks
   - Use the Cloud SQL public IP address

2. For Cloud SQL Proxy (Recommended):
   - Install Cloud SQL Proxy if not already installed
   - Run: cloud_sql_proxy -instances=PROJECT:REGION:INSTANCE=tcp:3306
   - Use 127.0.0.1 or localhost as the host
   - Use 3306 (or your chosen port) as the port

3. Run the script:
   python database/analysis/load_summer_data.py

4. The script will prompt for connection details and then:
   - Load the CSV data into a temporary table
   - Run conversion analysis queries
   - Generate summary reports
   - Create list of non-converted students for follow-up
"""