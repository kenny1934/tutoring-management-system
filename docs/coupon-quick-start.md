# Coupon Auto-Discount - Quick Start Guide

## What This Does

Automatically applies $300 discount during enrollment renewal if student has coupons available.

---

## Setup (One-Time - 15 minutes)

### 1. Run Database Migration

```bash
mysql -u root -p csm_pro < database/migrations/026_add_student_coupon_tracking.sql
```

### 2. Verify $300 Discount Exists

Check that "Student Discount $300" exists in discounts table:

```sql
SELECT * FROM discounts WHERE discount_name = 'Student Discount $300';
-- Should show: id=1, discount_type='Fixed', discount_value=300.00, is_active=TRUE
```

### 3. Sync AppSheet

- Go to **Data** → **Regenerate Structure**
- Verify `student_coupons` table appears

### 4. Install Python Libraries (for processing script)

```bash
pip3 install pandas openpyxl xlrd
```

---

## Regular Use: Upload Coupon Data (5 minutes)

### Every Week/Month when company system updates:

**Step 1: Run Processing Script**

```bash
cd "/mnt/c/Users/asus/GitHub Repo/tutoring-management-system"

python3 scripts/process_coupons.py "TerminationList_MSA_2025-11-01_20251004054509.xls"
```

**Step 2: Review Generated SQL**

Open `coupon_updates_YYYYMMDD_HHMMSS.sql` and check:
- Total students looks right
- Sample records make sense

**Step 3: Apply to Database**

```bash
mysql -u root -p csm_pro < coupon_updates_20251004_120000.sql
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
2. Remember if student has coupon
3. Manually select discount during renewal
4. Hope you didn't make a mistake

### After (Automatic):
1. Click **Renew** in AppSheet
2. System checks: Student has 2 coupons ✅
3. Discount auto-fills: "Student Discount $300"
4. Confirm renewal
5. Mark coupon used in company system
6. Next sync: Coupon count 2 → 1
7. Done!

---

## Modify Renewal Action (AppSheet)

### Add Coupon Check

In your renewal action, add this before creating new enrollment:

**Variable:** `_has_coupon`
**Expression:**
```
LOOKUP([student_id], "student_coupons", "student_id", "available_coupons") > 0
```

### Set Discount Automatically

When creating new enrollment:

**discount_id field:**
```
IF(
  [_has_coupon],
  LOOKUP("Student Discount $300", "discounts", "discount_name", "id"),
  ""
)
```

**Important:** After renewal, mark the coupon as used in your company system. The next coupon sync will reflect the updated count.

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

✅ **Coupons = $300 discount** (99% of cases)
✅ **One coupon per enrollment** (even if student has multiple)
✅ **Company system is source of truth** - we only sync from it
✅ **Upload weekly/monthly** as company system updates
✅ **5-minute process** once setup
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
