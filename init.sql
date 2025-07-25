CREATE TABLE tutors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL UNIQUE,
    tutor_name VARCHAR(255) NOT NULL,
    default_location VARCHAR(255),
    role VARCHAR(50) NOT NULL
);

CREATE TABLE students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    school_student_id VARCHAR(100),
    student_name VARCHAR(255) NOT NULL,
    grade VARCHAR(50),
    phone VARCHAR(100),
    school VARCHAR(255),
    lang_stream VARCHAR(50),
    home_location VARCHAR(50)
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    previous_session_status VARCHAR(100),
    last_modified_by VARCHAR(255),
    last_modified_time DATETIME,
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