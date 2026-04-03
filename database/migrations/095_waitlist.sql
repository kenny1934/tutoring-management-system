-- Waitlist: track prospective students and slot change requests

CREATE TABLE waitlist_entries (
    id INT PRIMARY KEY AUTO_INCREMENT,
    student_name VARCHAR(255) NOT NULL,
    school VARCHAR(255) NOT NULL,
    grade VARCHAR(50) NOT NULL,
    lang_stream VARCHAR(50) NULL,
    phone VARCHAR(50) NOT NULL,
    parent_name VARCHAR(255) NULL,
    notes TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    entry_type VARCHAR(20) NOT NULL DEFAULT 'New',
    student_id INT NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_waitlist_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
    CONSTRAINT fk_waitlist_created_by FOREIGN KEY (created_by) REFERENCES tutors(id),
    INDEX idx_waitlist_active (is_active),
    INDEX idx_waitlist_grade (grade),
    INDEX idx_waitlist_student (student_id),
    INDEX idx_waitlist_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE waitlist_slot_preferences (
    id INT PRIMARY KEY AUTO_INCREMENT,
    waitlist_entry_id INT NOT NULL,
    location VARCHAR(100) NOT NULL,
    day_of_week VARCHAR(10) NULL,
    time_slot VARCHAR(50) NULL,
    CONSTRAINT fk_waitpref_entry FOREIGN KEY (waitlist_entry_id) REFERENCES waitlist_entries(id) ON DELETE CASCADE,
    INDEX idx_waitpref_entry (waitlist_entry_id),
    INDEX idx_waitpref_location (location)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
