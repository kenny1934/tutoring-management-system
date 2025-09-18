-- =====================================================
-- Migration 010: Homework Completion Tracking MVP (CORRECTED)
-- =====================================================
-- Enables tutors to track homework completion from previous sessions
-- MVP Features:
-- - Track EACH homework assignment separately (from session_exercises table)
-- - Previous session found by date (accounts for make-up classes with different tutors)
-- - Mark completion status per homework item
-- - Handle multiple homework assignments per session
-- - No grading/marking - just completion tracking

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;

-- Create homework_completion table
CREATE TABLE homework_completion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    current_session_id INT NOT NULL COMMENT 'Current session where homework is being checked',
    session_exercise_id INT NOT NULL COMMENT 'Links to specific homework in session_exercises table',
    student_id INT NOT NULL COMMENT 'Student ID (denormalized for easier queries)',
    
    -- Denormalized homework details from session_exercises (for viewing without joins)
    pdf_name VARCHAR(255) COMMENT 'PDF name from session_exercises',
    page_start INT COMMENT 'Starting page from session_exercises',
    page_end INT COMMENT 'Ending page from session_exercises',
    exercise_remarks TEXT COMMENT 'Remarks from session_exercises',
    assigned_date DATE COMMENT 'Date when homework was assigned (from previous session)',
    assigned_by_tutor_id INT COMMENT 'Which tutor assigned this homework (could differ from current tutor due to make-ups)',
    
    -- Completion tracking
    completion_status ENUM('Not Checked', 'Completed', 'Partially Completed', 'Not Completed') 
        DEFAULT 'Not Checked' 
        COMMENT 'Homework completion status for this specific assignment',
    submitted BOOLEAN DEFAULT FALSE COMMENT 'Whether student physically submitted this homework',
    
    -- Tutor feedback (no grading, just observations)
    tutor_comments TEXT COMMENT 'Tutor observations about this specific homework',
    checked_by INT COMMENT 'Tutor ID who checked this homework (current session tutor)',
    checked_at TIMESTAMP NULL COMMENT 'When this homework was checked',
    
    created_at TIMESTAMP DEFAULT (CONVERT_TZ(NOW(), '+00:00', '+08:00')) COMMENT 'HK time creation',
    
    FOREIGN KEY (current_session_id) REFERENCES session_log(id) ON DELETE CASCADE,
    FOREIGN KEY (session_exercise_id) REFERENCES session_exercises(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_tutor_id) REFERENCES tutors(id) ON DELETE SET NULL,
    FOREIGN KEY (checked_by) REFERENCES tutors(id) ON DELETE SET NULL,
    
    UNIQUE KEY unique_exercise_check (current_session_id, session_exercise_id) COMMENT 'One check per homework per session',
    INDEX idx_student_date (student_id, assigned_date),
    INDEX idx_completion_status (completion_status),
    INDEX idx_checked_by (checked_by, checked_at)
) COMMENT 'Tracks completion of individual homework assignments from session_exercises table';

-- Create view for homework checking workflow
CREATE OR REPLACE VIEW homework_to_check AS
SELECT 
    current.id as current_session_id,
    current.student_id,
    current.tutor_id as current_tutor_id,
    current.session_date as current_session_date,
    s.student_name,
    t_current.tutor_name as current_tutor_name,
    
    -- Previous session info (any tutor, at least 1 day before)
    prev.id as previous_session_id,
    DATE(prev.session_date) as homework_assigned_date,
    prev.tutor_id as assigned_by_tutor_id,
    t_prev.tutor_name as assigned_by_tutor,
    
    -- Specific homework assignment details from session_exercises
    se.id as session_exercise_id,
    se.pdf_name,
    CASE
        WHEN se.page_start IS NOT NULL AND se.page_end IS NOT NULL
        THEN CONCAT('p.', se.page_start, '-', se.page_end)
        WHEN se.page_start IS NOT NULL
        THEN CONCAT('p.', se.page_start)
        ELSE ''
    END as pages,
    se.remarks as assignment_remarks,
    
    -- Completion status
    COALESCE(hc.completion_status, 'Not Checked') as completion_status,
    COALESCE(hc.submitted, FALSE) as submitted,
    hc.tutor_comments,
    hc.checked_at,
    hc.checked_by,
    
    -- Helper flags
    CASE WHEN hc.id IS NOT NULL THEN 'Checked' ELSE 'Pending' END as check_status
    
FROM session_log current
JOIN students s ON current.student_id = s.id
LEFT JOIN tutors t_current ON current.tutor_id = t_current.id

