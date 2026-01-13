-- =====================================================
-- Migration 039: Location Settings Table
-- =====================================================
-- Purpose: Store per-location configurable settings
--          Initially for parent contact status thresholds
-- =====================================================

SELECT 'Creating location_settings table...' as status;

CREATE TABLE IF NOT EXISTS location_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    location VARCHAR(50) NOT NULL UNIQUE,
    contact_recent_days INT DEFAULT 28 COMMENT 'Days threshold for "Recent" contact status',
    contact_warning_days INT DEFAULT 50 COMMENT 'Days threshold for "Been a While" status (beyond this = Contact Needed)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_location (location)
) COMMENT 'Per-location configurable settings';

-- Insert default settings for existing locations
INSERT INTO location_settings (location, contact_recent_days, contact_warning_days)
VALUES
    ('MSA', 28, 50),
    ('MSB', 28, 50)
ON DUPLICATE KEY UPDATE
    location = VALUES(location);

SELECT 'Migration 039 completed successfully.' as final_status;

-- =====================================================
-- ROLLBACK SCRIPT (if needed):
-- DROP TABLE IF EXISTS location_settings;
-- =====================================================
