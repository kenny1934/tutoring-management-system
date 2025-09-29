-- Migration 019: Holiday-Aware Extension Deadline System
-- Purpose: Create holiday-aware effective end date calculation for enrollment extensions
-- Updates the renewal view to properly handle deadline_extension_weeks with holiday awareness

-- ============================================================================
-- CREATE HOLIDAY-AWARE EFFECTIVE END DATE FUNCTION
-- ============================================================================

SELECT 'Creating holiday-aware effective end date function...' as status;

-- Drop function if exists
DROP FUNCTION IF EXISTS calculate_effective_end_date;

-- Create the function to calculate effective end date with extensions and holiday checking
-- Note: If running in a tool that doesn't support stored functions,
-- execute this CREATE FUNCTION block separately in MySQL command line or workbench

CREATE FUNCTION calculate_effective_end_date(
    p_first_lesson_date DATE,
    p_lessons_paid INT,
    p_extension_weeks INT
)
RETURNS DATE
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_end_date DATE;
    DECLARE v_lessons_counted INT DEFAULT 0;
    DECLARE v_current_date DATE;
    DECLARE v_holiday_count INT;
    DECLARE v_total_lesson_dates INT;

    -- Total lesson dates = original paid lessons + extension weeks
    -- Extension weeks represent additional valid lesson dates, not calendar weeks
    SET v_total_lesson_dates = p_lessons_paid + p_extension_weeks;
    SET v_current_date = p_first_lesson_date;

    -- Count valid lesson dates (skipping holidays) until we reach the total
    WHILE v_lessons_counted < v_total_lesson_dates DO
        -- Check if current date is a holiday
        SELECT COUNT(*) INTO v_holiday_count
        FROM holidays
        WHERE holiday_date = v_current_date;

        -- If not a holiday, count this as a valid lesson date
        IF v_holiday_count = 0 THEN
            SET v_lessons_counted = v_lessons_counted + 1;
            SET v_end_date = v_current_date;
        END IF;

        -- Move to next week (same day of week)
        SET v_current_date = DATE_ADD(v_current_date, INTERVAL 1 WEEK);
    END WHILE;

    RETURN v_end_date;
END;

SELECT 'Holiday-aware effective end date function created successfully.' as result;

-- ============================================================================
-- CREATE PERMANENT EFFECTIVE END DATE VIEW FOR VALID IF CONSTRAINTS
-- ============================================================================

SELECT 'Creating enrollment_effective_dates view for Valid If constraints...' as status;

-- This view provides holiday-aware effective end dates for ALL paid enrollments
-- WITHOUT time restrictions, ensuring Valid If constraints always have access
-- to accurate effective_end_date regardless of renewal timing

DROP VIEW IF EXISTS enrollment_effective_dates;

CREATE OR REPLACE VIEW enrollment_effective_dates AS
SELECT
    e.id AS enrollment_id,
    e.student_id,
    e.tutor_id,
    e.first_lesson_date,
    e.lessons_paid,
    e.assigned_day,
    e.assigned_time,
    e.payment_status,
    e.deadline_extension_weeks,

    -- Original end date (what they paid for)
    calculate_end_date(e.first_lesson_date, e.lessons_paid) AS original_end_date,

    -- Holiday-aware effective end date with extensions
    calculate_effective_end_date(
        e.first_lesson_date,
        e.lessons_paid,
        COALESCE(e.deadline_extension_weeks, 0)
    ) AS effective_end_date,

    -- Days remaining in enrollment period
    DATEDIFF(
        calculate_effective_end_date(
            e.first_lesson_date,
            e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
        ),
        CURDATE()
    ) AS days_until_end,

    -- Extension status for display
    CASE
        WHEN COALESCE(e.deadline_extension_weeks, 0) = 0 THEN 'No Extension'
        WHEN COALESCE(e.deadline_extension_weeks, 0) <= 2 THEN 'Standard Extension'
        ELSE 'Extended Period'
    END AS extension_status,

    -- Student and tutor names for convenience
    s.student_name,
    t.tutor_name

