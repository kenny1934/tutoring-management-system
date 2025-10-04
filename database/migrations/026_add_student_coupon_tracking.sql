-- =====================================================
-- Migration 026: Add Student Coupon Tracking System
-- =====================================================
-- Purpose: Sync student discount coupons from company system (SOURCE OF TRUTH)
--          and auto-apply existing "Student Discount $300" during renewal
--
-- IMPORTANT: Company system is the source of truth!
--            We sync FROM company system, don't track usage ourselves.
--            After using a coupon in renewal, mark it used in company system.
--            Next file upload will reflect the updated count.

SELECT 'Adding student coupon tracking system...' as status;

-- ============================================================================
-- CREATE STUDENT COUPONS TABLE
-- ============================================================================

CREATE TABLE student_coupons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,

    -- Coupon data from company system
    available_coupons INT DEFAULT 0 COMMENT 'Number of discount coupons available',
    coupon_value DECIMAL(10,2) DEFAULT 300.00 COMMENT 'Value per coupon (usually $300)',

    -- Sync tracking
    last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'When synced from company system',
    last_synced_by VARCHAR(255) COMMENT 'Who uploaded the company system file',
    sync_source_file VARCHAR(500) COMMENT 'Filename of company system Excel file',

    -- Notes
    notes TEXT COMMENT 'Any special notes about coupons',

    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    UNIQUE KEY unique_student_coupon (student_id),
    INDEX idx_has_coupons (available_coupons)
) COMMENT 'Syncs discount coupon availability from company system (source of truth)';

SELECT 'Created student_coupons table.' as result;

-- ============================================================================
-- CREATE COUPON FILE UPLOADS TABLE (for tracking uploads)
-- ============================================================================

CREATE TABLE coupon_file_uploads (
    id INT AUTO_INCREMENT PRIMARY KEY,

    -- File info
    file_name VARCHAR(500) NOT NULL COMMENT 'Original filename',
    file_path VARCHAR(1000) COMMENT 'AppSheet file path',
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_by VARCHAR(255) NOT NULL COMMENT 'User who uploaded',

    -- Processing status
    process_status VARCHAR(50) DEFAULT 'Pending' COMMENT 'Pending, Processing, Completed, Failed',
    records_processed INT DEFAULT 0 COMMENT 'Number of students synced',
    process_notes TEXT COMMENT 'Any errors or warnings during sync',
    processed_at TIMESTAMP NULL,

    INDEX idx_status (process_status),
    INDEX idx_upload_date (upload_date DESC)
) COMMENT 'Tracks company system file uploads and sync status';

SELECT 'Created coupon_file_uploads table.' as result;

-- ============================================================================
-- CREATE VIEW: Students with Available Coupons
-- ============================================================================

CREATE OR REPLACE VIEW students_with_coupons AS
SELECT
    s.id as student_id,
    s.student_name,
    s.school_student_id,
    s.home_location,
    CONCAT(s.home_location, s.school_student_id) as company_id,
    sc.available_coupons,
    sc.coupon_value,
    sc.last_synced_at as coupon_data_synced,
    CASE
        WHEN sc.available_coupons > 0 THEN 'Yes'
        ELSE 'No'
    END as has_coupon_available
FROM students s
LEFT JOIN student_coupons sc ON s.id = sc.student_id;

SELECT 'Created students_with_coupons view.' as result;

-- ============================================================================
-- SAMPLE DATA (for testing)
-- ============================================================================

-- Uncomment to add test data
-- INSERT INTO student_coupons (student_id, available_coupons, coupon_value, last_synced_by, sync_source_file)
-- SELECT
--     id,
--     0,
--     300.00,
--     'system',
--     'initial_setup'
-- FROM students
-- LIMIT 10;

SELECT 'MIGRATION 026 COMPLETED - Coupon tracking system ready.' as final_status;
SELECT 'NEXT STEP: Upload coupon file via AppSheet to populate data.' as reminder;

-- =====================================================
-- END Migration 026
-- =====================================================
