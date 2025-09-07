-- Fix duplicate prevention constraint to allow placeholder sessions (V3 - Clean version)
-- Uses created_at timestamp to make placeholders unique without referencing auto-increment ID

-- Step 1: Disable existing constraints by renaming them
SELECT 'DISABLING EXISTING CONSTRAINTS' as status;

ALTER TABLE session_log RENAME INDEX unique_student_tutor_session TO old_unique_student_tutor_session_disabled;
ALTER TABLE enrollments RENAME INDEX unique_student_tutor_schedule TO old_unique_student_tutor_schedule_disabled;

-- Step 2: Create new placeholder-aware constraint  
-- Strategy: Use created_at timestamp to differentiate placeholders, constant for real sessions
SELECT 'CREATING NEW PLACEHOLDER-AWARE CONSTRAINT' as status;

CREATE UNIQUE INDEX unique_real_student_tutor_session 
ON session_log (
    student_id, 
    tutor_id, 
    session_date, 
    time_slot, 
    location,
    -- For placeholders: use timestamp to make each unique
    -- For real sessions: use constant 'REAL' to cause conflicts between real sessions
    (CASE 
        WHEN session_status IN ('Rescheduled - Make-up Booked', 'Sick Leave - Make-up Booked', 'Cancelled') 
        THEN DATE_FORMAT(created_at, '%Y%m%d%H%i%s%f')  -- Microsecond precision for uniqueness
        ELSE 'REAL'  -- All real sessions share this value and will conflict
    END)
);

-- Step 3: Recreate enrollment constraint (unchanged)
SELECT 'RECREATING ENROLLMENT CONSTRAINT' as status;

ALTER TABLE enrollments 
ADD UNIQUE KEY unique_student_tutor_schedule (student_id, tutor_id, assigned_day, assigned_time, location);

-- Step 4: Verify constraints were created successfully
SELECT 'VERIFYING NEW CONSTRAINTS' as status;
SHOW INDEX FROM session_log WHERE Key_name = 'unique_real_student_tutor_session';
SHOW INDEX FROM enrollments WHERE Key_name = 'unique_student_tutor_schedule';

SELECT 'MIGRATION COMPLETED SUCCESSFULLY' as final_status;