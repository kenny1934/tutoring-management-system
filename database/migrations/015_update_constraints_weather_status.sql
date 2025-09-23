-- Migration 015: Update constraints to include Weather Cancelled status
-- Purpose: Update the unique constraint to treat weather cancelled sessions as placeholders

-- Step 1: Disable existing constraint by renaming it (same approach as migration 007)
SELECT 'DISABLING EXISTING CONSTRAINT' as status;

ALTER TABLE session_log RENAME INDEX unique_real_student_tutor_session TO old_unique_real_student_tutor_session_disabled_weather;

-- Step 2: Create new constraint with weather cancelled status included
SELECT 'CREATING UPDATED CONSTRAINT WITH WEATHER STATUS' as status;

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
        WHEN session_status IN ('Rescheduled - Make-up Booked', 'Sick Leave - Make-up Booked', 'Cancelled', 'Weather Cancelled - Pending Make-up', 'Weather Cancelled - Make-up Booked')
        THEN DATE_FORMAT(created_at, '%Y%m%d%H%i%s%f')  -- Microsecond precision for uniqueness
        ELSE 'REAL'  -- All real sessions share this value and will conflict
    END)
);

SELECT 'Constraint updated to include both Weather Cancelled statuses' as result;