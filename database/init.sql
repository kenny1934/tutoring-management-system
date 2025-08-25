CREATE TABLE tutors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL UNIQUE,
    tutor_name VARCHAR(255) NOT NULL,
    default_location VARCHAR(255),
    role VARCHAR(50) NOT NULL,
    profile_picture VARCHAR(500) NULL COMMENT 'AppSheet file path for tutor profile picture'
);

CREATE TABLE students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    school_student_id VARCHAR(100),
    student_name VARCHAR(255) NOT NULL,
    grade VARCHAR(50),
    phone VARCHAR(100),
    school VARCHAR(255),
    lang_stream VARCHAR(50),
    home_location VARCHAR(50),
    UNIQUE KEY unique_student_location (school_student_id, home_location)
);

CREATE TABLE enrollments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT,
    tutor_id INT,
    assigned_day VARCHAR(100),
    assigned_time VARCHAR(100),
    location VARCHAR(100),
    lessons_paid INT,
    payment_date DATE,
    first_lesson_date DATE,
    payment_status VARCHAR(100) DEFAULT 'Pending Payment',
    fee_message_sent BOOLEAN DEFAULT FALSE,
    remark TEXT,
    discount_id INT,
    last_modified_by VARCHAR(255),
    last_modified_time DATETIME DEFAULT (CONVERT_TZ(NOW(), '+00:00', '+08:00')),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (tutor_id) REFERENCES tutors(id),
    FOREIGN KEY (discount_id) REFERENCES discounts(id)
);

CREATE TABLE session_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id INT NULL,
    student_id INT,
    tutor_id INT,
    session_date DATE,
    time_slot VARCHAR(100),
    location VARCHAR(100),
    session_status VARCHAR(100) DEFAULT 'Scheduled',
    financial_status VARCHAR(100) DEFAULT 'Unpaid',
    notes TEXT,
    attendance_marked_by VARCHAR(255),
    attendance_mark_time DATETIME,
    created_at TIMESTAMP DEFAULT (CONVERT_TZ(NOW(), '+00:00', '+08:00')),
    previous_session_status VARCHAR(100),
    last_modified_by VARCHAR(255),
    last_modified_time DATETIME DEFAULT (CONVERT_TZ(NOW(), '+00:00', '+08:00')),
    make_up_for_id INT,
    rescheduled_to_id INT,
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (tutor_id) REFERENCES tutors(id)
);

CREATE TABLE discounts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    discount_name VARCHAR(255) NOT NULL,
    discount_type VARCHAR(50),
    discount_value DECIMAL(10, 2),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE holidays (
    id INT AUTO_INCREMENT PRIMARY KEY,
    holiday_date DATE NOT NULL UNIQUE,
    holiday_name VARCHAR(255)
);

CREATE TABLE planned_reschedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id INT NOT NULL,
    planned_date DATE NOT NULL,
    reason VARCHAR(500),
    status VARCHAR(20) DEFAULT 'Pending', -- 'Pending', 'Applied', 'Cancelled'
    requested_date DATE NOT NULL,
    requested_by VARCHAR(255),
    notes TEXT,
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
    INDEX idx_enrollment_date (enrollment_id, planned_date)
);

CREATE TABLE tutor_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_tutor_id INT NOT NULL,
    to_tutor_id INT NULL COMMENT 'NULL = broadcast to all tutors',
    subject VARCHAR(200),
    message TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'Normal' COMMENT 'Normal, High, Urgent',
    category VARCHAR(50) COMMENT 'Reminder, Question, Announcement, Schedule, Handover',
    created_at TIMESTAMP DEFAULT (CONVERT_TZ(NOW(), '+00:00', '+08:00')),
    image_attachment VARCHAR(500) NULL COMMENT 'AppSheet file path for uploaded image',
    reply_to_id INT NULL COMMENT 'Reference to parent message for threading',
    FOREIGN KEY (from_tutor_id) REFERENCES tutors(id),
    FOREIGN KEY (to_tutor_id) REFERENCES tutors(id),
    FOREIGN KEY (reply_to_id) REFERENCES tutor_messages(id),
    INDEX idx_to_tutor (to_tutor_id),
    INDEX idx_from_tutor (from_tutor_id),
    INDEX idx_created (created_at DESC),
    INDEX idx_thread (reply_to_id)
) COMMENT 'Tutor communication board for inter-tutor messaging';

CREATE TABLE message_read_receipts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    tutor_id INT NOT NULL,
    read_at TIMESTAMP DEFAULT (CONVERT_TZ(NOW(), '+00:00', '+08:00')),
    FOREIGN KEY (message_id) REFERENCES tutor_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id),
    UNIQUE KEY unique_message_reader (message_id, tutor_id),
    INDEX idx_tutor_unread (tutor_id, read_at),
    INDEX idx_message_readers (message_id)
) COMMENT 'Tracks which tutors have read which messages - supports broadcast message read status';