-- Find most recent previous session for this student (any tutor, at least 1 day before)
JOIN session_log prev ON (
    prev.student_id = current.student_id
    AND prev.session_date < current.session_date
    AND DATE(prev.session_date) <= DATE_SUB(DATE(current.session_date), INTERVAL 1 DAY)  -- At least 1 day before
    AND prev.session_status NOT IN ('Cancelled', 'Rescheduled - Make-up Booked', 'Rescheduled - Pending Make-up', 'Sick Leave - Make-up Booked', 'Sick Leave - Pending Make-up')
    AND prev.id = (
        SELECT MAX(id) 
        FROM session_log sl_inner 
        WHERE sl_inner.student_id = current.student_id 
        AND sl_inner.session_date < current.session_date
        AND DATE(sl_inner.session_date) <= DATE_SUB(DATE(current.session_date), INTERVAL 1 DAY)
        AND sl_inner.session_status NOT IN ('Cancelled', 'Rescheduled - Make-up Booked', 'Rescheduled - Pending Make-up', 'Sick Leave - Make-up Booked', 'Sick Leave - Pending Make-up')
    )
)

-- Get ALL homework assignments from that previous session
JOIN session_exercises se ON (
    se.session_id = prev.id 
    AND se.exercise_type = 'HW'
)

-- Join tutor info for who assigned the homework
LEFT JOIN tutors t_prev ON prev.tutor_id = t_prev.id

-- Check if this specific homework assignment has already been checked
LEFT JOIN homework_completion hc ON (
    hc.current_session_id = current.id 
    AND hc.session_exercise_id = se.id
)

WHERE current.session_status IN ('Scheduled', 'Attended', 'Attended (Make-up)', 'Make-up Class', 'Trial Class')
ORDER BY current.session_date DESC, s.student_name, se.pdf_name;

-- Create view for homework completion history per student
CREATE OR REPLACE VIEW student_homework_history AS
SELECT 
    s.id as student_id,
    s.student_name,
    hc.current_session_id,
    current_session.session_date as check_date,
    current_session.tutor_id as checked_by_tutor_id,
    t_checked.tutor_name as checked_by_tutor,
    
    -- Assignment details
    hc.pdf_name,
    CASE 
        WHEN hc.page_start IS NOT NULL AND hc.page_end IS NOT NULL 
        THEN CONCAT('p.', hc.page_start, '-', hc.page_end)
        WHEN hc.page_start IS NOT NULL 
        THEN CONCAT('p.', hc.page_start)
        ELSE 'Complete PDF'
    END as pages,
    hc.exercise_remarks,
    hc.assigned_date,
    hc.assigned_by_tutor_id,
    t_assigned.tutor_name as assigned_by_tutor,
    
    -- Completion tracking
    hc.completion_status,
    hc.submitted,
    hc.tutor_comments,
    hc.checked_at,
    
    -- Performance indicators
    CASE 
        WHEN hc.completion_status = 'Completed' THEN '✅'
        WHEN hc.completion_status = 'Partially Completed' THEN '⚠️' 
        WHEN hc.completion_status = 'Not Completed' THEN '❌'
        ELSE '⏸️'
    END as status_emoji,
    
    CASE 
        WHEN hc.completion_status = 'Completed' THEN 1
        WHEN hc.completion_status = 'Partially Completed' THEN 0.5
        WHEN hc.completion_status = 'Not Completed' THEN 0
        ELSE NULL
    END as completion_score

FROM homework_completion hc
JOIN session_log current_session ON hc.current_session_id = current_session.id
JOIN students s ON hc.student_id = s.id
LEFT JOIN tutors t_checked ON current_session.tutor_id = t_checked.id
LEFT JOIN tutors t_assigned ON hc.assigned_by_tutor_id = t_assigned.id

ORDER BY s.student_name, hc.assigned_date DESC, hc.pdf_name;


-- Test the views work correctly
SELECT 'Testing homework_to_check view...' as test_step;
SELECT COUNT(*) as pending_homework_checks FROM homework_to_check WHERE check_status = 'Pending';

SELECT 'Testing student_homework_history view...' as test_step;  
SELECT COUNT(*) as total_homework_records FROM student_homework_history;


SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1);
SET UNIQUE_CHECKS=IFNULL(@OLD_UNIQUE_CHECKS, 1);

SELECT 'MIGRATION 010 COMPLETED SUCCESSFULLY' as final_status;

-- =====================================================
-- END Migration 010: Homework Completion Tracking MVP
-- =====================================================