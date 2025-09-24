-- Comprehensive Test Suite for Renewal View
-- Purpose: Validate the renewal view logic and filtering after recent fixes
--
-- IMPORTANT RENEWAL WORKFLOW NOTES:
-- 1. Only the most recent active enrollment per student-tutor-schedule shows in view
-- 2. 'Active' means payment_status IN ('Paid', 'Pending Payment')
-- 3. Once a renewal is created (even Pending Payment), the original disappears
-- 4. If renewal is cancelled, original reappears for potential extension
-- 5. Extensions push the renewal deadline out without creating new enrollments

-- ============================================================================
-- TEST 1: OVERVIEW - All Paid Enrollments vs Renewal View
-- ============================================================================

SELECT '=== TEST 1: OVERVIEW - All Paid Enrollments vs Renewal View ===' as test_header;

-- First show ALL paid enrollments to understand the full landscape
SELECT
    'All Paid Enrollments (ordered by days until end)' as test_section;

SELECT
    e.id as enrollment_id,
    s.student_name,
    t.tutor_name,
    e.assigned_day,
    e.assigned_time,
    e.first_lesson_date,
    e.lessons_paid,
    COALESCE(e.deadline_extension_weeks, 0) as extension_weeks,
    calculate_end_date(e.first_lesson_date, e.lessons_paid) as original_end_date,
    DATE_ADD(
        calculate_end_date(e.first_lesson_date, e.lessons_paid),
        INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
    ) as effective_end_date,
    DATEDIFF(
        DATE_ADD(
            calculate_end_date(e.first_lesson_date, e.lessons_paid),
            INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
        ),
        CURDATE()
    ) as days_until_renewal,
    CASE
        WHEN DATEDIFF(
            DATE_ADD(
                calculate_end_date(e.first_lesson_date, e.lessons_paid),
                INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
            ),
            CURDATE()
        ) BETWEEN -7 AND 14 THEN '✅ In Renewal Range'
        WHEN DATEDIFF(
            DATE_ADD(
                calculate_end_date(e.first_lesson_date, e.lessons_paid),
                INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
            ),
            CURDATE()
        ) < -30 THEN '❌ Old Completed'
        WHEN DATEDIFF(
            DATE_ADD(
                calculate_end_date(e.first_lesson_date, e.lessons_paid),
                INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
            ),
            CURDATE()
        ) > 14 THEN '⏳ Future'
        ELSE '⚠️ Recently Ended'
    END as status_flag
FROM enrollments e
JOIN students s ON e.student_id = s.id
JOIN tutors t ON e.tutor_id = t.id
WHERE e.payment_status = 'Paid'
ORDER BY days_until_renewal ASC
LIMIT 20;

-- ============================================================================
-- TEST 2: FILTERING LOGIC - Old vs Current Enrollments
-- ============================================================================

SELECT '=== TEST 2: FILTERING LOGIC - Old vs Current Enrollments ===' as test_header;

-- Show students who have multiple enrollments (to test our filtering logic)
SELECT
    'Students with Multiple Enrollments (testing filtering)' as test_section;

SELECT
    s.student_name,
    t.tutor_name,
    COUNT(*) as total_enrollments,
    GROUP_CONCAT(
        CONCAT(
            'ID:', e.id,
            ' Start:', e.first_lesson_date,
            ' End:', calculate_end_date(e.first_lesson_date, e.lessons_paid),
            ' Days:', DATEDIFF(calculate_end_date(e.first_lesson_date, e.lessons_paid), CURDATE()),
            ' Schedule:', e.assigned_day, ' ', e.assigned_time
        )
        ORDER BY e.first_lesson_date
        SEPARATOR ' | '
    ) as enrollment_details
FROM enrollments e
JOIN students s ON e.student_id = s.id
JOIN tutors t ON e.tutor_id = t.id
WHERE e.payment_status = 'Paid'
GROUP BY s.student_name, t.tutor_name
HAVING COUNT(*) > 1;

-- ============================================================================
-- TEST 3: PARALLEL ENROLLMENT DETECTION
-- ============================================================================

SELECT '=== TEST 3: PARALLEL ENROLLMENT DETECTION ===' as test_header;

-- Find students with overlapping enrollments (potential parallel lessons)
SELECT
    'Students with Potentially Parallel Enrollments' as test_section;

