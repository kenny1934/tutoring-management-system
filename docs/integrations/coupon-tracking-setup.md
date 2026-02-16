# Student Coupon Tracking & Auto-Discount System

## Overview

This system automatically applies discount coupons during enrollment renewal by:
1. Syncing coupon data from your company system (source of truth)
2. Matching students by their company ID (e.g., MSA1395)
3. Auto-filling $300 discount when renewing if coupon available
4. Company system tracks usage (we only sync the current state)

---

## How It Works

### Data Flow

```
Company System (Excel) → Process Script → SQL Updates → Sync to Database → Auto-Apply on Renewal → Mark Used in Company System → Next Sync Shows Updated Count
```

### Key Components

1. **student_coupons table**: Syncs current coupon count from company system
2. **coupon_file_uploads table**: Tracks file uploads and sync history
3. **students_with_coupons view**: Easy lookup of who has coupons
4. **Renewal action**: Auto-applies "Student Discount $300" if coupon available
5. **Company system**: Source of truth for coupon counts and usage tracking

---

## Setup (One-Time)

### Step 1: Run Database Migration

```sql
-- Run migration 026
SOURCE database/migrations/026_add_student_coupon_tracking.sql;
```

### Step 2: Sync AppSheet

1. Go to AppSheet → **Data** → **Tables**
2. Click **Regenerate Structure**
3. Verify new tables appear:
   - `student_coupons`
   - `coupon_file_uploads`
   - `students_with_coupons` (view)

### Step 3: Configure Coupon Upload Table

**Table: coupon_file_uploads**

**Add these columns in AppSheet:**

1. **file_path** (File type)
   - **Type:** File
   - **Show:** YES
   - **Editable:** YES
   - **Initial Value:** (blank)

2. **uploaded_by** (Text)
   - **Type:** Text
   - **Initial Value:** `USEREMAIL()`
   - **Editable:** NO

3. **upload_date** (DateTime)
   - **Type:** DateTime
   - **Initial Value:** `NOW()`
   - **Editable:** NO

4. **process_status** (Enum)
   - **Type:** Enum
   - **Values:** Pending, Completed, Failed
   - **Initial Value:** "Pending"
   - **Editable:** NO

### Step 4: Create Upload View

1. **UX** → **Views** → **New View**
2. **Name:** Upload Coupons
3. **For table:** coupon_file_uploads
4. **View type:** form
5. **Position:** Primary

This creates a simple upload form.

---

## Regular Use: Uploading Coupon Data

### Method 1: CSV Upload (Recommended - Simpler)

#### Step 1: Convert Excel to CSV

1. Open `TerminationList_MSA_XXXX.xls` in Excel
2. **File** → **Save As**
3. Choose **CSV (Comma delimited) (*.csv)**
4. Save as `coupons.csv`

#### Step 2: Upload via AppSheet

Since AppSheet doesn't parse CSV automatically, we'll use **Google Sheets as intermediate step**.

**Alternative: Manual Update (Fastest for Small Changes)**

If only a few students have coupons, manually update:

1. Go to **student_coupons** table in AppSheet
2. Find the student
3. Update **available_coupons** field
4. Save

### Method 2: Google Sheets Import (Recommended - Automated)

#### Setup (One-Time):

1. Create new Google Sheet: "Coupon Data Import"
2. Share with your AppSheet account
3. Add as data source in AppSheet

#### Regular Use:

1. Open Excel file `TerminationList_MSA_XXXX.xls`
2. Copy columns A and K (ID and Coupon)
3. Paste into Google Sheet
4. Run AppSheet bot to process (see Bot Setup below)

---

## AppSheet Bot: Auto-Process Coupon Data

### Create Bot: "Process Coupon Data"

**Event:** Data Change
**Table:** Google Sheet (coupon import)
**Change Type:** Adds only OR Updates

**Process:**

**Step 1: Update Student Coupons**

For each row in import sheet:

