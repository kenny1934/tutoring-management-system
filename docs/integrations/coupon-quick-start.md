# Coupon Auto-Discount - Quick Start Guide

## What This Does

Automatically applies $300 discount during enrollment renewal if student has coupons available.

---

## Setup (One-Time - 15 minutes)

### 1. Run Database Migrations

```bash
mysql -u root -p csm_pro < database/migrations/026_add_student_coupon_tracking.sql
mysql -u root -p csm_pro < database/migrations/027_add_staff_referral_flag.sql
```

### 2. Verify Discounts Exist

Check that both discounts exist:

```sql
SELECT * FROM discounts WHERE discount_name IN ('Student Discount $300', 'Staff Referral Coupon $500');
-- Should show:
-- id=1, Student Discount $300, Fixed, 300.00, is_active=TRUE
-- id=2, Staff Referral Coupon $500, Fixed, 500.00, is_active=TRUE
```

### 3. Sync AppSheet

- Go to **Data** → **Regenerate Structure**
- Verify `student_coupons` table appears

### 4. Mark Staff Referral Students (if any)

In AppSheet or MySQL, flag students who are staff relatives:

**In AppSheet:**
- Edit student record
- Set `is_staff_referral` = TRUE
- Add note in `staff_referral_notes` (e.g., "Daughter of Teacher Wong")

**In MySQL:**
```sql
UPDATE students
SET is_staff_referral = TRUE,
    staff_referral_notes = 'Son of Teacher ABC'
WHERE id = ?;
```

### 5. Install Python Libraries (for processing script)

```bash
pip3 install pandas openpyxl xlrd
```

---

## Regular Use: Upload Coupon Data

### Every Week/Month when company system updates:

**Method 1: Automated Script (Recommended - 2 minutes)**

```bash
cd "/mnt/c/Users/asus/GitHub Repo/tutoring-management-system"

# Step 1: Allowlist your IP (in one terminal)
gcloud sql connect [INSTANCE_NAME] --user=root --project=[PROJECT_ID]
# Wait for: "Allowlisting your IP for incoming connection for 5 minutes...done"

# Step 2: Run sync script (in another terminal, within 5 minutes)
./scripts/sync_coupons.sh "TerminationList_MSA_2025-11-01_20251004054509.xls"
```

The script will:
- Process the Excel file
- Show preview
- Ask for confirmation
- Apply to database
- Verify the sync

✅ Done! Coupon data updated.

---

**Method 2: Manual Process (Original - 5 minutes)**

```bash
cd "/mnt/c/Users/asus/GitHub Repo/tutoring-management-system"

# Step 1: Run Processing Script
python3 scripts/process_coupons.py "TerminationList_MSA_2025-11-01_20251004054509.xls"
```

**Step 2: Review Generated SQL**

Open `coupon_updates_YYYYMMDD_HHMMSS.sql` and check:
- Total students looks right
- Sample records make sense

**Step 3: Allowlist IP and Apply to Database**

```bash
# Allowlist IP (5-minute window)
gcloud sql connect [INSTANCE_NAME] --user=root --project=[PROJECT_ID]

# Apply within 5 minutes
mysql -h localhost -P 3306 -u root -p csm_db < coupon_updates_20251004_120000.sql
```

**Step 4: Commit Transaction**

```sql
-- In MySQL:
COMMIT;
```

✅ Done! Coupon data updated.

---

## How Renewal Works (No Extra Steps!)

### Before (Manual):
1. Check company system for coupons
2. Remember if student has coupon or is staff referral
3. Manually select correct discount during renewal
4. Hope you didn't make a mistake

### After (Automatic):

**Scenario 1: Staff Referral Student**
1. Click **Renew** in AppSheet
2. System checks: is_staff_referral = TRUE ✅
3. Discount auto-fills: "Staff Referral Coupon $500"
4. Confirm renewal
5. Done! (Unlimited, every time)