SELECT DISTINCT
    s1.student_name,
    t1.tutor_name,
    CONCAT(
        'Enrollment 1: ', e1.assigned_day, ' ', e1.assigned_time,
        ' (', e1.first_lesson_date, ' to ',
        calculate_end_date(e1.first_lesson_date, e1.lessons_paid), ')'
    ) as enrollment1_details,
    CONCAT(
        'Enrollment 2: ', e2.assigned_day, ' ', e2.assigned_time,
        ' (', e2.first_lesson_date, ' to ',
        calculate_end_date(e2.first_lesson_date, e2.lessons_paid), ')'
    ) as enrollment2_details,
    CASE
        WHEN (e1.assigned_day = e2.assigned_day AND e1.assigned_time = e2.assigned_time)
        THEN '🔄 Sequential (Same Schedule)'
        ELSE '⚡ Parallel (Different Schedule)'
    END as relationship_type
FROM enrollments e1
JOIN students s1 ON e1.student_id = s1.id
JOIN tutors t1 ON e1.tutor_id = t1.id
JOIN enrollments e2 ON e1.student_id = e2.student_id
    AND e1.tutor_id = e2.tutor_id
    AND e1.id < e2.id  -- Avoid duplicates
WHERE e1.payment_status = 'Paid'
    AND e2.payment_status = 'Paid'
    -- Check for overlapping periods
    AND calculate_end_date(e2.first_lesson_date, e2.lessons_paid) >= e1.first_lesson_date
    AND e2.first_lesson_date <= calculate_end_date(e1.first_lesson_date, e1.lessons_paid);

-- ============================================================================
-- TEST 4: ACTUAL RENEWAL VIEW RESULTS
-- ============================================================================

SELECT '=== TEST 4: ACTUAL RENEWAL VIEW RESULTS ===' as test_header;

SELECT
    'Current Active Renewal View Output' as test_section;

SELECT
    enrollment_id,
    student_name,
    tutor_name,
    assigned_day,
    assigned_time,
    days_until_renewal,
    sessions_ready_to_attend,
    sessions_completed,
    pending_makeups,
    total_credits_remaining,
    extension_status,
    available_actions,
    parallel_enrollments_count,
    display_name,
    -- Show deprecated fields for comparison
    scheduled_sessions as scheduled_sessions_old,
    sessions_used as sessions_used_old
FROM active_enrollments_needing_renewal
ORDER BY days_until_renewal ASC;

-- ============================================================================
-- TEST 5: DEBUG - Why View Might Be Empty
-- ============================================================================

SELECT '=== TEST 5: DEBUG - Why View Might Be Empty ===' as test_header;

-- Show distribution of enrollment end dates
SELECT
    'Distribution of Enrollment End Dates' as test_section;

SELECT
    date_range,
    COUNT(*) as enrollment_count,
    GROUP_CONCAT(
        CONCAT(student_name, ' (', days_until_end, ' days)')
        ORDER BY days_until_end
        SEPARATOR ', '
    ) as student_examples
FROM (
    SELECT
        s.student_name,
        DATEDIFF(
            DATE_ADD(
                calculate_end_date(e.first_lesson_date, e.lessons_paid),
                INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
            ),
            CURDATE()
        ) as days_until_end,
        CASE
            WHEN DATEDIFF(
                DATE_ADD(
                    calculate_end_date(e.first_lesson_date, e.lessons_paid),
                    INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
                ),
                CURDATE()
            ) < -30 THEN 'Completed (>30 days ago)'
            WHEN DATEDIFF(
                DATE_ADD(
                    calculate_end_date(e.first_lesson_date, e.lessons_paid),
                    INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
                ),
                CURDATE()
            ) BETWEEN -30 AND -8 THEN 'Recently Ended (-30 to -8 days)'
            WHEN DATEDIFF(
                DATE_ADD(
                    calculate_end_date(e.first_lesson_date, e.lessons_paid),
                    INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
                ),
                CURDATE()
            ) BETWEEN -7 AND 14 THEN '🎯 RENEWAL RANGE (-7 to +14 days)'
            WHEN DATEDIFF(
                DATE_ADD(
                    calculate_end_date(e.first_lesson_date, e.lessons_paid),
                    INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
                ),
                CURDATE()
            ) BETWEEN 15 AND 30 THEN 'Coming Soon (15-30 days)'
            WHEN DATEDIFF(
                DATE_ADD(
                    calculate_end_date(e.first_lesson_date, e.lessons_paid),
                    INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
                ),
                CURDATE()
            ) BETWEEN 31 AND 60 THEN 'Future (31-60 days)'
            ELSE 'Far Future (>60 days)'
        END as date_range,
        CASE
            WHEN DATEDIFF(
                DATE_ADD(
                    calculate_end_date(e.first_lesson_date, e.lessons_paid),
                    INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
                ),
                CURDATE()
            ) < -30 THEN 1
            WHEN DATEDIFF(
                DATE_ADD(
                    calculate_end_date(e.first_lesson_date, e.lessons_paid),
                    INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
                ),
                CURDATE()
            ) BETWEEN -30 AND -8 THEN 2
            WHEN DATEDIFF(
                DATE_ADD(
                    calculate_end_date(e.first_lesson_date, e.lessons_paid),
                    INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
                ),
                CURDATE()
            ) BETWEEN -7 AND 14 THEN 3
            WHEN DATEDIFF(
                DATE_ADD(
                    calculate_end_date(e.first_lesson_date, e.lessons_paid),
                    INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
                ),
                CURDATE()
            ) BETWEEN 15 AND 30 THEN 4
            WHEN DATEDIFF(
                DATE_ADD(
                    calculate_end_date(e.first_lesson_date, e.lessons_paid),
                    INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
                ),
                CURDATE()
            ) BETWEEN 31 AND 60 THEN 5
            ELSE 6
        END as sort_order
    FROM enrollments e
    JOIN students s ON e.student_id = s.id
    WHERE e.payment_status = 'Paid'
) enrollment_summary
GROUP BY date_range, sort_order
ORDER BY sort_order;

