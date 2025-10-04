#!/usr/bin/env python3
"""
Process Coupon Excel File and Generate SQL Updates

This script reads the TerminationList Excel file from the company system
and generates SQL statements to update student coupon counts.

Usage:
    python3 scripts/process_coupons.py <path_to_excel_file>

Example:
    python3 scripts/process_coupons.py "TerminationList_MSA_2025-11-01_20251004054509.xls"

Requirements:
    pip3 install pandas openpyxl xlrd

Output:
    - Generates SQL file: coupon_updates_YYYYMMDD_HHMMSS.sql
    - Displays summary of processed records
    - Shows any errors or warnings
"""

import pandas as pd
import sys
import os
from datetime import datetime

def process_coupon_file(excel_path):
    """
    Read Excel file and generate SQL INSERT statements for student coupons

    Args:
        excel_path: Path to Excel file

    Returns:
        List of SQL statements
    """
    print(f"📖 Reading file: {excel_path}")

    try:
        # Try reading with different engines
        try:
            df = pd.read_excel(excel_path, engine='openpyxl')
        except:
            try:
                df = pd.read_excel(excel_path, engine='xlrd')
            except Exception as e:
                print(f"❌ Error reading Excel file: {e}")
                print("\n💡 Tip: Try converting to CSV first in Excel (File → Save As → CSV)")
                return []

    except Exception as e:
        print(f"❌ Error: {e}")
        return []

    print(f"✅ File loaded successfully")
    print(f"📊 Rows: {len(df)}, Columns: {len(df.columns)}")

    # Check if file has expected columns
    if len(df.columns) < 11:
        print(f"⚠️  Warning: File has only {len(df.columns)} columns, expected at least 11 (A-K)")
        print("Please verify you uploaded the correct file.")
        return []

    # Extract columns A (ID) and K (Coupon)
    # Column indices: A=0, K=10
    df_filtered = df.iloc[:, [0, 10]].copy()
    df_filtered.columns = ['company_id', 'coupons']

    print(f"\n📋 Processing coupon data...")
    print(f"Column A (ID): {df_filtered['company_id'].iloc[0] if len(df_filtered) > 0 else 'N/A'}")
    print(f"Column K (Coupon): {df_filtered['coupons'].iloc[0] if len(df_filtered) > 0 else 'N/A'}")

    sql_statements = []
    stats = {
        'total': 0,
        'with_coupons': 0,
        'without_coupons': 0,
        'skipped': 0,
        'errors': []
    }

    for index, row in df_filtered.iterrows():
        company_id = str(row['company_id']).strip()
        coupons = row['coupons']

        # Skip header row
        if company_id == 'ID#' or pd.isna(company_id) or company_id == 'nan':
            continue

        # Parse location code and student ID
        # Example: "MSA1395" -> location="MSA", student_id="1395"
        location = ""
        student_id = ""

        # Find where numbers start
        for i, char in enumerate(company_id):
            if char.isdigit():
                location = company_id[:i]
                student_id = company_id[i:]
                break

        if not location or not student_id:
            stats['skipped'] += 1
            stats['errors'].append(f"Row {index + 2}: Invalid company ID format: {company_id}")
            continue

        # Parse coupon count
        if coupons == '--' or pd.isna(coupons) or str(coupons).strip() == '':
            coupon_count = 0
            stats['without_coupons'] += 1
        else:
            try:
                coupon_count = int(float(str(coupons).strip()))
                if coupon_count > 0:
                    stats['with_coupons'] += 1
                else:
                    stats['without_coupons'] += 1
            except:
                coupon_count = 0
                stats['without_coupons'] += 1
                stats['errors'].append(f"Row {index + 2}: Invalid coupon value: {coupons} (treating as 0)")

        stats['total'] += 1

        # Generate SQL using INSERT ... ON DUPLICATE KEY UPDATE
        # This will insert if student doesn't have coupon record, or update if they do
        sql = f"""-- {company_id}: {coupon_count} coupon(s)
INSERT INTO student_coupons (student_id, available_coupons, coupon_value, last_synced_by, sync_source_file)
SELECT
    id,
    {coupon_count},
    300.00,
    'system',
    '{os.path.basename(excel_path)}'
FROM students
WHERE home_location = '{location}' AND school_student_id = '{student_id}'
ON DUPLICATE KEY UPDATE
    available_coupons = {coupon_count},
    last_synced_at = NOW(),
    last_synced_by = 'system',
    sync_source_file = '{os.path.basename(excel_path)}';
"""
        sql_statements.append(sql.strip())

    return sql_statements, stats

