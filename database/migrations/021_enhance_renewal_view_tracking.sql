-- Migration 021: Enhance Renewal View with Renewal Status Tracking
-- Purpose: Prevent duplicate renewals and provide easy navigation to renewal enrollments
-- Adds explicit renewal link field and columns to track renewal status

-- ============================================================================
-- ADD EXPLICIT RENEWAL LINK TO ENROLLMENTS TABLE
-- ============================================================================

SELECT 'Adding renewed_from_enrollment_id column to enrollments table...' as status;

-- Add column to explicitly link renewal enrollments to their predecessor
ALTER TABLE enrollments
ADD COLUMN renewed_from_enrollment_id INT NULL
COMMENT 'Links to the previous enrollment that this renewal continues (NULL if this is a new/first enrollment)';

-- Add foreign key constraint for data integrity
ALTER TABLE enrollments
ADD CONSTRAINT fk_enrollment_renewal
FOREIGN KEY (renewed_from_enrollment_id) REFERENCES enrollments(id)
ON DELETE SET NULL;  -- If old enrollment deleted, just clear the link

-- Add index for performance on renewal queries
CREATE INDEX idx_renewed_from ON enrollments(renewed_from_enrollment_id);

SELECT 'renewed_from_enrollment_id column added successfully.' as result;

-- ============================================================================
-- ADD ENROLLMENT TYPE FIELD
-- ============================================================================

SELECT 'Adding enrollment_type column to enrollments table...' as status;

-- Add column to distinguish between different enrollment types
ALTER TABLE enrollments
ADD COLUMN enrollment_type VARCHAR(50) DEFAULT 'Regular'
COMMENT 'Type of enrollment: Regular (ongoing weekly), One-Time (single session/test prep), Trial (prospective student evaluation)';

-- Add index for filtering by enrollment type
CREATE INDEX idx_enrollment_type ON enrollments(enrollment_type);

SELECT 'enrollment_type column added successfully.' as result;

-- ============================================================================
-- UPDATE RENEWAL VIEW WITH RENEWAL TRACKING
-- ============================================================================

SELECT 'Updating active_enrollments_needing_renewal view with renewal tracking...' as status;

-- Drop the existing view
DROP VIEW IF EXISTS active_enrollments_needing_renewal;

