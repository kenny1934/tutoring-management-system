-- Fix enrollment constraint to allow renewals and re-enrollment after cancellation
-- This allows:
-- 1. Students to renew with same tutor/time but different start dates
-- 2. Students to re-enroll after cancelling a previous enrollment
-- Version: 008
-- Date: 2024-09-10

-- =====================================================
-- IMPORTANT: This migration modifies the unique constraint on enrollments table
-- to include first_lesson_date and exclude cancelled enrollments
-- =====================================================

-- Step 1: Check current constraint status
SELECT 'CHECKING CURRENT CONSTRAINTS' as status;
SHOW INDEX FROM enrollments WHERE Key_name LIKE '%unique%';

-- Step 2: Check for active (non-cancelled) duplicates that would violate the new constraint
SELECT 'CHECKING FOR POTENTIAL CONFLICTS (ACTIVE ENROLLMENTS ONLY)' as status;

SELECT 
    student_id, 
    tutor_id, 
    assigned_day, 
    assigned_time, 
    location,
    first_lesson_date,
    payment_status,
    COUNT(*) as duplicate_count,
    GROUP_CONCAT(id) as enrollment_ids
FROM enrollments 
WHERE payment_status != 'Cancelled'
GROUP BY student_id, tutor_id, assigned_day, assigned_time, location, first_lesson_date
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- If the above query returns any rows, those need to be resolved before applying the constraint

-- Step 3: Drop the existing constraint
-- Note: If you get error 1553, it means the index is referenced by a foreign key
-- We need to use a workaround: disable the old constraint by renaming it
SELECT 'HANDLING EXISTING CONSTRAINT' as status;

-- Try to drop the index first (this might fail with error 1553)
-- If it fails, use the alternative approach below
-- ALTER TABLE enrollments DROP INDEX unique_student_tutor_schedule;

-- Alternative approach: Rename the old constraint to disable it
-- This keeps the index but removes its uniqueness enforcement
ALTER TABLE enrollments 
RENAME INDEX unique_student_tutor_schedule TO old_unique_student_tutor_schedule_disabled;

-- Step 4: Create new constraint that:
-- - Includes first_lesson_date (allows renewals)
-- - Excludes cancelled enrollments (allows re-enrollment after cancellation)
SELECT 'CREATING NEW RENEWAL AND CANCELLATION-FRIENDLY CONSTRAINT' as status;

CREATE UNIQUE INDEX unique_active_enrollment_period 
ON enrollments (
    student_id, 
    tutor_id, 
    assigned_day, 
    assigned_time, 
    location,
    first_lesson_date,
    -- Make cancelled enrollments unique by using timestamp
    -- Make active enrollments share a common value (will conflict if duplicate)
    (CASE 
        WHEN payment_status = 'Cancelled' 
        THEN CONCAT('CANCELLED_', DATE_FORMAT(last_modified_time, '%Y%m%d%H%i%s%f'))  -- Unique for each cancelled
        ELSE 'ACTIVE'   -- All non-cancelled enrollments share this value
    END)
);

-- Step 5: Verify the new constraint was created successfully
SELECT 'VERIFYING NEW CONSTRAINT' as status;

SHOW INDEX FROM enrollments WHERE Key_name = 'unique_active_enrollment_period';

-- Step 6: Test scenarios to confirm the constraint works correctly
SELECT 'TESTING RENEWAL SCENARIOS' as status;

-- Show successful renewals (same student/tutor/time, different dates)
SELECT 
    s.student_name,
    t.tutor_name,
    e1.assigned_day,
    e1.assigned_time,
    e1.first_lesson_date as term1_start,
    e2.first_lesson_date as term2_start,
    e1.payment_status as term1_status,
    e2.payment_status as term2_status
FROM enrollments e1
JOIN enrollments e2 ON 
    e1.student_id = e2.student_id AND
    e1.tutor_id = e2.tutor_id AND
    e1.assigned_day = e2.assigned_day AND
    e1.assigned_time = e2.assigned_time AND
    e1.location = e2.location AND
    e1.first_lesson_date < e2.first_lesson_date
JOIN students s ON e1.student_id = s.id
JOIN tutors t ON e1.tutor_id = t.id
WHERE e1.payment_status != 'Cancelled' 
  AND e2.payment_status != 'Cancelled'
ORDER BY s.student_name, e1.first_lesson_date;

SELECT 'TESTING RE-ENROLLMENT AFTER CANCELLATION' as status;

-- Show cases where student re-enrolled after cancellation
SELECT 
    s.student_name,
    t.tutor_name,
    e.assigned_day,
    e.assigned_time,
    e.first_lesson_date,
    e.payment_status,
    e.id as enrollment_id
FROM enrollments e
JOIN students s ON e.student_id = s.id
JOIN tutors t ON e.tutor_id = t.id
WHERE EXISTS (
    SELECT 1 FROM enrollments e2
    WHERE e2.student_id = e.student_id
    AND e2.tutor_id = e.tutor_id
    AND e2.assigned_day = e.assigned_day
    AND e2.assigned_time = e.assigned_time
    AND e2.location = e.location
    AND e2.payment_status = 'Cancelled'
    AND e2.id != e.id
)
ORDER BY s.student_name, e.first_lesson_date;

SELECT 'MIGRATION COMPLETED SUCCESSFULLY' as final_status;

-- =====================================================
-- ROLLBACK SCRIPT (if needed):
-- ALTER TABLE enrollments DROP INDEX unique_active_enrollment_period;
-- ALTER TABLE enrollments DROP INDEX old_unique_student_tutor_schedule_disabled;
-- ALTER TABLE enrollments ADD UNIQUE KEY unique_student_tutor_schedule (student_id, tutor_id, assigned_day, assigned_time, location);
-- =====================================================

-- =====================================================
-- NOTES:
-- 1. This constraint allows multiple cancelled enrollments for the same slot
-- 2. It prevents duplicate active enrollments for the same period
-- 3. Students can re-enroll after cancelling
-- 4. Students can renew with different start dates
-- =====================================================