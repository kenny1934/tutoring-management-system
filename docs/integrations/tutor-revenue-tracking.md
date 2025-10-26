# Tutor Revenue Tracking

## Overview

Calculate tutor monthly revenue for salary calculations based on attended sessions.

**Revenue Formula:**
- Enrollment tutor revenue = (Base fee × Lessons paid) - Discount
- Cost per session = Tutor revenue ÷ Lessons paid
- Monthly revenue = Sum of all attended session costs

**Note:** Registration fee ($100) is NOT counted toward tutor revenue.

---

## Setup (One-Time)

### 1. Run Migration

```bash
mysql -u root -p csm_pro < database/migrations/030_add_tutor_revenue_tracking.sql
```

### 2. Add to AppSheet

**Data** → **Regenerate Structure**

New views appear:
- `tutor_monthly_revenue` (summary by month)
- `tutor_monthly_revenue_details` (individual sessions)
- `enrollment_costs` (enrollment breakdown)
- `session_costs` (session-by-session)

---

## Views Available

### 1. `tutor_monthly_revenue` (Main View)

**Use for:** Monthly salary calculations

**Columns:**
- `tutor_name`
- `session_period` (e.g., "2025-09")
- `sessions_count` (how many sessions taught)
- `total_revenue` (total revenue for the month)
- `avg_revenue_per_session`

**Example: September 2025 all tutors**
```sql
SELECT * FROM tutor_monthly_revenue
WHERE session_year = 2025 AND session_month = 9
ORDER BY total_revenue DESC;
```

### 2. `tutor_monthly_revenue_details`

**Use for:** Drill-down into individual sessions

**Columns:**
- `session_id` (reference to session in CSM Pro)
- `student_id`
- `tutor_id`
- `tutor_name`
- `session_date`
- `time_slot`
- `student_name` (formatted as "MSA-1601 Sammi Wright")
- `session_status`
- `cost_per_session`
- `enrollment_id`

**Example: Teacher A's September sessions**
```sql
SELECT * FROM tutor_monthly_revenue_details
WHERE tutor_name = 'Teacher A'
  AND session_period = '2025-09'
ORDER BY session_date;
```

### 3. `enrollment_costs`

**Use for:** Understanding enrollment revenue breakdown

**Columns:**
- `enrollment_id`
- `base_fee` (400 × lessons_paid)
- `discount_amount`
- `reg_fee` (100 for new students, 0 otherwise)
- `final_fee` (what student pays)
- `tutor_revenue_total` (excludes reg fee)
- `cost_per_session`

### 4. `session_costs`

**Use for:** Individual session revenue

**Columns:**
- `session_id`
- `student_id`
- `session_date`
- `student_name_formatted` (e.g., "MSA-1601 Sammi Wright")
- `student_name` (just name)
- `tutor_name`
- `cost_per_session`
- `session_status`

---

## AppSheet Usage

### Option 1: View in AppSheet

1. Add `tutor_monthly_revenue` as a table view
2. Create slices for specific months:
   ```
   [session_period] = "2025-09"
   ```
3. Sort by `total_revenue` descending

### Option 2: Export for Excel

1. Filter `tutor_monthly_revenue` by month
2. Export to CSV/Excel
3. Use for payroll calculations

### Option 3: Add to Tutor Profile

Add virtual column to tutors table:

**VC: Current Month Revenue**
```
SUM(
  SELECT(tutor_monthly_revenue[total_revenue],
    AND(
      [tutor_id] = [_THISROW].[id],
      [session_year] = YEAR(TODAY()),
      [session_month] = MONTH(TODAY())
    )
  )
)
```

**VC: Last Month Revenue**
```
SUM(
  SELECT(tutor_monthly_revenue[total_revenue],
    AND(
      [tutor_id] = [_THISROW].[id],
      [session_year] = YEAR(EOMONTH(TODAY(), -1)),
      [session_month] = MONTH(EOMONTH(TODAY(), -1))
    )
  )
)
```

---

## Revenue Calculation Examples

### Example 1: Regular Enrollment

**Enrollment:**
- Base fee: $400/lesson
- Lessons paid: 6
- Discount: $300
- New student: No

**Calculation:**
- Student pays: (400 × 6) - 300 + 0 = $2,100
- Tutor revenue: (400 × 6) - 300 = $2,100
- Cost per session: $2,100 ÷ 6 = $350

**If tutor teaches all 6 sessions:**
- Monthly revenue = 6 × $350 = $2,100

### Example 2: New Student with Discount

**Enrollment:**
- Base fee: $400/lesson
- Lessons paid: 8
- Discount: $300
- New student: Yes

**Calculation:**
- Student pays: (400 × 8) - 300 + 100 = $3,000
- Tutor revenue: (400 × 8) - 300 = $2,900 (reg fee excluded)
- Cost per session: $2,900 ÷ 8 = $362.50

**If tutor teaches 5 sessions in September:**
- Monthly revenue = 5 × $362.50 = $1,812.50

### Example 3: Staff Referral

**Enrollment:**
- Base fee: $400/lesson
- Lessons paid: 6
- Discount: $500
- New student: No

**Calculation:**
- Student pays: (400 × 6) - 500 + 0 = $1,900
- Tutor revenue: (400 × 6) - 500 = $1,900
- Cost per session: $1,900 ÷ 6 = $316.67

---

## Countable Session Statuses

**Revenue counts for:**
- ✅ `Attended`
- ✅ `Attended (Make-up)`
- ✅ `No Show`

**Revenue does NOT count for:**
- ❌ `Scheduled`
- ❌ `Rescheduled - Pending Make-up`
- ❌ `Rescheduled - Make-up Booked`
- ❌ `Cancelled`

**Logic:** Tutor gets paid for sessions where they showed up and took attendance, even if student was a no-show.

---

## Troubleshooting

### Revenue looks wrong for an enrollment

**Check:**
1. Is `payment_status = 'Paid'` or `'Pending Payment'`?
2. Is `discount_id` linked correctly?
3. Is `is_new_student` flag set correctly?
4. Are sessions linked to correct `enrollment_id`?

### Tutor has 0 revenue but taught sessions

**Check:**
1. Are sessions' `session_status` in countable list?
2. Are sessions linked to an enrollment (`enrollment_id NOT NULL`)?
3. Is enrollment `payment_status` valid (not Cancelled)?

### Session not counting

**Check:**
1. `session_status` must be 'Attended', 'Attended (Make-up)', or 'No Show'
2. `enrollment_id` must be set
3. Enrollment must have `payment_status IN ('Paid', 'Pending Payment')`

---

## Files

- Migration: `database/migrations/030_add_tutor_revenue_tracking.sql`
- This Guide: `docs/tutor-revenue-tracking.md`

---

## Quick Reference SQL

```sql
-- September 2025 all tutors
SELECT tutor_name, sessions_count, total_revenue
FROM tutor_monthly_revenue
WHERE session_period = '2025-09'
ORDER BY total_revenue DESC;

-- Specific tutor for a month
SELECT * FROM tutor_monthly_revenue_details
WHERE tutor_name = 'Teacher A' AND session_period = '2025-09';

-- Year-to-date for a tutor
SELECT
    session_period,
    sessions_count,
    total_revenue
FROM tutor_monthly_revenue
WHERE tutor_name = 'Teacher A' AND session_year = 2025
ORDER BY session_month;
```

---

That's it! 🎉