-- Create the updated view with renewal tracking columns
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

    -- Calculate holiday-aware effective end date with any extensions (calendar-based)
    calculate_effective_end_date(
        e.first_lesson_date,
        e.lessons_paid,
        COALESCE(e.deadline_extension_weeks, 0)
    ) AS calculated_end_date,

    -- Get last active session date (includes scheduled, attended, and pending makeups)
    (SELECT MAX(sl.session_date)
     FROM session_log sl
     WHERE sl.enrollment_id = e.id
     AND sl.session_status IN (
         'Scheduled', 'Make-up Class',
         'Attended', 'Attended (Make-up)',
         'Rescheduled - Pending Make-up',
         'Sick Leave - Pending Make-up',
         'Weather Cancelled - Pending Make-up'
     )
    ) AS last_active_session_date,

    -- Actual effective end date: whichever is earlier (real progress vs calculated)
    -- This enables preemptive renewal reminders based on actual session progress
    LEAST(
        COALESCE(
            (SELECT MAX(sl.session_date)
             FROM session_log sl
             WHERE sl.enrollment_id = e.id
             AND sl.session_status IN (
                 'Scheduled', 'Make-up Class',
                 'Attended', 'Attended (Make-up)',
                 'Rescheduled - Pending Make-up',
                 'Sick Leave - Pending Make-up',
                 'Weather Cancelled - Pending Make-up'
             )),
            calculate_effective_end_date(
                e.first_lesson_date,
                e.lessons_paid,
                COALESCE(e.deadline_extension_weeks, 0)
            )
        ),
        calculate_effective_end_date(
            e.first_lesson_date,
            e.lessons_paid,
            COALESCE(e.deadline_extension_weeks, 0)
        )
    ) AS actual_effective_end_date,

    -- Days until renewal is needed (based on actual effective end date)
    DATEDIFF(
        LEAST(
            COALESCE(
                (SELECT MAX(sl.session_date)
                 FROM session_log sl
                 WHERE sl.enrollment_id = e.id
                 AND sl.session_status IN (
                     'Scheduled', 'Make-up Class',
                     'Attended', 'Attended (Make-up)',
                     'Rescheduled - Pending Make-up',
                     'Sick Leave - Pending Make-up',
                     'Weather Cancelled - Pending Make-up'
                 )),
                calculate_effective_end_date(
                    e.first_lesson_date,
                    e.lessons_paid,
                    COALESCE(e.deadline_extension_weeks, 0)
                )
            ),
            calculate_effective_end_date(
                e.first_lesson_date,
                e.lessons_paid,
                COALESCE(e.deadline_extension_weeks, 0)
            )
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
    -- Uses actual_effective_end_date logic to detect true overlaps based on real session progress
    (SELECT COUNT(*)
     FROM enrollments e_parallel
     WHERE e_parallel.student_id = e.student_id
     AND e_parallel.tutor_id = e.tutor_id
     AND e_parallel.payment_status = 'Paid'
     AND e_parallel.enrollment_type = 'Regular'  -- Only count regular enrollments as parallels
     AND e_parallel.id != e.id
     -- Check for overlapping enrollment periods using actual effective end dates
     AND LEAST(
         COALESCE(
             (SELECT MAX(sl.session_date)
              FROM session_log sl
              WHERE sl.enrollment_id = e_parallel.id
              AND sl.session_status IN (
                  'Scheduled', 'Make-up Class',
                  'Attended', 'Attended (Make-up)',
                  'Rescheduled - Pending Make-up',
                  'Sick Leave - Pending Make-up',
                  'Weather Cancelled - Pending Make-up'
              )),
             calculate_effective_end_date(
                 e_parallel.first_lesson_date,
                 e_parallel.lessons_paid,
                 COALESCE(e_parallel.deadline_extension_weeks, 0)
             )
         ),
         calculate_effective_end_date(
             e_parallel.first_lesson_date,
             e_parallel.lessons_paid,
             COALESCE(e_parallel.deadline_extension_weeks, 0)
         )
     ) >= e.first_lesson_date
     AND e_parallel.first_lesson_date <= LEAST(
         COALESCE(
             (SELECT MAX(sl.session_date)
              FROM session_log sl
              WHERE sl.enrollment_id = e.id
              AND sl.session_status IN (
                  'Scheduled', 'Make-up Class',
                  'Attended', 'Attended (Make-up)',
                  'Rescheduled - Pending Make-up',
                  'Sick Leave - Pending Make-up',
                  'Weather Cancelled - Pending Make-up'
              )),
             calculate_effective_end_date(
                 e.first_lesson_date,
                 e.lessons_paid,
                 COALESCE(e.deadline_extension_weeks, 0)
             )
         ),
         calculate_effective_end_date(
             e.first_lesson_date,
             e.lessons_paid,
             COALESCE(e.deadline_extension_weeks, 0)
         )
     )) AS parallel_enrollments_count,

    -- Display format for admin clarity
    -- Shows day/time if there are parallel enrollments (uses actual_effective_end_date)
    CASE
        WHEN (SELECT COUNT(*)
              FROM enrollments e_p
              WHERE e_p.student_id = e.student_id
              AND e_p.tutor_id = e.tutor_id
              AND e_p.payment_status = 'Paid'
              AND e_p.enrollment_type = 'Regular'
              AND e_p.id != e.id
              AND LEAST(
                  COALESCE(
                      (SELECT MAX(sl.session_date)
                       FROM session_log sl
                       WHERE sl.enrollment_id = e_p.id
                       AND sl.session_status IN (
                           'Scheduled', 'Make-up Class',
                           'Attended', 'Attended (Make-up)',
                           'Rescheduled - Pending Make-up',
                           'Sick Leave - Pending Make-up',
                           'Weather Cancelled - Pending Make-up'
                       )),
                      calculate_effective_end_date(
                          e_p.first_lesson_date,
                          e_p.lessons_paid,
                          COALESCE(e_p.deadline_extension_weeks, 0)
                      )
                  ),
                  calculate_effective_end_date(
                      e_p.first_lesson_date,
                      e_p.lessons_paid,
                      COALESCE(e_p.deadline_extension_weeks, 0)
                  )
              ) >= e.first_lesson_date) > 0
        THEN CONCAT(s.student_name, ' - ', e.assigned_day, ' ', e.assigned_time)
        ELSE s.student_name
    END AS display_name,

    -- ========================================================================
    -- NEW RENEWAL TRACKING COLUMNS
    -- ========================================================================

    -- Find the renewal enrollment ID (using explicit link)
    (SELECT e_renewal.id
     FROM enrollments e_renewal
     WHERE e_renewal.renewed_from_enrollment_id = e.id
     AND e_renewal.payment_status IN ('Pending Payment', 'Paid')
     ORDER BY e_renewal.first_lesson_date ASC
     LIMIT 1
    ) AS renewal_enrollment_id,

    -- Renewal payment status
    (SELECT e_renewal.payment_status
     FROM enrollments e_renewal
     WHERE e_renewal.renewed_from_enrollment_id = e.id
     AND e_renewal.payment_status IN ('Pending Payment', 'Paid')
     ORDER BY e_renewal.first_lesson_date ASC
     LIMIT 1
    ) AS renewal_status,

    -- Renewal start date
    (SELECT e_renewal.first_lesson_date
     FROM enrollments e_renewal
     WHERE e_renewal.renewed_from_enrollment_id = e.id
     AND e_renewal.payment_status IN ('Pending Payment', 'Paid')
     ORDER BY e_renewal.first_lesson_date ASC
     LIMIT 1
    ) AS renewal_first_lesson_date,

    -- Renewal lessons paid
    (SELECT e_renewal.lessons_paid
     FROM enrollments e_renewal
     WHERE e_renewal.renewed_from_enrollment_id = e.id
     AND e_renewal.payment_status IN ('Pending Payment', 'Paid')
     ORDER BY e_renewal.first_lesson_date ASC
     LIMIT 1
    ) AS renewal_lessons_paid,

    -- Renewal schedule (to detect changes)
    (SELECT CONCAT(e_renewal.assigned_day, ' ', e_renewal.assigned_time)
     FROM enrollments e_renewal
     WHERE e_renewal.renewed_from_enrollment_id = e.id
     AND e_renewal.payment_status IN ('Pending Payment', 'Paid')
     ORDER BY e_renewal.first_lesson_date ASC
     LIMIT 1
    ) AS renewal_schedule,

    -- Admin action indicator for renewal status (using explicit link)
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM enrollments e_renewal
            WHERE e_renewal.renewed_from_enrollment_id = e.id
            AND e_renewal.payment_status = 'Pending Payment'
        ) THEN '⏳ Renewal Created - Awaiting Payment'
        WHEN EXISTS (
            SELECT 1
            FROM enrollments e_renewal
            WHERE e_renewal.renewed_from_enrollment_id = e.id
            AND e_renewal.payment_status = 'Paid'
        ) THEN '✅ Renewal Paid - Ready for Sessions'
        ELSE '🔴 Not Yet Renewed'
    END AS renewal_action_status,

    -- Schedule change indicator (if renewal has different day/time)
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM enrollments e_renewal
            WHERE e_renewal.renewed_from_enrollment_id = e.id
            AND (e_renewal.assigned_day != e.assigned_day
                 OR e_renewal.assigned_time != e.assigned_time)
        )
        THEN CONCAT(
            '⚠️ Schedule Changed: ',
            (SELECT CONCAT(e_renewal.assigned_day, ' ', e_renewal.assigned_time)
             FROM enrollments e_renewal
             WHERE e_renewal.renewed_from_enrollment_id = e.id
             ORDER BY e_renewal.first_lesson_date ASC
             LIMIT 1)
        )
        ELSE NULL
    END AS renewal_schedule_change

