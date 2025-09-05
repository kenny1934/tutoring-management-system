-- Production Bulk Exercise Assignment - Staging Columns
-- Enables bulk assignment of classwork/homework to multiple sessions

-- Add staging columns to session_log for bulk exercise assignment
ALTER TABLE session_log 
ADD COLUMN bulk_pdf_name VARCHAR(255),
ADD COLUMN bulk_page_start INT,
ADD COLUMN bulk_page_end INT, 
ADD COLUMN bulk_exercise_remarks TEXT,
ADD COLUMN bulk_exercise_type VARCHAR(20); -- 'Classwork' or 'Homework'

-- Index for efficient cleanup operations (MySQL compatible)
CREATE INDEX idx_bulk_exercise_cleanup 
ON session_log(bulk_exercise_type);

-- Test the columns were added correctly
DESCRIBE session_log;