INSERT INTO holidays (holiday_date, holiday_name) VALUES
('2024-09-18', 'Mid-Autumn Festival'),
('2024-10-01', 'National Day'),
('2024-10-11', 'Chung Yeung Festival'),
('2024-10-28', 'Company Trip'),
('2024-10-29', 'Company Trip'),
('2024-10-30', 'Company Trip'),
('2024-10-31', 'Company Trip'),
('2024-11-01', 'Company Trip'),
('2024-11-02', 'Company Trip'),
('2024-12-20', 'Macau SAR Day'),
('2024-12-25', 'Christmas Day'),
('2024-12-26', 'The first weekday after Christmas Day'),
('2024-12-27', 'Christmas Holiday'),
('2024-12-28', 'Christmas Holiday'),
('2025-01-01', 'New Year''s Day'),
('2025-01-28', 'Chinese New Year''s Eve'),
('2025-01-29', 'Chinese New Year''s Day'),
('2025-01-30', 'The second day of Chinese New Year'),
('2025-01-31', 'The third day of Chinese New Year'),
('2025-03-16', 'School Holiday'),
('2025-03-17', 'School Holiday'),
('2025-04-04', 'Ching Ming Festival'),
('2025-04-19', 'Good Friday'),
('2025-04-20', 'Easter Monday'),
('2025-05-01', 'Labour Day'),
('2025-05-27', 'Buddha''s Birthday'),
('2025-07-01', 'HKSAR Establishment Day'),
('2025-09-22', 'School Holiday'),
('2025-10-01', 'Mid-Autumn Festival'),
('2025-10-07', 'Chung Yeung Festival'),
('2025-10-29', 'Chung Yeung Festival'),
('2025-12-20', 'Macau SAR Day'),
('2025-12-21', 'Christmas Holiday'),
('2025-12-22', 'Christmas Holiday'),
('2025-12-23', 'Christmas Holiday'),
('2025-12-24', 'Christmas Eve'),
('25-12-25', 'Christmas Day'),
('25-12-26', 'The first weekday after Christmas Day');


/*
  IMPORTANT: The following `CREATE FUNCTION` statement needs to be executed separately from the rest of the script.
  Most SQL clients execute statements one by one, separated by a semicolon (;).
  Because the function body itself contains semicolons, you must handle it specially.

  If you are using a command-line client (like MySQL Shell or mysql), you must first
  change the delimiter before running the `CREATE FUNCTION` block. For example:

  DELIMITER $
  CREATE FUNCTION calculate_end_date( ... )
  ...
  END$
  DELIMITER ;

  If you are using a graphical tool (like DBeaver, MySQL Workbench, or AppSheet's database editor),
  you can typically select the entire `CREATE FUNCTION...END` block and execute it as a single statement.
*/

DROP FUNCTION IF EXISTS calculate_end_date;

CREATE FUNCTION calculate_end_date(
    p_first_lesson_date DATE,
    p_lessons_paid INT
)
RETURNS DATE
READS SQL DATA
BEGIN
    DECLARE v_end_date DATE;
    DECLARE v_lessons_counted INT DEFAULT 0;
    DECLARE v_current_date DATE;
    DECLARE v_holiday_count INT;

    SET v_current_date = p_first_lesson_date;

    WHILE v_lessons_counted < p_lessons_paid DO
        -- Check if the current date is a holiday
        SELECT COUNT(*) INTO v_holiday_count FROM holidays WHERE holiday_date = v_current_date;

        IF v_holiday_count = 0 THEN
            SET v_lessons_counted = v_lessons_counted + 1;
            SET v_end_date = v_current_date;
        END IF;
        -- Move to the next week
        SET v_current_date = DATE_ADD(v_current_date, INTERVAL 1 WEEK);
    END WHILE;

    RETURN v_end_date;
END;

-- The view creation should be run after the function is successfully created.
DROP VIEW IF EXISTS active_enrollments_needing_renewal;

CREATE OR REPLACE VIEW active_enrollments_needing_renewal AS
SELECT
    e.*, -- Selects all columns from the enrollments table
    s.student_name,
    t.tutor_name,
    (
        SELECT COUNT(*)
        FROM session_log sl
        WHERE sl.enrollment_id = e.id AND sl.session_status = 'Scheduled'
    ) AS remaining_sessions,
    calculate_end_date(e.first_lesson_date, e.lessons_paid) AS end_date
FROM
    enrollments e
JOIN
    students s ON e.student_id = s.id
JOIN
    tutors t ON e.tutor_id = t.id
WHERE e.payment_status = 'Paid' AND e.id IN (
    -- This subquery finds enrollments with 1 or 2 sessions left
    SELECT enrollment_id
    FROM session_log
    WHERE enrollment_id IS NOT NULL AND session_status = 'Scheduled'
    GROUP BY enrollment_id
    HAVING COUNT(*) <= 2 AND COUNT(*) > 0
);