1. Parse company ID (e.g., "MSA1395")
   - Extract location: "MSA"
   - Extract ID: "1395"

2. Find matching student:
   ```
   SELECT * FROM students
   WHERE home_location = 'MSA' AND school_student_id = '1395'
   ```

3. Update or insert into student_coupons:
   ```
   INSERT INTO student_coupons (student_id, available_coupons, coupon_value)
   VALUES (student_id, coupon_count, 300.00)
   ON DUPLICATE KEY UPDATE
   available_coupons = coupon_count,
   last_updated_at = NOW()
   ```

**AppSheet Expression:**

```
LOOKUP(
  CONCATENATE([home_location], [school_student_id]),
  "students_with_coupons",
  "company_id",
  "student_id"
)
```

---

## Simpler Approach: Manual CSV Processing Script

Since AppSheet's parsing is complex, here's a **Python script** to process the file:

### Create: `scripts/process_coupons.py`

```python
#!/usr/bin/env python3
"""
Process coupon Excel file and generate SQL updates
"""

import pandas as pd
import sys
from datetime import datetime

def process_coupon_file(excel_path):
    """
    Read Excel file and generate SQL INSERT statements
    """
    # Read Excel (column A and K)
    df = pd.read_excel(excel_path, usecols=[0, 10])  # A=0, K=10
    df.columns = ['company_id', 'coupons']

    sql_statements = []

    for index, row in df.iterrows():
        company_id = str(row['company_id']).strip()
        coupons = row['coupons']

        # Skip header or invalid rows
        if company_id == 'ID#' or pd.isna(company_id):
            continue

        # Parse location and student ID
        # e.g., "MSA1395" -> location="MSA", id="1395"
        if len(company_id) < 4:
            continue

        # Find where numbers start
        for i, char in enumerate(company_id):
            if char.isdigit():
                location = company_id[:i]
                student_id = company_id[i:]
                break
        else:
            continue  # No numbers found

        # Parse coupon count
        if coupons == '--' or pd.isna(coupons):
            coupon_count = 0
        else:
            try:
                coupon_count = int(coupons)
            except:
                coupon_count = 0

        # Generate SQL
        sql = f"""
INSERT INTO student_coupons (student_id, available_coupons, coupon_value, last_synced_by, sync_source_file)
SELECT
    id,
    {coupon_count},
    300.00,
    'system',
    '{excel_path}'
FROM students
WHERE home_location = '{location}' AND school_student_id = '{student_id}'
ON DUPLICATE KEY UPDATE
    available_coupons = {coupon_count},
    last_synced_at = NOW(),
    last_synced_by = 'system',
    sync_source_file = '{excel_path}';
"""
        sql_statements.append(sql.strip())

    return sql_statements

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 process_coupons.py <path_to_excel_file>")
        sys.exit(1)

    excel_file = sys.argv[1]
    print(f"Processing: {excel_file}\n")

    sql_list = process_coupon_file(excel_file)

    # Write to file
    output_file = f"coupon_updates_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sql"
    with open(output_file, 'w') as f:
        f.write("-- Generated coupon updates\n")
        f.write(f"-- Source: {excel_file}\n")
        f.write(f"-- Generated: {datetime.now()}\n\n")
        f.write('\n'.join(sql_list))

    print(f"✅ Generated {len(sql_list)} SQL statements")
    print(f"📄 Output: {output_file}")
    print(f"\nTo apply: mysql -u your_user -p your_database < {output_file}")
```

### Usage:

```bash
# Install pandas if needed
pip3 install pandas openpyxl

# Run script
python3 scripts/process_coupons.py "TerminationList_MSA_2025-11-01_20251004054509.xls"

# Apply generated SQL
mysql -u $DB_USER -p $DB_NAME < coupon_updates_20251004_120000.sql
```

This generates SQL that you can review and run.

---

## Enrollment Renewal: Auto-Apply Discount