FROM enrollments e
JOIN students s ON e.student_id = s.id
JOIN tutors t ON e.tutor_id = t.id
WHERE
    -- Only show paid enrollments
    e.payment_status = 'Paid'
    -- Only show regular ongoing enrollments (exclude One-Time and Trial)
    AND e.enrollment_type = 'Regular'
    -- Show enrollments within 14 days of renewal (or up to 7 days overdue)
    -- Uses actual_effective_end_date logic for accurate preemptive reminders
    AND DATEDIFF(
        LEAST(
            COALESCE(
                (SELECT MAX(sl.session_date)
                 FROM session_log sl
                 WHERE sl.enrollment_id = e.id
                 AND sl.session_status IN (
                     'Scheduled', 'Make-up Class',
                     'Attended', 'Attended (Make-up)',
                     'Rescheduled - Pending Make-up',
                     'Sick Leave - Pending Make-up',
                     'Weather Cancelled - Pending Make-up'
                 )),
                calculate_effective_end_date(
                    e.first_lesson_date,
                    e.lessons_paid,
                    COALESCE(e.deadline_extension_weeks, 0)
                )
            ),
            calculate_effective_end_date(
                e.first_lesson_date,
                e.lessons_paid,
                COALESCE(e.deadline_extension_weeks, 0)
            )
        ),
        CURDATE()
    ) BETWEEN -7 AND 15
    -- CRITICAL FIX: Only show active enrollments, not old completed ones
    -- This prevents showing historical enrollments that clutter the renewal view
    AND (
        -- Case 1: This is the most recent enrollment for this student-tutor-schedule combo
        -- Uses MAX(first_lesson_date) instead of MAX(id) since IDs are random
        e.first_lesson_date = (
            SELECT MAX(e_latest.first_lesson_date)
            FROM enrollments e_latest
            WHERE e_latest.student_id = e.student_id
            AND e_latest.tutor_id = e.tutor_id
            AND e_latest.assigned_day = e.assigned_day
            AND e_latest.assigned_time = e.assigned_time
            AND e_latest.payment_status IN ('Paid')  -- Only Paid - keep old enrollment visible until renewal is paid
            AND e_latest.enrollment_type = 'Regular'  -- Only compare with Regular enrollments
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
        -- Uses actual_effective_end_date to detect true active parallel enrollments
        EXISTS (
            SELECT 1
            FROM enrollments e_parallel
            WHERE e_parallel.student_id = e.student_id
            AND e_parallel.tutor_id = e.tutor_id
            AND e_parallel.payment_status = 'Paid'
            AND e_parallel.enrollment_type = 'Regular'  -- Only regular enrollments
            AND e_parallel.id != e.id
            AND (e_parallel.assigned_day != e.assigned_day OR e_parallel.assigned_time != e.assigned_time)
            -- Check for overlapping periods using actual effective end dates
            AND LEAST(
                COALESCE(
                    (SELECT MAX(sl.session_date)
                     FROM session_log sl
                     WHERE sl.enrollment_id = e_parallel.id
                     AND sl.session_status IN (
                         'Scheduled', 'Make-up Class',
                         'Attended', 'Attended (Make-up)',
                         'Rescheduled - Pending Make-up',
                         'Sick Leave - Pending Make-up',
                         'Weather Cancelled - Pending Make-up'
                     )),
                    calculate_effective_end_date(
                        e_parallel.first_lesson_date,
                        e_parallel.lessons_paid,
                        COALESCE(e_parallel.deadline_extension_weeks, 0)
                    )
                ),
                calculate_effective_end_date(
                    e_parallel.first_lesson_date,
                    e_parallel.lessons_paid,
                    COALESCE(e_parallel.deadline_extension_weeks, 0)
                )
            ) >= e.first_lesson_date
            AND e_parallel.first_lesson_date <= LEAST(
                COALESCE(
                    (SELECT MAX(sl.session_date)
                     FROM session_log sl
                     WHERE sl.enrollment_id = e.id
                     AND sl.session_status IN (
                         'Scheduled', 'Make-up Class',
                         'Attended', 'Attended (Make-up)',
                         'Rescheduled - Pending Make-up',
                         'Sick Leave - Pending Make-up',
                         'Weather Cancelled - Pending Make-up'
                     )),
                    calculate_effective_end_date(
                        e.first_lesson_date,
                        e.lessons_paid,
                        COALESCE(e.deadline_extension_weeks, 0)
                    )
                ),
                calculate_effective_end_date(
                    e.first_lesson_date,
                    e.lessons_paid,
                    COALESCE(e.deadline_extension_weeks, 0)
                )
            )
        )
    )
    -- MODIFIED: Show enrollments even if newer enrollment exists (for tracking)
    -- Admin can see both old enrollment needing renewal AND the renewal status
ORDER BY days_until_renewal ASC, renewal_action_status;

SELECT 'Updated active_enrollments_needing_renewal view created successfully.' as result;

-- ============================================================================
-- APPSHEET INTEGRATION GUIDANCE
-- ============================================================================

/*
APPSHEET CONFIGURATION GUIDANCE:

IMPORTANT: ENROLLMENT TYPE FIELD
================================

The enrollments table now has an enrollment_type field with three values:
- "Regular" - Ongoing weekly enrollments that should appear in renewal view
- "One-Time" - Single sessions, test prep, ad-hoc lessons (excluded from renewal)
- "Trial" - Prospective student trial classes (excluded from renewal)

AppSheet Setup for Enrollments Table:
1. Add enrollment_type column (Type: Enum)
2. Allowed values: Regular, One-Time, Trial
3. Initial value: Regular
4. Show in enrollment creation/edit forms
5. Label: "Enrollment Type"
6. Description: "Regular = ongoing weekly | One-Time = single session | Trial = prospective student"

Benefits:
- One-time/trial enrollments won't clutter renewal view
- Foundation for future trial conversion tracking system
- Better reporting segmentation

1. VIRTUAL COLUMNS IN ACTIVE_ENROLLMENTS_NEEDING_RENEWAL VIEW:

   _renewal_link (Ref to enrollments):
   [renewal_enrollment_id]

   _renewal_status_display (Text):
   SWITCH([renewal_action_status],
     "⏳ Renewal Created - Awaiting Payment",
       CONCATENATE("⏳ Pending Payment - ", [renewal_lessons_paid], " lessons starting ", TEXT([renewal_first_lesson_date], "MMM DD")),
     "✅ Renewal Paid - Ready for Sessions",
       CONCATENATE("✅ Paid - ", [renewal_lessons_paid], " lessons starting ", TEXT([renewal_first_lesson_date], "MMM DD")),
     "🔴 Not Yet Renewed", "🔴 Action Needed: Create Renewal",
     "❓ Unknown"
   )

   _action_needed (Yes/No):
   [renewal_action_status] = "🔴 Not Yet Renewed"

   _payment_needed (Yes/No):
   [renewal_action_status] = "⏳ Renewal Created - Awaiting Payment"

   _can_create_sessions (Yes/No):
   [renewal_action_status] = "✅ Renewal Paid - Ready for Sessions"

2. UPDATE "RENEW ENROLLMENT" ACTION:

   Action Name: Renew Enrollment

   Show If:
   [_action_needed] = TRUE

   Do This: Data: add a new row to another table
   Target: enrollments

   Values for new enrollment:
   id: 0
   student_id: [student_id]
   tutor_id: [tutor_id]
   assigned_day: [assigned_day]
   assigned_time: [assigned_time]
   location: [enrollment_id].[location]
   lessons_paid: [Prompt: "Number of lessons for renewal?"]
   payment_date: null
   first_lesson_date: [actual_effective_end_date] + 7  // Start 1 week after current enrollment actually ends
   payment_status: "Pending Payment"
   enrollment_type: "Regular"  // Renewals are always Regular type
   renewed_from_enrollment_id: [enrollment_id]  // CRITICAL: Links renewal to original enrollment
   remark: CONCATENATE("Renewal of enrollment #", [enrollment_id], " (", [student_name], " with ", [tutor_name], ") - Created on ", TEXT(TODAY(), "yyyy-mm-dd"), " by ", USEREMAIL())
   last_modified_by: USEREMAIL()

   NOTE: The renewed_from_enrollment_id field is what enables renewal detection to work
         even when the student changes their schedule (day/time) in the renewal.

3. VIRTUAL COLUMNS IN ENROLLMENTS TABLE (for showing renewal context):

   _renewed_from_link (Ref to enrollments):
   [renewed_from_enrollment_id]

   _is_renewal (Yes/No):
   NOT(ISBLANK([renewed_from_enrollment_id]))

   _renewal_info (Text):
   IF([_is_renewal],
     CONCATENATE("↩️ Renews enrollment #", [renewed_from_enrollment_id]),
     "🆕 New enrollment")

   _previous_enrollment_end_date (Date):
   IF([_is_renewal],
     [_renewed_from_link].[effective_end_date],
     BLANK())

   Purpose: These columns help admins see at a glance whether an enrollment is a renewal
            and provide quick access to the previous enrollment for context.

4. NEW ACTION: GO TO RENEWAL ENROLLMENT

   Action Name: Go to Renewal Enrollment

   Show If:
   NOT(ISBLANK([renewal_enrollment_id]))

   Do This: App: go to another view within this app
   Target: LINKTOVIEW("Enrollment Detail", [_renewal_link])

5. NEW ACTION: CONFIRM PAYMENT (for pending renewals)

   Action Name: Confirm Payment Received

   Show If:
   [_payment_needed] = TRUE

   Do This: Data: set the values of some columns in another table
   Referenced Rows: [_renewal_link]

   Values:
   payment_status: "Paid"
   payment_date: [Prompt: "Payment date?"]
   last_modified_by: USEREMAIL()

6. VIEW CONFIGURATION:

   View Name: Enrollments Needing Renewal
   For This Data: active_enrollments_needing_renewal
   View Type: Table or Deck
   Sort: days_until_renewal ASC, renewal_action_status
   Group By: renewal_action_status

   Column Display Order:
   1. _renewal_status_display (colored/bold)
   2. display_name (student name)
   3. days_until_renewal
   4. total_credits_remaining
   5. pending_makeups
   6. extension_status
   7. renewal_schedule_change (if not blank, shows schedule change warning)

   Conditional Formatting:
   - Red row: [renewal_action_status] = "🔴 Not Yet Renewed"
   - Yellow row: [renewal_action_status] = "⏳ Renewal Created - Awaiting Payment"
   - Green row: [renewal_action_status] = "✅ Renewal Paid - Ready for Sessions"

   Action Buttons:
   - "Renew Enrollment" (when _action_needed = TRUE)
   - "Go to Renewal" (when renewal_enrollment_id exists)
   - "Confirm Payment" (when _payment_needed = TRUE)
   - "Create Sessions" (when _can_create_sessions = TRUE)

7. WORKFLOW GUIDE FOR ADMINS:

   Step 1: Review enrollments approaching renewal
   - Red rows need action immediately
   - Check pending_makeups to decide extension vs renewal

   Step 2: Create renewal enrollment
   - Click "Renew Enrollment" action
   - Enter number of lessons
   - Renewal starts 1 week after current ends

   Step 3: Follow up on payment
   - Yellow rows show pending payment renewals
   - Click "Go to Renewal" to see enrollment details
   - Confirm payment when received

   Step 4: Create sessions
   - Green rows indicate ready for session creation
   - Click "Go to Renewal" then "Create Sessions"

   Step 5: Old enrollment disappears from view
   - Once renewal paid and sessions created
   - Old enrollment naturally expires

BENEFITS:
✅ No Duplicate Renewals: Action only visible when not yet renewed
✅ Easy Navigation: Direct link to renewal enrollment
✅ Clear Status: Visual indicators for admin action
✅ Complete Workflow: Track from creation → payment → sessions
✅ Prevention: Cannot accidentally create multiple renewals
*/

-- ============================================================================
-- TESTING QUERIES
-- ============================================================================

/*
-- Test 1: View renewals that haven't been created yet
SELECT
    enrollment_id,
    student_name,
    days_until_renewal,
    renewal_action_status,
    renewal_enrollment_id
FROM active_enrollments_needing_renewal
WHERE renewal_action_status = '🔴 Not Yet Renewed';

-- Test 2: View renewals awaiting payment
SELECT
    enrollment_id,
    student_name,
    renewal_enrollment_id,
    renewal_first_lesson_date,
    renewal_lessons_paid,
    renewal_status
FROM active_enrollments_needing_renewal
WHERE renewal_action_status = '⏳ Renewal Created - Awaiting Payment';

-- Test 3: View paid renewals ready for sessions
SELECT
    enrollment_id,
    student_name,
    renewal_enrollment_id,
    renewal_first_lesson_date
FROM active_enrollments_needing_renewal
WHERE renewal_action_status = '✅ Renewal Paid - Ready for Sessions';

-- Test 4: Check for potential duplicate renewals (should be none)
SELECT
    student_id,
    tutor_id,
    assigned_day,
    assigned_time,
    COUNT(*) as renewal_count
FROM (
    SELECT DISTINCT
        student_id,
        tutor_id,
        assigned_day,
        assigned_time,
        renewal_enrollment_id
    FROM active_enrollments_needing_renewal
    WHERE renewal_enrollment_id IS NOT NULL
) duplicates
GROUP BY student_id, tutor_id, assigned_day, assigned_time
HAVING COUNT(*) > 1;
*/

SELECT 'Migration 021: Enhanced renewal view with tracking completed successfully.' as result;

-- ============================================================================
-- SUMMARY
-- ============================================================================

/*
CHANGES:
1. Added renewal_enrollment_id - links to the renewal enrollment if exists
2. Added renewal_status - shows Pending Payment or Paid
3. Added renewal_first_lesson_date - when renewal starts
4. Added renewal_lessons_paid - how many lessons in renewal
5. Added renewal_action_status - clear indicator of what action needed

PREVENTS:
- Duplicate renewal creation (action hidden when renewal exists)
- Lost renewal enrollments (link always available)
- Confusion about renewal status (clear visual indicators)

ENABLES:
- One-click navigation to renewal enrollment
- Clear workflow tracking (not renewed → pending payment → paid → sessions)
- Conditional actions based on renewal state
- Admin dashboard with actionable intelligence

NEXT STEPS:
1. Configure AppSheet virtual columns and actions per guidance above
2. Set up conditional formatting for visual clarity
3. Train admins on new workflow
4. Monitor renewal process for any edge cases
*/