def main():
    if len(sys.argv) < 2:
        print("❌ Error: No file specified")
        print("\nUsage:")
        print("  python3 scripts/process_coupons.py <path_to_excel_file>")
        print("\nExample:")
        print("  python3 scripts/process_coupons.py 'TerminationList_MSA_2025-11-01_20251004054509.xls'")
        sys.exit(1)

    excel_file = sys.argv[1]

    # Check if file exists
    if not os.path.exists(excel_file):
        print(f"❌ Error: File not found: {excel_file}")
        sys.exit(1)

    print("=" * 60)
    print("🔧 CSM Pro - Coupon Data Processor")
    print("=" * 60)
    print()

    # Process file
    result = process_coupon_file(excel_file)

    if not result:
        print("\n❌ Processing failed")
        sys.exit(1)

    sql_list, stats = result

    # Generate output filename
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_file = f"coupon_updates_{timestamp}.sql"

    # Write to file
    with open(output_file, 'w') as f:
        f.write("-- =====================================================\n")
        f.write("-- Student Coupon Updates\n")
        f.write("-- =====================================================\n")
        f.write(f"-- Source file: {excel_file}\n")
        f.write(f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"-- Total students: {stats['total']}\n")
        f.write(f"-- With coupons: {stats['with_coupons']}\n")
        f.write(f"-- Without coupons: {stats['without_coupons']}\n")
        f.write("-- =====================================================\n\n")

        # Add transaction wrapper for safety
        f.write("START TRANSACTION;\n\n")

        f.write('\n\n'.join(sql_list))

        f.write("\n\n-- Verify updates\n")
        f.write("SELECT\n")
        f.write("    COUNT(*) as total_students,\n")
        f.write("    SUM(CASE WHEN available_coupons > 0 THEN 1 ELSE 0 END) as students_with_coupons,\n")
        f.write("    SUM(available_coupons) as total_coupons\n")
        f.write("FROM student_coupons;\n\n")

        f.write("-- If everything looks good, run: COMMIT;\n")
        f.write("-- If something is wrong, run: ROLLBACK;\n")

    # Print summary
    print("\n" + "=" * 60)
    print("✅ Processing Complete")
    print("=" * 60)
    print(f"\n📊 Summary:")
    print(f"   Total students processed: {stats['total']}")
    print(f"   With coupons: {stats['with_coupons']}")
    print(f"   Without coupons (set to 0): {stats['without_coupons']}")
    print(f"   Skipped/Errors: {stats['skipped']}")

    if stats['errors']:
        print(f"\n⚠️  Warnings/Errors:")
        for error in stats['errors'][:10]:  # Show first 10
            print(f"   - {error}")
        if len(stats['errors']) > 10:
            print(f"   ... and {len(stats['errors']) - 10} more")

    print(f"\n📄 Output file: {output_file}")
    print(f"\n🔧 Next steps:")
    print(f"   1. Review the generated SQL file")
    print(f"   2. Run: mysql -u your_user -p csm_pro < {output_file}")
    print(f"   3. Check results in database")
    print(f"   4. If good: Run COMMIT; in MySQL")
    print(f"   5. If bad: Run ROLLBACK; in MySQL")
    print()

if __name__ == '__main__':
    main()
