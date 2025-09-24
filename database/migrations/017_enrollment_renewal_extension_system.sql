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
    e.assigned_day,
    e.assigned_time,

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

    -- Sessions ready to be attended (scheduled and future)
    (SELECT COUNT(*)
     FROM session_log sl
     WHERE sl.enrollment_id = e.id
     AND sl.session_status IN ('Scheduled', 'Make-up Class', 'Trial Class')
     AND sl.session_date >= CURDATE()) AS sessions_ready_to_attend,

    -- Sessions already completed
    (SELECT COUNT(*)
     FROM session_log sl
     WHERE sl.enrollment_id = e.id
     AND sl.session_status IN ('Attended', 'Attended (Make-up)', 'No Show')) AS sessions_completed,

    -- Count pending make-up sessions (credits to be used but not yet scheduled)
    (SELECT COUNT(*)
     FROM session_log sl
     WHERE sl.enrollment_id = e.id
     AND sl.session_status IN (
         'Rescheduled - Pending Make-up',
         'Sick Leave - Pending Make-up',
         'Weather Cancelled - Pending Make-up'
     )) AS pending_makeups,

    -- Total credits remaining (completed vs paid)
    e.lessons_paid - (
        SELECT COUNT(*)
        FROM session_log sl
        WHERE sl.enrollment_id = e.id
        AND sl.session_status IN ('Attended', 'Attended (Make-up)', 'No Show')
    ) AS total_credits_remaining,

    -- DEPRECATED: Keep for backward compatibility
    (SELECT COUNT(*)
     FROM session_log sl
     WHERE sl.enrollment_id = e.id
     AND sl.session_status = 'Scheduled') AS scheduled_sessions,

    -- DEPRECATED: Total sessions used - use sessions_completed + sessions_ready_to_attend instead
    (SELECT COUNT(*)
     FROM session_log sl
     WHERE sl.enrollment_id = e.id
     AND sl.session_status NOT IN (
         'Rescheduled - Make-up Booked',
         'Sick Leave - Make-up Booked',
         'Weather Cancelled - Make-up Booked',
         'Cancelled'
     )) AS sessions_used,

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
    END AS available_actions,

    -- Flag parallel enrollments (multiple enrollments for same student-tutor)
    (SELECT COUNT(*)
     FROM enrollments e_parallel
     WHERE e_parallel.student_id = e.student_id
     AND e_parallel.tutor_id = e.tutor_id
     AND e_parallel.payment_status = 'Paid'
     AND e_parallel.id != e.id
     -- Check for overlapping enrollment periods (parallel lessons)
     AND DATE_ADD(
         calculate_end_date(e_parallel.first_lesson_date, e_parallel.lessons_paid),
         INTERVAL COALESCE(e_parallel.deadline_extension_weeks, 0) WEEK
     ) >= e.first_lesson_date
     AND e_parallel.first_lesson_date <= DATE_ADD(
         calculate_end_date(e.first_lesson_date, e.lessons_paid),
         INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
     )) AS parallel_enrollments_count,

    -- Display format for admin clarity
    CASE
        WHEN (SELECT COUNT(*)
              FROM enrollments e_p
              WHERE e_p.student_id = e.student_id
              AND e_p.tutor_id = e.tutor_id
              AND e_p.payment_status = 'Paid'
              AND e_p.id != e.id
              AND DATE_ADD(
                  calculate_end_date(e_p.first_lesson_date, e_p.lessons_paid),
                  INTERVAL COALESCE(e_p.deadline_extension_weeks, 0) WEEK
              ) >= e.first_lesson_date) > 0
        THEN CONCAT(s.student_name, ' - ', e.assigned_day, ' ', e.assigned_time)
        ELSE s.student_name
    END AS display_name

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
    ) BETWEEN -7 AND 15
    -- CRITICAL FIX: Only show active enrollments, not old completed ones
    -- This prevents showing historical enrollments that clutter the renewal view
    AND (
        -- Case 1: This is the most recent enrollment for this student-tutor-schedule combo
        e.id = (
            SELECT MAX(e_latest.id)
            FROM enrollments e_latest
            WHERE e_latest.student_id = e.student_id
            AND e_latest.tutor_id = e.tutor_id
            AND e_latest.assigned_day = e.assigned_day
            AND e_latest.assigned_time = e.assigned_time
            AND e_latest.payment_status IN ('Paid', 'Pending Payment')
            -- Only consider enrollments that haven't ended too long ago
            AND DATEDIFF(
                DATE_ADD(
                    calculate_end_date(e_latest.first_lesson_date, e_latest.lessons_paid),
                    INTERVAL COALESCE(e_latest.deadline_extension_weeks, 0) WEEK
                ),
                CURDATE()
            ) >= -30  -- Allow 30 days past end for make-ups
        )
        OR
        -- Case 2: This enrollment has parallel sessions (different day/time for same student-tutor)
        -- and it's the most recent for this specific schedule slot
        EXISTS (
            SELECT 1
            FROM enrollments e_parallel
            WHERE e_parallel.student_id = e.student_id
            AND e_parallel.tutor_id = e.tutor_id
            AND e_parallel.payment_status = 'Paid'
            AND e_parallel.id != e.id
            AND (e_parallel.assigned_day != e.assigned_day OR e_parallel.assigned_time != e.assigned_time)
            -- Check for overlapping periods (true parallel enrollments)
            AND DATE_ADD(
                calculate_end_date(e_parallel.first_lesson_date, e_parallel.lessons_paid),
                INTERVAL COALESCE(e_parallel.deadline_extension_weeks, 0) WEEK
            ) >= e.first_lesson_date
            AND e_parallel.first_lesson_date <= DATE_ADD(
                calculate_end_date(e.first_lesson_date, e.lessons_paid),
                INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
            )
        )
    )
    -- ADDITIONAL FIX: Hide enrollments that have any newer enrollment (Paid OR Pending Payment)
    -- This prevents showing enrollments when renewals are already in progress
    AND NOT EXISTS (
        SELECT 1
        FROM enrollments e_newer
        WHERE e_newer.student_id = e.student_id
        AND e_newer.tutor_id = e.tutor_id
        AND e_newer.assigned_day = e.assigned_day
        AND e_newer.assigned_time = e.assigned_time
        AND e_newer.first_lesson_date > e.first_lesson_date
        AND e_newer.payment_status IN ('Paid', 'Pending Payment')
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