### Modify Renewal Action

**Update your renewal action workflow:**

#### Step 1: Check for Available Coupons

**Before creating new enrollment, check:**

```
LOOKUP(
  [student_id],
  "student_coupons",
  "student_id",
  "available_coupons"
) > 0
```

#### Step 2: Set Discount Automatically

**If coupon available:**

1. Find $300 discount in discounts table:
   ```
   SELECT id FROM discounts
   WHERE discount_name = 'Student Discount $300'
   AND is_active = TRUE
   ```

2. Set discount_id for new enrollment:
   ```
   discount_id = LOOKUP(
     "Student Discount $300",
     "discounts",
     "discount_name",
     "id"
   )
   ```

#### Step 3: Mark Usage in Company System

**After successful renewal:**

- Mark the coupon as used in your company system
- Next time you sync the coupon file, the updated count will be reflected
- No need to decrement in CSM Pro - company system is the source of truth

### AppSheet Action: Complete Renewal with Coupon

**Action Name:** Renew with Auto-Discount

**Steps:**

1. **Check coupon availability**
   - Expression: `[student_id].[available_coupons] > 0`
   - Store in variable: `has_coupon`

2. **Create new enrollment** (Data: add a new row to another table)
   - Table: enrollments
   - Set values:
     - student_id: `[student_id]`
     - tutor_id: `[tutor_id]`
     - assigned_day: `[assigned_day]`
     - assigned_time: `[assigned_time]`
     - location: `[location]`
     - lessons_paid: (user input)
     - payment_date: `TODAY()`
     - first_lesson_date: (user input)
     - payment_status: "Paid"
     - **discount_id:**
       ```
       IF(
         [_has_coupon],
         LOOKUP("Student Discount $300", "discounts", "discount_name", "id"),
         ""
       )
       ```
     - renewed_from_enrollment_id: `[id]`

3. **Mark old enrollment as completed**
   - Set payment_status = "Completed"

**Note:** After renewal, mark the coupon as used in your company system. The next coupon file sync will show the updated count.

---

## Verify $300 Discount Exists

### Check Discounts Table

The system uses the existing "Student Discount $300" discount (id=1). Verify it exists:

```sql
SELECT * FROM discounts WHERE discount_name = 'Student Discount $300';
-- Should show: id=1, discount_type='Fixed', discount_value=300.00, is_active=TRUE
```

---

## User Experience

### Scenario: Renewal with Coupon Available

1. Admin opens enrollment needing renewal
2. Clicks **Renew** action
3. AppSheet checks: Student has 2 coupons available
4. Form pre-fills:
   - Discount: "Student Discount $300" ✅ (auto-selected)
   - All other fields copied from old enrollment
5. Admin confirms renewal
6. New enrollment created with $300 discount
7. Admin marks coupon used in company system
8. Next sync: Coupon count 2 → 1
9. Admin sees confirmation: "Renewal complete! Coupon applied"

### Scenario: Renewal without Coupon

1. Same process
2. Student has 0 coupons
3. Discount field: Blank or manual selection
4. No coupon deduction

---

## Reporting & Monitoring

### View: Active Coupons

```sql
SELECT
    s.student_name,
    s.school_student_id,
    s.home_location,
    sc.available_coupons,
    sc.last_updated_at
FROM students s
JOIN student_coupons sc ON s.id = sc.student_id
WHERE sc.available_coupons > 0
ORDER BY sc.available_coupons DESC, s.student_name;
```

### View: Coupon Usage History

```sql
SELECT
    s.student_name,
    e.payment_date,
    d.discount_name,
    d.discount_value
FROM enrollments e
JOIN students s ON e.student_id = s.id
JOIN discounts d ON e.discount_id = d.id
WHERE d.discount_name LIKE '%Coupon%'
ORDER BY e.payment_date DESC;
```

### Dashboard Metrics

**AppSheet Dashboard:**

