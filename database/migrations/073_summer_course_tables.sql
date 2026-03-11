-- Summer Course Feature: tables for application form, buddy groups, course slots, and placements

-- 1. Admin-defined course parameters per year
CREATE TABLE IF NOT EXISTS summer_course_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    year INT NOT NULL,
    title VARCHAR(500) NOT NULL COMMENT 'Bilingual display title',
    description TEXT COMMENT 'Bilingual description shown on form',
    application_open_date DATETIME NOT NULL,
    application_close_date DATETIME NOT NULL,
    course_start_date DATE NOT NULL,
    course_end_date DATE NOT NULL,
    total_lessons INT NOT NULL DEFAULT 8,
    pricing_config JSON NOT NULL COMMENT 'Flexible pricing: {base_fee, registration_fee, discounts: [{code, name_zh, name_en, amount, conditions: {before_date?, min_group_size?}}]}',
    locations JSON NOT NULL COMMENT '[{name, name_en, address, address_en, open_days: [day_names]}]',
    available_grades JSON NOT NULL COMMENT '["F1","F2","F3"]',
    time_slots JSON NOT NULL COMMENT '["10:00 - 11:30","11:45 - 13:15",...]',
    existing_student_options JSON COMMENT '["MathConcept Education","MathConcept Secondary Academy","None"]',
    center_options JSON COMMENT '[{name, name_en}]',
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_summer_year (year),
    INDEX idx_summer_active (is_active)
) COMMENT 'Configuration for each summer course offering';

-- 2. Buddy groups for group discount
CREATE TABLE IF NOT EXISTS summer_buddy_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_id INT NOT NULL,
    buddy_code VARCHAR(20) NOT NULL COMMENT 'Shareable code like BG-7X3K',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (config_id) REFERENCES summer_course_configs(id) ON DELETE CASCADE,
    UNIQUE KEY uq_buddy_code (buddy_code),
    INDEX idx_buddy_config (config_id)
) COMMENT 'Buddy groups for group discount eligibility';

-- 3. Public-submitted applications
CREATE TABLE IF NOT EXISTS summer_applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_id INT NOT NULL,
    reference_code VARCHAR(20) NOT NULL COMMENT 'Public reference e.g. SC2026-00042',
    student_name VARCHAR(255) NOT NULL,
    school VARCHAR(255),
    grade VARCHAR(50) NOT NULL COMMENT 'Grade entering in September (F1/F2/F3)',
    lang_stream VARCHAR(10) COMMENT 'CMI or EMI',
    is_existing_student VARCHAR(100) COMMENT 'MathConcept Education / Secondary Academy / None',
    current_centers JSON DEFAULT NULL COMMENT 'Selected center names if existing student',
    wechat_id VARCHAR(100),
    contact_phone VARCHAR(50),
    preferred_location VARCHAR(255) COMMENT 'Selected branch name',
    preference_1_day VARCHAR(20),
    preference_1_time VARCHAR(50),
    preference_2_day VARCHAR(20),
    preference_2_time VARCHAR(50),
    unavailability_notes TEXT COMMENT 'Dates student cannot attend',
    buddy_group_id INT NULL,
    buddy_names TEXT COMMENT 'Friends names entered manually for admin matching',
    existing_student_id INT NULL COMMENT 'Linked CSM student record if identified',
    application_status ENUM(
        'Submitted', 'Under Review', 'Placement Offered', 'Placement Confirmed',
        'Fee Sent', 'Paid', 'Enrolled', 'Waitlisted', 'Withdrawn', 'Rejected'
    ) NOT NULL DEFAULT 'Submitted',
    admin_notes TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(255),
    reviewed_at DATETIME,
    form_language VARCHAR(10) DEFAULT 'zh' COMMENT 'zh or en',
    FOREIGN KEY (config_id) REFERENCES summer_course_configs(id),
    FOREIGN KEY (buddy_group_id) REFERENCES summer_buddy_groups(id) ON DELETE SET NULL,
    FOREIGN KEY (existing_student_id) REFERENCES students(id) ON DELETE SET NULL,
    UNIQUE KEY uq_app_reference (reference_code),
    INDEX idx_app_config (config_id),
    INDEX idx_app_status (application_status),
    INDEX idx_app_phone (contact_phone),
    INDEX idx_app_grade (grade),
    INDEX idx_app_buddy (buddy_group_id)
) COMMENT 'Public summer course applications';

-- 4. Timetable slots (created by admin during arrangement)
CREATE TABLE IF NOT EXISTS summer_course_slots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_id INT NOT NULL,
    slot_day VARCHAR(20) NOT NULL COMMENT 'Day of week',
    time_slot VARCHAR(50) NOT NULL COMMENT 'e.g. 10:00 - 11:30',
    location VARCHAR(255) NOT NULL,
    grade VARCHAR(50) COMMENT 'Target grade (F1/F2/F3)',
    course_type VARCHAR(10) COMMENT 'A or B for lesson number offset',
    tutor_id INT NULL,
    max_students INT NOT NULL DEFAULT 6,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (config_id) REFERENCES summer_course_configs(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE SET NULL,
    UNIQUE KEY uq_slot (config_id, slot_day, time_slot, location),
    INDEX idx_slot_config (config_id)
) COMMENT 'Available time slots for summer course timetable';

-- 5. Student placements into slots
CREATE TABLE IF NOT EXISTS summer_placements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    application_id INT NOT NULL,
    slot_id INT NOT NULL,
    lesson_number INT NULL COMMENT '1-8, used for flexible student tracking',
    specific_date DATE NULL COMMENT 'Specific session date for flexible students',
    placement_status ENUM('Tentative', 'Confirmed', 'Cancelled') NOT NULL DEFAULT 'Tentative',
    placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    placed_by VARCHAR(255),
    FOREIGN KEY (application_id) REFERENCES summer_applications(id) ON DELETE CASCADE,
    FOREIGN KEY (slot_id) REFERENCES summer_course_slots(id) ON DELETE CASCADE,
    INDEX idx_placement_app (application_id),
    INDEX idx_placement_slot (slot_id)
) COMMENT 'Student placements into specific summer course slots';
