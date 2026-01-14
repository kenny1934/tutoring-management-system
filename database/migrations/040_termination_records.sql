-- =====================================================
-- Migration 040: Termination Records for Quarterly Reporting
-- =====================================================
-- Purpose: Store user-editable termination data (reason, count checkbox)
-- for the quarterly termination reporting webapp page.
--
-- Uses in conjunction with terminated_students view (migration 028)
-- to track which students should be counted as terminated per quarter.

SELECT 'Creating termination_records table...' as status;

CREATE TABLE IF NOT EXISTS termination_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    quarter INT NOT NULL,
    year INT NOT NULL,
    reason TEXT NULL,
    count_as_terminated BOOLEAN DEFAULT FALSE,
    tutor_id INT NULL,
    updated_by VARCHAR(255) NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY unique_student_quarter_year (student_id, quarter, year),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE SET NULL,

    INDEX idx_quarter_year (quarter, year),
    INDEX idx_tutor_id (tutor_id),
    INDEX idx_count_as_terminated (count_as_terminated)
);

SELECT 'Migration 040 completed.' as final_status;
SELECT 'Use termination_records to store reason and count_as_terminated for quarterly reports.' as reminder;

-- =====================================================
-- END Migration 040
-- =====================================================