-- ============================================================================
-- TEST 6: EXTENSION TESTING
-- ============================================================================

SELECT '=== TEST 6: EXTENSION TESTING ===' as test_header;

-- Show enrollments with extensions (if any exist)
SELECT
    'Enrollments with Extensions Applied' as test_section;

SELECT
    e.id as enrollment_id,
    s.student_name,
    e.deadline_extension_weeks,
    e.extension_notes,
    calculate_end_date(e.first_lesson_date, e.lessons_paid) as original_end_date,
    DATE_ADD(
        calculate_end_date(e.first_lesson_date, e.lessons_paid),
        INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
    ) as extended_end_date,
    DATEDIFF(
        DATE_ADD(
            calculate_end_date(e.first_lesson_date, e.lessons_paid),
            INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
        ),
        CURDATE()
    ) as days_until_renewal
FROM enrollments e
JOIN students s ON e.student_id = s.id
WHERE e.payment_status = 'Paid'
    AND COALESCE(e.deadline_extension_weeks, 0) > 0
ORDER BY days_until_renewal ASC;

-- If no extensions exist, show how to test extension functionality
SELECT
    CASE
        WHEN (SELECT COUNT(*) FROM enrollments WHERE COALESCE(deadline_extension_weeks, 0) > 0) = 0
        THEN 'No extensions found. To test extensions, run: UPDATE enrollments SET deadline_extension_weeks = 2 WHERE id = [some_id] LIMIT 1;'
        ELSE 'Extensions found above'
    END as extension_test_note;

-- ============================================================================
-- TEST 7: RENEWAL HIDING BEHAVIOR - Critical Workflow Test
-- ============================================================================

SELECT '=== TEST 7: RENEWAL HIDING BEHAVIOR ===' as test_header;

-- Show enrollments that have newer enrollments (should be HIDDEN from renewal view)
SELECT
    'Enrollments Hidden Due to Newer Enrollments' as test_section;

SELECT
    e.id as hidden_enrollment_id,
    s.student_name,
    e.assigned_day,
    e.assigned_time,
    e.first_lesson_date as original_start,
    calculate_end_date(e.first_lesson_date, e.lessons_paid) as original_end,
    DATEDIFF(calculate_end_date(e.first_lesson_date, e.lessons_paid), CURDATE()) as days_until_end,
    -- Show the newer enrollment that's hiding this one
    (SELECT CONCAT(
        'ID:', e2.id,
        ' Start:', e2.first_lesson_date,
        ' Status:', e2.payment_status
     )
     FROM enrollments e2
     WHERE e2.student_id = e.student_id
     AND e2.tutor_id = e.tutor_id
     AND e2.assigned_day = e.assigned_day
     AND e2.assigned_time = e.assigned_time
     AND e2.first_lesson_date > e.first_lesson_date
     AND e2.payment_status IN ('Paid', 'Pending Payment')
     ORDER BY e2.first_lesson_date DESC
     LIMIT 1
    ) as newer_enrollment_details,
    CASE
        WHEN DATEDIFF(calculate_end_date(e.first_lesson_date, e.lessons_paid), CURDATE()) BETWEEN -7 AND 15
        THEN '🚫 Would show in renewal view BUT hidden by newer enrollment'
        ELSE '⚪ Outside renewal range anyway'
    END as hiding_effect
