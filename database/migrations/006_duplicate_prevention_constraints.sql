-- Add duplicate prevention constraints to prevent scheduling conflicts
-- Ensures no student can have duplicate sessions with same tutor at same time/location

-- First, check for existing duplicates in enrollments
SELECT 
    student_id, 
    tutor_id, 
    assigned_day, 
    assigned_time, 
    location,
    COUNT(*) as duplicate_count
FROM enrollments 
GROUP BY student_id, tutor_id, assigned_day, assigned_time, location
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- First, check for existing duplicates in session_log  
SELECT 
    student_id,
    tutor_id,
    session_date,
    time_slot,
    location,
    COUNT(*) as duplicate_count
FROM session_log
GROUP BY student_id, tutor_id, session_date, time_slot, location  
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Add unique constraint to prevent duplicate enrollments
-- Same student + tutor + day + time + location = not allowed
ALTER TABLE enrollments 
ADD UNIQUE KEY unique_student_tutor_schedule (student_id, tutor_id, assigned_day, assigned_time, location);

-- Add unique constraint to prevent duplicate sessions
-- Same student + tutor + date + time + location = not allowed  
ALTER TABLE session_log
ADD UNIQUE KEY unique_student_tutor_session (student_id, tutor_id, session_date, time_slot, location);

-- Verify constraints were added successfully
SHOW INDEX FROM enrollments WHERE Key_name = 'unique_student_tutor_schedule';
SHOW INDEX FROM session_log WHERE Key_name = 'unique_student_tutor_session';