FROM enrollments e
JOIN students s ON e.student_id = s.id
JOIN tutors t ON e.tutor_id = t.id
WHERE e.payment_status = 'Paid';
-- CRITICAL: No time filter here - this view must be available for ALL paid enrollments
-- Used by Valid If constraints which must always have access to effective_end_date

SELECT 'enrollment_effective_dates view created successfully.' as result;

-- ============================================================================
-- UPDATE RENEWAL VIEW WITH HOLIDAY-AWARE EXTENSION LOGIC
-- ============================================================================

SELECT 'Updating active_enrollments_needing_renewal view...' as status;

-- Drop the existing view
DROP VIEW IF EXISTS active_enrollments_needing_renewal;

-- Create the updated view with holiday-aware extension logic
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

    -- Calculate holiday-aware effective end date with any extensions
    calculate_effective_end_date(
        e.first_lesson_date,
        e.lessons_paid,
        COALESCE(e.deadline_extension_weeks, 0)
    ) AS effective_end_date,

    -- Days until renewal is needed (based on effective end date)
    DATEDIFF(
        calculate_effective_end_date(
            e.first_lesson_date,
            e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
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
     AND calculate_effective_end_date(
         e_parallel.first_lesson_date,
         e_parallel.lessons_paid,
         COALESCE(e_parallel.deadline_extension_weeks, 0)
     ) >= e.first_lesson_date
     AND e_parallel.first_lesson_date <= calculate_effective_end_date(
         e.first_lesson_date,
         e.lessons_paid,
         COALESCE(e.deadline_extension_weeks, 0)
     )) AS parallel_enrollments_count,

    -- Display format for admin clarity
    CASE
        WHEN (SELECT COUNT(*)
              FROM enrollments e_p
              WHERE e_p.student_id = e.student_id
              AND e_p.tutor_id = e.tutor_id
              AND e_p.payment_status = 'Paid'
              AND e_p.id != e.id
              AND calculate_effective_end_date(
                  e_p.first_lesson_date,
                  e_p.lessons_paid,
                  COALESCE(e_p.deadline_extension_weeks, 0)
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
        calculate_effective_end_date(
            e.first_lesson_date,
            e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
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
                calculate_effective_end_date(
                    e_latest.first_lesson_date,
                    e_latest.lessons_paid,
                    COALESCE(e_latest.deadline_extension_weeks, 0)
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
            AND calculate_effective_end_date(
                e_parallel.first_lesson_date,
                e_parallel.lessons_paid,
                COALESCE(e_parallel.deadline_extension_weeks, 0)
            ) >= e.first_lesson_date
            AND e_parallel.first_lesson_date <= calculate_effective_end_date(
                e.first_lesson_date,
                e.lessons_paid,
                COALESCE(e.deadline_extension_weeks, 0)
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
-- APPSHEET INTEGRATION GUIDANCE
-- ============================================================================

/*
APPSHEET CONFIGURATION GUIDANCE:

1. ADD ENROLLMENT_EFFECTIVE_DATES AS DATA SOURCE:

   In AppSheet:
   - Add "enrollment_effective_dates" view as a new data source
   - This view provides accurate, holiday-aware effective end dates
   - Available for ALL paid enrollments (no time restrictions)

2. CREATE REF RELATIONSHIP IN SESSION_LOG TABLE:

   Column Name: Related_Enrollment_Dates
   Type: Ref
   Referenced Table: enrollment_effective_dates
   Formula: [enrollment_id]

   This creates a relationship that allows session_log to access effective_end_date
   from the enrollment_effective_dates view.

3. UPDATED VALID IF FOR SESSION_LOG.SESSION_DATE:

   AND(
     NOT(IN([session_date], holidays[holiday_date])),
     [session_date] <= [_THISROW_BEFORE].[session_date] + 60,
     NOT(
       AND(
         [session_date] > [Related_Enrollment_Dates].[effective_end_date],
         [time_slot] = [enrollment_id].[assigned_time],
         TEXT([session_date], "ddd") = [enrollment_id].[assigned_day]
       )
     )
   )

   Note: Uses [Related_Enrollment_Dates].[effective_end_date] instead of virtual column

4. ENHANCED ERROR MESSAGE:

   IF(
     IN([session_date], holidays[holiday_date]),
     "Rescheduling not allowed: The selected date is a holiday.",
     IF(
       [session_date] > [_THISROW_BEFORE].[session_date] + 60,
       "Rescheduling not allowed: Lessons must be made up within 60 days of the original date. Please select an earlier date.",
       IF(
         AND(
           [session_date] > [Related_Enrollment_Dates].[effective_end_date],
           [time_slot] = [enrollment_id].[assigned_time],
           TEXT([session_date], "ddd") = [enrollment_id].[assigned_day]
         ),
         CONCATENATE(
           "Cannot schedule regular sessions after enrollment period ends on ",
           TEXT([Related_Enrollment_Dates].[effective_end_date], "MMM DD, YYYY"),
           IF(
             [Related_Enrollment_Dates].[deadline_extension_weeks] > 0,
             CONCATENATE(" (includes ", [Related_Enrollment_Dates].[deadline_extension_weeks], "-week extension)"),
             ""
           ),
           ". For sessions beyond this date, please apply for a deadline extension or renew the enrollment."
         ),
         ""
       )
     )
   )

5. ADMIN ACTION: GRANT EXTENSION

   Action Name: "Grant 2-Week Extension"
   For: Enrollments table
   Condition: AND([payment_status] = "Paid", [deadline_extension_weeks] < 2)
   Updates:
     - deadline_extension_weeks: [deadline_extension_weeks] + 2
     - extension_notes: CONCATENATE([extension_notes], CHAR(10), TEXT(NOW(), "yyyy-mm-dd HH:mm"), ": +2 weeks extension granted by ", USEREMAIL())
     - last_extension_date: TODAY()
     - extension_granted_by: USEREMAIL()

6. EXTENSION STATUS DISPLAY

   Virtual Column Name: _extension_status_display
   Type: Text
   Formula:
   IF(
     [deadline_extension_weeks] = 0,
     "",
     CONCATENATE("Extended by ", [deadline_extension_weeks], " weeks until ", TEXT([Related_Enrollment_Dates].[effective_end_date], "MMM DD"))
   )

7. BENEFITS OF ENROLLMENT_EFFECTIVE_DATES VIEW:

   ✅ Always Available: No time filters, works for ALL paid enrollments
   ✅ 100% Accurate: Uses same MySQL function as renewal view
   ✅ Holiday-Aware: Properly handles holidays in extension calculations
   ✅ Lightweight: Only essential columns, minimal database overhead
   ✅ Decoupled: Valid If doesn't depend on renewal dashboard filters
   ✅ Future-Proof: Works regardless of how extension periods evolve

WORKFLOW:
1. Student has pending makeups approaching enrollment end date
2. Admin reviews active_enrollments_needing_renewal view
3. Admin grants extension using the action button
4. deadline_extension_weeks field is updated
5. effective_end_date automatically recalculates (holiday-aware)
6. Valid If allows rescheduling within extended period
7. Clear error messages guide users on limitations

TESTING SCENARIOS:
- Test with enrollment ending during holiday period
- Test extension that would span multiple holidays
- Verify rescheduling is blocked appropriately at boundaries
- Test error messages provide clear guidance
*/

-- ============================================================================
-- TESTING QUERIES (OPTIONAL)
-- ============================================================================

/*
-- Test the function with sample scenarios:

-- Test 1: No extension
SELECT
    'No Extension Test' as scenario,
    calculate_end_date('2025-01-01', 12) as original_end,
    calculate_effective_end_date('2025-01-01', 12, 0) as effective_end,
    'Should be same' as expected;

-- Test 2: 2-week extension
SELECT
    '2-Week Extension Test' as scenario,
    calculate_end_date('2025-01-01', 12) as original_end,
    calculate_effective_end_date('2025-01-01', 12, 2) as effective_end,
    'Should be 2 weeks later (skipping holidays)' as expected;

-- Test 3: Extension during holiday period
SELECT
    'Holiday Period Extension' as scenario,
    calculate_end_date('2024-12-01', 8) as original_end,
    calculate_effective_end_date('2024-12-01', 8, 2) as effective_end,
    'Should skip Christmas and CNY holidays' as expected;
*/

SELECT 'Migration 019: Holiday-aware extension deadline system completed successfully.' as result;