**Scenario 2: Regular Student with Coupon**
1. Click **Renew** in AppSheet
2. System checks: Student has 2 coupons ✅
3. Discount auto-fills: "Student Discount $300"
4. Confirm renewal
5. Mark coupon used in company system
6. Next sync: Coupon count 2 → 1
7. Done!

**Scenario 3: No Discount**
1. Click **Renew** in AppSheet
2. System checks: No staff flag, no coupons
3. Discount field: Blank (or manually select other discount)
4. Confirm renewal
5. Done!

---

## Modify Renewal Action (AppSheet)

### Add Discount Check Variables

In your renewal action, add these before creating new enrollment:

**Variable 1:** `_is_staff_referral`
**Expression:**
```
[student_id].[is_staff_referral]
```

**Variable 2:** `_has_regular_coupon`
**Expression:**
```
LOOKUP([student_id], "student_coupons", "student_id", "available_coupons") > 0
```

### Set Discount Automatically (Priority Logic)

When creating new enrollment:

**discount_id field:**
```
IF(
  [_is_staff_referral],
  LOOKUP("Staff Referral Coupon $500", "discounts", "discount_name", "id"),
  IF(
    [_has_regular_coupon],
    LOOKUP("Student Discount $300", "discounts", "discount_name", "id"),
    ""
  )
)
```

**Priority:**
1. Staff referral students → $500 discount (unlimited, every time)
2. Students with coupons → $300 discount (limited, from company system)
3. No discount → Blank

**Important:** After renewal with regular coupon, mark it used in company system. Next sync shows updated count. Staff referrals don't consume coupons.

---

## Check Who Has Coupons

### In AppSheet:

View `students_with_coupons` table to see:
- Student name
- Available coupons
- Last updated

### In MySQL:

```sql
SELECT
    student_name,
    available_coupons,
    last_updated_at
FROM students_with_coupons
WHERE available_coupons > 0
ORDER BY student_name;
```

---

## Troubleshooting

### Coupon Not Auto-Applying

**Check:**
1. Student has coupon in `student_coupons` table
2. Discount "Student Discount $300" exists and is_active = TRUE
3. Renewal action has coupon check logic

### Student Missing from Coupon Update

**Likely cause:** Company ID doesn't match

**Example:**
- File shows: MSA1395
- Database has: home_location=MS, school_student_id=1395 ❌

**Fix:** Ensure home_location + school_student_id matches file exactly

### Script Fails to Read Excel

**Quick fix:** Convert to CSV in Excel first
1. Open .xls file
2. File → Save As → CSV
3. Run script on .csv file instead

---

## Key Points

✅ **Discount priority:** Staff $500 > Regular coupon $300 > No discount
✅ **Staff referrals:** Unlimited $500 every enrollment (flag manually)
✅ **Regular coupons:** Limited $300 from company system
✅ **One discount per enrollment** (even if student has multiple coupons)
✅ **Company system is source of truth** - we only sync from it
✅ **Upload weekly/monthly** as company system updates
✅ **2-minute sync process** once setup
✅ **After renewal:** Mark coupon used in company system, next sync updates count

---

## Files Reference

- Migration: `database/migrations/026_add_student_coupon_tracking.sql`
- Script: `scripts/process_coupons.py`
- Full Docs: `docs/coupon-tracking-setup.md`
- This Guide: `docs/coupon-quick-start.md`

---

## Support

**Common Commands:**

```bash
# Process new coupon file
python3 scripts/process_coupons.py "latest_file.xls"

# Apply updates
mysql -u root -p csm_pro < coupon_updates_TIMESTAMP.sql

# Check current coupons
mysql -u root -p csm_pro -e "SELECT COUNT(*), SUM(available_coupons) FROM student_coupons;"

# View students with coupons
mysql -u root -p csm_pro -e "SELECT * FROM students_with_coupons WHERE available_coupons > 0;"
```

That's it! 🎉
