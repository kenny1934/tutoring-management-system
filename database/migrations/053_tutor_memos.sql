-- Migration 053: Tutor Memos
-- Purpose: Allow tutors to record lesson notes when sessions don't exist yet
-- (e.g., admin forgot to renew enrollment). Memos are auto-matched to sessions
-- when enrollments are created, then tutors can import the data.

SELECT 'Creating tutor_memos table...' as status;

CREATE TABLE IF NOT EXISTS tutor_memos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    tutor_id INT NOT NULL,
    memo_date DATE NOT NULL COMMENT 'Date the lesson actually happened',
    time_slot VARCHAR(50) COMMENT 'e.g. 16:45 - 18:15',
    location VARCHAR(50) COMMENT 'MSA, MSB, etc.',
    notes TEXT COMMENT 'Free-form tutor observations',
    exercises JSON COMMENT 'Array of {exercise_type, pdf_name, page_start, page_end, remarks, answer_pdf_name, answer_page_start, answer_page_end, answer_remarks}',
    performance_rating VARCHAR(10) COMMENT 'Star emoji rating like sessions',
    linked_session_id INT NULL COMMENT 'Set when auto-matched or manually linked to a session',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending = awaiting session, linked = imported into session',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(255) COMMENT 'Tutor email who created the memo',

    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id),
    FOREIGN KEY (linked_session_id) REFERENCES session_log(id) ON DELETE SET NULL,

    INDEX idx_memo_student_date (student_id, memo_date),
    INDEX idx_memo_status (status),
    INDEX idx_memo_tutor (tutor_id)
) COMMENT 'Tutor lesson memos for sessions that do not yet exist in the system';

SELECT 'Migration 053 completed successfully.' as result;

-- ROLLBACK:
-- DROP TABLE IF EXISTS tutor_memos;
