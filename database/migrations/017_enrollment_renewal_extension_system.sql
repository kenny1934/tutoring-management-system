-- Migration 017: Enrollment Renewal System with Extension Support
-- Purpose: Add deadline extension capability for enrollments and fix renewal view logic

-- ============================================================================
-- ADD EXTENSION TRACKING FIELDS TO ENROLLMENTS
-- ============================================================================

SELECT 'Adding extension tracking fields to enrollments table...' as status;

ALTER TABLE enrollments
ADD COLUMN deadline_extension_weeks INT DEFAULT 0 COMMENT 'Number of weeks deadline extended (0-2 standard, >2 special case)',
ADD COLUMN extension_notes TEXT COMMENT 'Audit trail of extension reasons and history',
ADD COLUMN last_extension_date DATE COMMENT 'Date when last extension was granted',
ADD COLUMN extension_granted_by VARCHAR(255) COMMENT 'Email of admin who granted extension';

-- Add index for performance on renewal queries
CREATE INDEX idx_enrollments_extension_lookup ON enrollments(payment_status, deadline_extension_weeks);

SELECT 'Extension tracking fields added successfully.' as result;

-- ============================================================================
-- UPDATE RENEWAL VIEW WITH EXTENSION LOGIC
-- ============================================================================

SELECT 'Updating active_enrollments_needing_renewal view...' as status;

-- Drop the existing view
DROP VIEW IF EXISTS active_enrollments_needing_renewal;

-- Create the updated view with proper renewal and extension logic
CREATE OR REPLACE VIEW active_enrollments_needing_renewal AS
SELECT
    e.id AS enrollment_id,
    e.student_id,
    e.tutor_id,
    e.lessons_paid,
    e.first_lesson_date,
    e.payment_status,
    e.deadline_extension_weeks,
    e.extension_notes,
    e.last_extension_date,
    e.extension_granted_by,
    s.student_name,
    s.phone,
    t.tutor_name,

    -- Calculate original end date (what they paid for)
    calculate_end_date(e.first_lesson_date, e.lessons_paid) AS original_end_date,

    -- Calculate effective end date with any extensions
    DATE_ADD(
        calculate_end_date(e.first_lesson_date, e.lessons_paid),
        INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
    ) AS effective_end_date,

    -- Days until renewal is needed
    DATEDIFF(
        DATE_ADD(
            calculate_end_date(e.first_lesson_date, e.lessons_paid),
            INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
        ),
        CURDATE()
    ) AS days_until_renewal,

    -- Count scheduled sessions remaining
    (SELECT COUNT(*)
     FROM session_log sl
     WHERE sl.enrollment_id = e.id
     AND sl.session_status = 'Scheduled') AS scheduled_sessions,

    -- Count pending make-up sessions (credits to be used)
    (SELECT COUNT(*)
     FROM session_log sl
     WHERE sl.enrollment_id = e.id
     AND sl.session_status IN (
         'Rescheduled - Pending Make-up',
         'Sick Leave - Pending Make-up',
         'Weather Cancelled - Pending Make-up'
     )) AS pending_makeups,

    -- Total sessions used (real sessions that consumed credits)
    (SELECT COUNT(*)
     FROM session_log sl
     WHERE sl.enrollment_id = e.id
     AND sl.session_status NOT IN (
         'Rescheduled - Make-up Booked',
         'Sick Leave - Make-up Booked',
         'Weather Cancelled - Make-up Booked',
         'Cancelled'
     )) AS sessions_used,

    -- Calculate remaining lesson credits
    e.lessons_paid - (
        SELECT COUNT(*)
        FROM session_log sl
        WHERE sl.enrollment_id = e.id
        AND sl.session_status NOT IN (
            'Rescheduled - Make-up Booked',
            'Sick Leave - Make-up Booked',
            'Weather Cancelled - Make-up Booked',
            'Cancelled'
        )
    ) AS lesson_credits_remaining,

    -- Extension status for admin guidance
    CASE
        WHEN COALESCE(e.deadline_extension_weeks, 0) = 0 THEN 'No Extension'
        WHEN COALESCE(e.deadline_extension_weeks, 0) <= 2 THEN 'Standard Extension'
        WHEN COALESCE(e.deadline_extension_weeks, 0) <= 4 THEN 'Extended (Review Required)'
        ELSE 'Special Case (Management Review)'
    END AS extension_status,

    -- Action guidance for admins
    CASE
        WHEN COALESCE(e.deadline_extension_weeks, 0) = 0 AND
             (SELECT COUNT(*) FROM session_log sl
              WHERE sl.enrollment_id = e.id
              AND sl.session_status IN (
                  'Rescheduled - Pending Make-up',
                  'Sick Leave - Pending Make-up',
                  'Weather Cancelled - Pending Make-up'
              )) > 0
        THEN 'Can Grant Extension'
        WHEN COALESCE(e.deadline_extension_weeks, 0) > 0 AND
             COALESCE(e.deadline_extension_weeks, 0) < 2
        THEN 'Can Extend More'
        WHEN COALESCE(e.deadline_extension_weeks, 0) >= 2
        THEN 'Max Extension Reached'
        ELSE 'Renew Only'
    END AS available_actions