1. **Total Active Coupons**
   ```
   SUM(students_with_coupons[available_coupons])
   ```

2. **Students with Coupons**
   ```
   COUNT(SELECT(students_with_coupons[student_id], [has_coupon_available] = "Yes"))
   ```

3. **Last Coupon Data Update**
   ```
   MAX(student_coupons[last_updated_at])
   ```

---

## Maintenance

### Regular Tasks

**Weekly: Upload Coupon Data**
1. Download latest TerminationList from company system
2. Run processing script OR manual upload
3. Verify update count

**Monthly: Audit Coupon Usage**
1. Compare coupon redemptions vs. company system
2. Identify discrepancies
3. Adjust as needed

### Troubleshooting

**Problem: Student has coupon in file but not in database**

Check:
1. ✅ home_location and school_student_id match exactly
2. ✅ Student exists in students table
3. ✅ Processing script ran successfully

**Problem: Discount not auto-applying**

Check:
1. ✅ Discount "Student Discount $300" exists and is_active = TRUE
2. ✅ Renewal action includes coupon check logic
3. ✅ student_coupons.available_coupons > 0

**Problem: Coupon count not updating after renewal**

Remember:
1. ✅ Company system is the source of truth
2. ✅ Mark coupon used in company system after renewal
3. ✅ Next coupon file sync will show updated count
4. ✅ We don't decrement locally in CSM Pro

---

## Recommended Workflow

**Best Practice: Semi-Automated**

1. **Weekly**: Download Excel from company system
2. **Process**: Run Python script locally to generate SQL
3. **Review**: Check generated SQL for accuracy
4. **Apply**: Run SQL updates in database
5. **Verify**: Check AppSheet dashboard for updated counts

This gives you:
- ✅ Full control and visibility
- ✅ Audit trail (saved SQL files)
- ✅ Quick updates (< 5 minutes)
- ✅ Error checking before applying

---

## Alternative: Fully Manual (If File Parse Too Complex)

If automation is too complex for now:

1. **Create spreadsheet view** of student_coupons table
2. **Export** current coupons to Excel
3. **Manually update** coupon counts in Excel
4. **Import back** to AppSheet

Takes 10-15 minutes vs. 2-3 minutes automated, but simpler setup.

---

## Future Enhancements

### Phase 2: Real-Time API Integration

If company system has API:
1. Connect directly to company database
2. Sync coupons automatically (daily cron job)
3. No manual file upload needed

### Phase 3: Coupon Expiration

Add:
```sql
ALTER TABLE student_coupons
ADD COLUMN coupon_expiry_date DATE NULL COMMENT 'When coupons expire';
```

Track expiring coupons and alert before renewal.

---

## Summary

**Current Setup:**
- Manual file upload (weekly/monthly)
- Python script processes and generates SQL
- Syncs coupon counts from company system
- Auto-applies "Student Discount $300" on renewal
- Company system tracks actual usage

**Time Investment:**
- Setup: 30 minutes
- Regular use: 5 minutes per upload

**Benefits:**
- ✅ No manual discount selection
- ✅ Prevents errors (applying when no coupon)
- ✅ Company system is source of truth
- ✅ Simple sync workflow
- ✅ Audit trail through file uploads

---

## Quick Start Checklist

- [ ] Run migration 026
- [ ] Sync AppSheet (regenerate structure)
- [ ] Verify "Student Discount $300" exists in discounts table (id=1)
- [ ] Test with 1 student (manually add coupon via student_coupons table)
- [ ] Test renewal action (verify discount auto-applies)
- [ ] Install Python dependencies (pandas, openpyxl, xlrd)
- [ ] Process first coupon file with script
- [ ] Train admin users on renewal workflow and company system marking

---

## Files Created

1. `database/migrations/026_add_student_coupon_tracking.sql`
2. `scripts/process_coupons.py` (create this)
3. `docs/coupon-tracking-setup.md` (this file)

Ready to implement! 🎉
