-- =====================================================
-- Migration 013: Multiple File Uploads for Homework
-- =====================================================
-- Replaces single homework_photo with flexible homework_files table
-- Supports multiple images, PDFs, or mixed file types per homework

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;

-- Create homework_files table for multiple file attachments
CREATE TABLE homework_files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    homework_completion_id INT NOT NULL COMMENT 'Links to homework_completion record',
    file_path VARCHAR(500) NOT NULL COMMENT 'File storage path/URL',
    file_type ENUM('image', 'pdf', 'document') NOT NULL COMMENT 'Type of file uploaded',
    file_name VARCHAR(255) COMMENT 'Original filename for display purposes',
    file_size_kb INT COMMENT 'File size in kilobytes for storage tracking',
    file_order INT DEFAULT 1 COMMENT 'Display order when multiple files exist',
    uploaded_at TIMESTAMP DEFAULT (CONVERT_TZ(NOW(), '+00:00', '+08:00')) COMMENT 'HK time upload timestamp',
    uploaded_by VARCHAR(255) COMMENT 'Email of tutor who uploaded the file',

    FOREIGN KEY (homework_completion_id) REFERENCES homework_completion(id) ON DELETE CASCADE,
    INDEX idx_homework_files (homework_completion_id, file_order),
    INDEX idx_file_type (file_type),
    INDEX idx_uploaded_by (uploaded_by)
) COMMENT 'Stores multiple file attachments (images/PDFs) for homework submissions';

-- Remove the old single homework_photo column from homework_completion
ALTER TABLE homework_completion
DROP COLUMN homework_photo;

-- Update homework_to_check view to include file attachment info
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

    -- Completion status and rating (from homework_completion)
    COALESCE(hc.completion_status, 'Not Checked') as completion_status,
    hc.homework_rating,
    COALESCE(hc.submitted, FALSE) as submitted,
    hc.tutor_comments,
    hc.checked_by,
    hc.checked_at,

    -- File attachment summary
    COUNT(hf.id) as attachment_count,
    GROUP_CONCAT(
        DISTINCT CASE
            WHEN hf.file_type = 'image' THEN 'Photos'
            WHEN hf.file_type = 'pdf' THEN 'PDFs'
            WHEN hf.file_type = 'document' THEN 'Documents'
            ELSE hf.file_type
        END
        ORDER BY hf.file_type
        SEPARATOR ', '
    ) as attachment_types,

    -- Status indicators for AppSheet
    CASE
        WHEN hc.id IS NULL THEN 'Pending'
        ELSE 'Checked'
    END as check_status,

    CASE
        WHEN hc.id IS NULL THEN 'Yes'
        ELSE 'Already Checked'
    END as has_homework_to_check

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

-- Join file attachments for this homework
LEFT JOIN homework_files hf ON hc.id = hf.homework_completion_id

WHERE current.session_status IN ('Scheduled', 'Attended', 'Attended (Make-up)', 'Make-up Class', 'Trial Class')
GROUP BY
    current.id, current.student_id, current.tutor_id, current.session_date,
    s.student_name, t_current.tutor_name,
    prev.id, prev.session_date, prev.tutor_id, t_prev.tutor_name,
    se.id, se.pdf_name, se.page_start, se.page_end, se.remarks,
    hc.id, hc.completion_status, hc.homework_rating, hc.submitted,
    hc.tutor_comments, hc.checked_by, hc.checked_at
ORDER BY current.session_date DESC, s.student_name, se.pdf_name;

-- Update student_homework_history view to include file attachment info
CREATE OR REPLACE VIEW student_homework_history AS
SELECT
    hc.id as completion_id,
    hc.student_id,
    s.student_name,
    hc.assigned_date,
    hc.pdf_name,
    CASE
        WHEN hc.page_start IS NOT NULL AND hc.page_end IS NOT NULL
        THEN CONCAT('p.', hc.page_start, '-', hc.page_end)
        WHEN hc.page_start IS NOT NULL
        THEN CONCAT('p.', hc.page_start)
        ELSE ''
    END as pages,
    hc.exercise_remarks as assignment_notes,

    -- Completion details with rating
    hc.completion_status,
    hc.homework_rating,
    hc.submitted,
    hc.tutor_comments,

    -- File attachment summary
    COUNT(hf.id) as file_count,
    GROUP_CONCAT(
        CONCAT(hf.file_name, ' (', UPPER(hf.file_type), ')')
        ORDER BY hf.file_order
        SEPARATOR '; '
    ) as attached_files,

    -- Separate counts by type
    SUM(CASE WHEN hf.file_type = 'image' THEN 1 ELSE 0 END) as image_count,
    SUM(CASE WHEN hf.file_type = 'pdf' THEN 1 ELSE 0 END) as pdf_count,

    -- Session context
    current_session.session_date as checked_date,
    t_checked.tutor_name as checked_by_tutor,
    t_assigned.tutor_name as assigned_by_tutor,

    -- Visual indicators
    CASE
        WHEN hc.completion_status = 'Completed' THEN '✅'
        WHEN hc.completion_status = 'Partially Completed' THEN '⚠️'
        WHEN hc.completion_status = 'Not Completed' THEN '❌'
        ELSE '❓'
    END as status_icon,

    -- Completion score for analytics
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
LEFT JOIN homework_files hf ON hc.id = hf.homework_completion_id

GROUP BY
    hc.id, hc.student_id, s.student_name, hc.assigned_date, hc.pdf_name,
    hc.page_start, hc.page_end, hc.exercise_remarks,
    hc.completion_status, hc.homework_rating, hc.submitted, hc.tutor_comments,
    current_session.session_date, t_checked.tutor_name, t_assigned.tutor_name

ORDER BY s.student_name, hc.assigned_date DESC, hc.pdf_name;

-- Test the updated views
SELECT 'Testing homework_to_check view with file attachments...' as test_step;
SELECT COUNT(*) as pending_homework_checks FROM homework_to_check WHERE check_status = 'Pending';

SELECT 'Testing student_homework_history view with file attachments...' as test_step;
SELECT COUNT(*) as total_homework_records FROM student_homework_history;

-- Test file types
SELECT 'Testing file type enum values...' as test_step;
SHOW COLUMNS FROM homework_files LIKE 'file_type';

SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1);
SET UNIQUE_CHECKS=IFNULL(@OLD_UNIQUE_CHECKS, 1);

SELECT 'MIGRATION 013 COMPLETED SUCCESSFULLY - Multiple file uploads now supported for homework' as final_status;

-- =====================================================
-- END Migration 013: Homework Multiple Files
-- =====================================================