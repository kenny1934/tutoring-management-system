# Student Termination Tracking - AppSheet Setup

## Overview

Track students who have stopped attending and generate quarterly termination reports directly in AppSheet.

**No manual flagging needed** - automatically derived from enrollment data.

---

## Setup (One-Time)

### 1. Run Migration

```bash
mysql -u $DB_USER -p $DB_NAME < database/migrations/028_add_termination_tracking.sql
```

### 2. Add View to AppSheet

**In AppSheet:**

1. **Data** → **Tables** → **Regenerate Structure**
2. Look for new table: `terminated_students`
3. **Show:** YES (make it visible)
4. **Update Mode:** Read Only

### 3. Create AppSheet Views

**A. View: "Terminated Students"**

- **For table:** terminated_students
- **View type:** Table
- **Position:** Primary or Menu
- **Sort by:** termination_date (descending)

**B. Slice: "Q4 2025 Terminations" (Example)**

- **Table:** terminated_students
- **Filter:**
  ```
  AND(
    [termination_year] = 2025,
    [termination_quarter] = 4
  )
  ```

**C. Slice: "Recent Terminations (Last 6 Months)"**

- **Table:** terminated_students
- **Filter:**
  ```
  [months_since_termination] <= 6
  ```

### 4. Add Action: "Generate Quarterly Report"

**Optional:** Create action to export specific quarter

**Action Type:** Go to another view
**Target:** Filtered view of terminated_students for selected quarter

---

## Usage by Admin Team

### View All Terminated Students

1. Go to **Terminated Students** view
2. See all students who have stopped attending
3. Columns shown:
   - Student Name
   - Company ID
   - Termination Date (last lesson date)
   - Last Payment Date
   - Termination Period (e.g., "2025-Q4")
   - Months Since Termination

### Generate Quarterly Report

**Method 1: Using Slices**

1. Create slice for each quarter (as needed)
2. Admin selects the slice for the quarter they need
3. Export or copy the list

**Method 2: Using Format Rules/Filtering**

In the Terminated Students view:

1. Click **Filter** icon
2. Set:
   - `termination_year` = 2025
   - `termination_quarter` = 4
3. View filtered results
4. Export to CSV or Excel

**Method 3: Create Dynamic View with Inputs**

Create a form-style interface:

1. **Form View** with inputs:
   - Year (dropdown or number)
   - Quarter (dropdown: 1, 2, 3, 4)
2. **Action:** Show filtered terminated_students view
3. Admin enters year/quarter → sees results

---

## AppSheet Setup Details

### Option A: Simple Slices (Recommended for Quarterly Reports)

Create 4 permanent slices (one per quarter):

**Slice: "Q1 Terminations"**
```
AND(
  [termination_year] = YEAR(TODAY()),
  [termination_quarter] = 1
)
```

**Slice: "Q2 Terminations"**
```
AND(
  [termination_year] = YEAR(TODAY()),
  [termination_quarter] = 2
)
```

**Slice: "Q3 Terminations"**
```
AND(
  [termination_year] = YEAR(TODAY()),
  [termination_quarter] = 3
)
```

**Slice: "Q4 Terminations"**
```
AND(
  [termination_year] = YEAR(TODAY()),
  [termination_quarter] = 4
)
```

Then create views for each slice.

### Option B: Virtual Columns in Students Table

Add to students table:

**Virtual Column: `is_terminated`**
```
IN([id], terminated_students[student_id])
```

**Virtual Column: `termination_info`**
```
IF(
  [is_terminated],
  LOOKUP([id], "terminated_students", "student_id", "termination_period"),
  ""
)
```

Now you can filter students list to show only terminated students.

---

## Export for Quarterly Submission

### Export Steps:

1. Go to appropriate quarterly slice/view
2. Click **⋮** (three dots)
3. Select **Export to CSV** or **Export to Excel**
4. File includes:
   - Company ID (for company system matching)
   - Student Name
   - Termination Date
   - Last Payment Date

### Format for Company System:

If company system needs specific format, create a custom view with only required columns:

**Columns to show:**
- `company_id`
- `termination_date`
- (any other required fields)

---

## How It Works

**A student is "terminated" when:**

1. They have NO active enrollments (payment_status = 'Paid' or 'Pending Payment' with effective_end_date >= today)
2. Their last enrollment's effective_end_date has passed

**Effective end date calculation:**
- Uses existing `calculate_effective_end_date()` function
- Accounts for holidays automatically
- Accounts for deadline extensions (if granted)
- Formula: first_lesson_date + lessons_paid + extensions - holidays

**Example:**
- First lesson: 2025-10-01
- Lessons paid: 8
- Extensions: 2 weeks
- Holidays during period: 1
- Effective end date: 2025-12-10 (accounting for 1 holiday)
- If today > 2025-12-10 and no new enrollment → Student is terminated

---

## Troubleshooting

### Student Shows as Terminated But Is Still Active

**Check:**
1. Do they have a new enrollment with `payment_status = 'Paid'`?
2. Is `first_lesson_date` set on the new enrollment?
3. Is the new enrollment's `effective_end_date >= today`?

If all YES → They should be in `active_students`, not `terminated_students`

**Fix:** Regenerate AppSheet data or check view query.

### Student Doesn't Show as Terminated

**Check:**
1. All their enrollments have `effective_end_date < today`?
2. `payment_status` is 'Paid' or 'Pending Payment' (not 'Cancelled')?

If YES → They should be in `terminated_students`

**Fix:** Check if they have any active enrollments.

---

## Benefits

✅ **Automatic** - No manual flagging
✅ **Accurate** - Uses actual enrollment end dates with holidays
✅ **Accessible** - Admin team can view in AppSheet
✅ **Exportable** - Easy CSV/Excel export for quarterly submission
✅ **Historical** - Shows when each student terminated
✅ **Re-enrollment tracking** - Students can come back (just create new enrollment)

---

## Files

- Migration: `database/migrations/028_add_termination_tracking.sql`
- This Guide: `docs/termination-tracking-appsheet.md`

---

## Quick Reference

**Common AppSheet Expressions:**

```
// Check if student is terminated
IN([id], terminated_students[student_id])

// Get termination date for student
LOOKUP([id], "terminated_students", "student_id", "termination_date")

// Filter for Q4 2025
AND([termination_year] = 2025, [termination_quarter] = 4)

// Filter for current year, current quarter
AND([termination_year] = YEAR(TODAY()), [termination_quarter] = QUARTER(TODAY()))
```

---

That's it! Your admin team can now view and export termination reports without database access. 🎉