FROM enrollments e
JOIN students s ON e.student_id = s.id
JOIN tutors t ON e.tutor_id = t.id
WHERE
    -- Only show paid enrollments
    e.payment_status = 'Paid'
    -- Show enrollments within 14 days of renewal (or up to 7 days overdue)
    AND DATEDIFF(
        DATE_ADD(
            calculate_end_date(e.first_lesson_date, e.lessons_paid),
            INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
        ),
        CURDATE()
    ) BETWEEN -7 AND 14
    -- Exclude if next enrollment already exists (student already renewed)
    AND NOT EXISTS (
        SELECT 1
        FROM enrollments e2
        WHERE e2.student_id = e.student_id
        AND e2.tutor_id = e.tutor_id
        AND e2.first_lesson_date > e.first_lesson_date
        AND e2.payment_status IN ('Paid', 'Unpaid')
    )
ORDER BY days_until_renewal ASC;

SELECT 'Updated active_enrollments_needing_renewal view created successfully.' as result;

-- ============================================================================
-- APPSHEET INTEGRATION NOTES
-- ============================================================================

/*
APPSHEET CONFIGURATION GUIDANCE:

1. VIRTUAL COLUMNS IN ENROLLMENTS TABLE:
   - Effective_End_Date: calculate_end_date([first_lesson_date], [lessons_paid] + [deadline_extension_weeks])
   - Days_Until_Renewal: [Effective_End_Date] - TODAY()
   - Has_Pending_Makeups: COUNT(SELECT(...pending make-up sessions...)) > 0
   - Extension_Status: IF([deadline_extension_weeks] = 0, "No Extension", ...)

2. ACTIONS FOR ADMIN USE:

   Action: Grant Standard Extension
   - For: Enrollments table
   - Condition: [Has_Pending_Makeups] = TRUE AND [deadline_extension_weeks] < 2
   - Updates:
     * deadline_extension_weeks: [deadline_extension_weeks] + 2
     * extension_notes: CONCATENATE([extension_notes], CHAR(10), TEXT(NOW()), ": +2 weeks - Standard extension")
     * last_extension_date: TODAY()
     * extension_granted_by: USEREMAIL()

   Action: Convert Pending Makeup to Scheduled
   - For: Session_Log table
   - Condition: IN([session_status], LIST("Rescheduled - Pending Make-up", "Sick Leave - Pending Make-up", "Weather Cancelled - Pending Make-up"))
   - Updates:
     * session_status: "Scheduled"
     * notes: CONCATENATE([notes], " | Converted from pending - Extension granted")

3. SLICES:
   - Enrollments_Needing_Renewal: Based on active_enrollments_needing_renewal view
   - Filter: [days_until_renewal] <= 14

4. DASHBOARD VIEW:
   Display columns: student_name, days_until_renewal, scheduled_sessions, pending_makeups, extension_status, available_actions

5. BOT AUTOMATION (Optional):
   - Daily reminder bot for enrollments with days_until_renewal = 7
   - Email/notification to admin team

EXAMPLE ADMIN WORKFLOW:
1. Open Renewal Dashboard
2. See student with pending make-ups approaching renewal
3. Click "Grant Extension" action
4. Navigate to Sessions view for that enrollment
5. Convert pending make-ups to scheduled as needed
6. System automatically extends renewal deadline by 2 weeks
*/

-- ============================================================================
-- EXAMPLE USAGE SCENARIOS
-- ============================================================================

/*
SCENARIO 1: Standard 2-week extension
- Student has 2 pending make-ups near enrollment end
- Admin grants extension: UPDATE enrollments SET deadline_extension_weeks = 2 WHERE id = X
- Renewal deadline pushed out 2 weeks
- Admin converts 2 pending make-ups to scheduled sessions

SCENARIO 2: Special case extension
- Student hospitalized, needs 4-week extension
- Admin sets: deadline_extension_weeks = 4, extension_notes = "Medical emergency - hospitalized"
- Shows as "Extended (Review Required)" in view

SCENARIO 3: Multiple small extensions
- Week 1: Grant 1 week (deadline_extension_weeks = 1)
- Week 3: Grant 1 more week (deadline_extension_weeks = 2)
- Shows as "Standard Extension" since total = 2 weeks

BUSINESS RULES:
- Standard extensions: 0-2 weeks (admin level)
- Extended cases: 3-4 weeks (review recommended)
- Special cases: 5+ weeks (management approval)
- Extensions don't create new sessions, only extend deadlines
- Students must use existing credits (scheduled + pending makeups) within extended time
*/

SELECT 'Migration 017: Enrollment renewal system with extension support completed successfully.' as result;