FROM enrollments e
JOIN students s ON e.student_id = s.id
WHERE e.payment_status = 'Paid'
    -- Only show enrollments that HAVE a newer enrollment
    AND EXISTS (
        SELECT 1
        FROM enrollments e2
        WHERE e2.student_id = e.student_id
        AND e2.tutor_id = e.tutor_id
        AND e2.assigned_day = e.assigned_day
        AND e2.assigned_time = e.assigned_time
        AND e2.first_lesson_date > e.first_lesson_date
        AND e2.payment_status IN ('Paid', 'Pending Payment')
    )
ORDER BY days_until_end ASC;

-- Show pending payment enrollments (these should NOT appear in renewal view themselves)
SELECT
    'Pending Payment Enrollments (Should Not Appear in Renewal View)' as test_section;

SELECT
    e.id as pending_enrollment_id,
    s.student_name,
    e.assigned_day,
    e.assigned_time,
    e.first_lesson_date,
    e.payment_status,
    CASE
        WHEN (SELECT COUNT(*) FROM active_enrollments_needing_renewal r WHERE r.enrollment_id = e.id) > 0
        THEN '❌ ERROR: Appears in renewal view'
        ELSE '✅ Correctly hidden from renewal view'
    END as view_status
FROM enrollments e
JOIN students s ON e.student_id = s.id
WHERE e.payment_status = 'Pending Payment'
ORDER BY e.first_lesson_date DESC;

-- ============================================================================
-- TEST 8: SESSION COUNTS VALIDATION
-- ============================================================================

SELECT '=== TEST 8: SESSION COUNTS VALIDATION ===' as test_header;

-- Show detailed session breakdown for enrollments in renewal range
SELECT
    'Session Breakdown for Enrollments in Renewal Range' as test_section;

SELECT
    e.id as enrollment_id,
    s.student_name,
    e.lessons_paid,
    -- NEW session counting approach
    (SELECT COUNT(*) FROM session_log sl
     WHERE sl.enrollment_id = e.id
     AND sl.session_status IN ('Scheduled', 'Make-up Class', 'Trial Class')
     AND sl.session_date >= CURDATE()) as ready_to_attend,
    (SELECT COUNT(*) FROM session_log sl
     WHERE sl.enrollment_id = e.id
     AND sl.session_status IN ('Attended', 'Attended (Make-up)', 'No Show')) as completed,
    (SELECT COUNT(*) FROM session_log sl
     WHERE sl.enrollment_id = e.id
     AND sl.session_status LIKE '%Pending Make-up%') as pending_makeups,
    -- Total remaining calculation
    e.lessons_paid - (SELECT COUNT(*) FROM session_log sl
                      WHERE sl.enrollment_id = e.id
                      AND sl.session_status IN ('Attended', 'Attended (Make-up)', 'No Show')) as total_credits_left,
    -- OLD approach for comparison
    (SELECT COUNT(*) FROM session_log sl
     WHERE sl.enrollment_id = e.id AND sl.session_status = 'Scheduled') as old_scheduled_only,
    (SELECT COUNT(*) FROM session_log sl
     WHERE sl.enrollment_id = e.id
     AND sl.session_status NOT IN (
         'Rescheduled - Make-up Booked',
         'Sick Leave - Make-up Booked',
         'Weather Cancelled - Make-up Booked',
         'Cancelled'
     )) as old_sessions_used
FROM enrollments e
JOIN students s ON e.student_id = s.id
WHERE e.payment_status = 'Paid'
    AND DATEDIFF(
        DATE_ADD(
            calculate_end_date(e.first_lesson_date, e.lessons_paid),
            INTERVAL COALESCE(e.deadline_extension_weeks, 0) WEEK
        ),
        CURDATE()
    ) BETWEEN -7 AND 14
ORDER BY enrollment_id;

-- ============================================================================
-- SUMMARY AND RECOMMENDATIONS
-- ============================================================================

SELECT '=== SUMMARY AND NEXT STEPS ===' as test_header;

SELECT
    'Test Complete - Check Results Above' as summary,
    'If renewal view is empty, look at TEST 5 distribution to see where enrollments fall' as recommendation1,
    'If you see unexpected results, compare TEST 1 (all enrollments) vs TEST 4 (renewal view)' as recommendation2,
    'To force test the view, temporarily change the BETWEEN -7 AND 14 to a wider range like -60 AND 60' as recommendation3;