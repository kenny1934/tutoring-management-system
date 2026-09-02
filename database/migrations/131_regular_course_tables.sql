-- Regular Course Application: tables for the September-intake public form.
--
-- Stripped-down mirror of the summer application system (073/099): no buddy
-- groups, no discount tiers, no placement subsystem, single weekly slot with
-- a first-choice + backup preference pair. Payment/fee state lives on the
-- published Enrollment, so the status enum has no Fee Sent / Paid rungs.

-- 1. Admin-defined course parameters per intake year
CREATE TABLE IF NOT EXISTS regular_course_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    year INT NOT NULL COMMENT 'Intake year, e.g. 2026 for the Sep 2026 start',
    title VARCHAR(500) NOT NULL COMMENT 'Bilingual display title',
    description TEXT COMMENT 'Bilingual description shown on form',
    application_open_date DATETIME NOT NULL,
    application_close_date DATETIME NOT NULL,
    course_start_date DATE NOT NULL COMMENT 'Earliest first-lesson date. Lessons start the first occurrence of the chosen weekday on/after this',
    locations JSON NOT NULL COMMENT '[{name, name_en, address, address_en, open_days, open_days_label(_en), time_slots: {day: [slots]}}]',
    available_grades JSON NOT NULL COMMENT '[{name, name_en, value, admin_only?}]',
    time_slots JSON NOT NULL COMMENT 'Flat fallback list. Per-day truth lives in locations[].time_slots',
    existing_student_options JSON COMMENT '[{name, name_en}]',
    center_options JSON COMMENT '[{name, name_en}]',
    lang_stream_options JSON COMMENT '[{name, name_en, value}]',
    text_content JSON COMMENT 'Bilingual copy overrides consumed by the form',
    course_intro JSON COMMENT '{headline: {zh,en}, pillars: [{zh,en}], philosophy: {zh,en}}',
    banner_image_url VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_regular_year (year),
    INDEX idx_regular_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT 'Configuration per regular-course intake';

-- 2. Public-submitted applications
CREATE TABLE IF NOT EXISTS regular_applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_id INT NOT NULL,
    reference_code VARCHAR(20) NOT NULL COMMENT 'Public reference e.g. RC2026-K7X3M',
    student_name VARCHAR(255) NOT NULL,
    school VARCHAR(255),
    grade VARCHAR(50) NOT NULL COMMENT 'Grade in September (F1-F4)',
    lang_stream VARCHAR(10) COMMENT 'CMI / EMI / IS',
    is_existing_student VARCHAR(100) COMMENT 'MathConcept Education / Secondary Academy / None',
    current_centers JSON DEFAULT NULL COMMENT 'Selected center names if existing student',
    wechat_id VARCHAR(100),
    contact_phone VARCHAR(50),
    preferred_location VARCHAR(255) COMMENT 'Selected branch name',
    preference_1_day VARCHAR(20) COMMENT 'First-choice weekday',
    preference_1_time VARCHAR(50),
    preference_2_day VARCHAR(20) COMMENT 'Backup weekday',
    preference_2_time VARCHAR(50),
    existing_student_id INT NULL COMMENT 'Linked CSM student record if identified',
    application_status ENUM(
        'Submitted', 'Under Review', 'Schedule Confirmed', 'Enrolled',
        'Waitlisted', 'Withdrawn', 'Rejected'
    ) NOT NULL DEFAULT 'Submitted',
    admin_notes TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    reviewed_by VARCHAR(255),
    reviewed_at DATETIME,
    form_language VARCHAR(10) DEFAULT 'zh' COMMENT 'zh or en',
    FOREIGN KEY (config_id) REFERENCES regular_course_configs(id),
    FOREIGN KEY (existing_student_id) REFERENCES students(id) ON DELETE SET NULL,
    UNIQUE KEY uq_rapp_reference (reference_code),
    INDEX idx_rapp_config (config_id),
    INDEX idx_rapp_status (application_status),
    INDEX idx_rapp_phone (contact_phone),
    INDEX idx_rapp_grade (grade)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT 'Public regular course applications';

-- 3. Audit trail for application edits (clone of 099 for regular)
CREATE TABLE IF NOT EXISTS regular_application_edits (
  id BIGINT NOT NULL AUTO_INCREMENT,
  application_id INT NOT NULL,
  edited_at DATETIME NOT NULL,
  field_name VARCHAR(64) NOT NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  edited_via VARCHAR(16) NOT NULL,
  edited_by VARCHAR(255) NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_regular_edit_application
    FOREIGN KEY (application_id) REFERENCES regular_applications(id)
    ON DELETE CASCADE,
  INDEX idx_regular_edit_app_time (application_id, edited_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
