-- Add student_id for efficient dedup by student
ALTER TABLE report_shares ADD COLUMN student_id INT DEFAULT NULL AFTER report_data;

-- Composite index for student progress queries
CREATE INDEX idx_session_log_student_date ON session_log (student_id, session_date);
