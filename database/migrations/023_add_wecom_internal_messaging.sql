-- =====================================================
-- Migration 023: Add WeCom Internal Messaging Support
-- =====================================================
-- Purpose: Support WeCom group robot webhooks for internal team notifications
-- Phase 1: Internal messaging only (no external contacts, no views)

SELECT 'Adding WeCom internal messaging support...' as status;

-- ============================================================================
-- CREATE WECOM WEBHOOK CONFIGURATIONS TABLE
-- ============================================================================

CREATE TABLE wecom_webhooks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    webhook_name VARCHAR(100) NOT NULL UNIQUE COMMENT 'Identifier like admin_group, tutor_group',
    webhook_url TEXT NOT NULL COMMENT 'Full webhook URL with key from WeCom robot',
    target_description VARCHAR(255) COMMENT 'Description of who receives these messages',

    -- Configuration
    is_active BOOLEAN DEFAULT TRUE,

    -- Tracking
    last_used_at TIMESTAMP NULL,
    total_messages_sent INT DEFAULT 0,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255),
    notes TEXT,

    INDEX idx_active (is_active)
) COMMENT 'WeCom group robot webhook configurations';

-- Insert placeholder webhooks (update with actual URLs after creating robots)
INSERT INTO wecom_webhooks (webhook_name, webhook_url, target_description, notes) VALUES
('admin_group', 'PLACEHOLDER_UPDATE_AFTER_CREATING_ROBOT', 'Admin team notifications', 'Update webhook_url after creating WeCom robot'),
('tutor_group', 'PLACEHOLDER_UPDATE_AFTER_CREATING_ROBOT', 'Tutor team notifications', 'Update webhook_url after creating WeCom robot');

SELECT 'WeCom webhooks table created with placeholders.' as result;

-- ============================================================================
-- CREATE MESSAGE LOG TABLE
-- ============================================================================

CREATE TABLE wecom_message_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    webhook_name VARCHAR(100) NOT NULL,
    message_type VARCHAR(50) COMMENT 'fee_reminder, attendance_alert, etc.',
    message_content TEXT NOT NULL,

    -- Related data (optional)
    enrollment_id INT NULL,
    session_id INT NULL,

    -- Status
    send_status VARCHAR(20) DEFAULT 'pending' COMMENT 'pending, sent, failed',
    send_timestamp TIMESTAMP NULL,
    error_message TEXT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE SET NULL,
    FOREIGN KEY (session_id) REFERENCES session_log(id) ON DELETE SET NULL,
    INDEX idx_webhook (webhook_name),
    INDEX idx_status (send_status),
    INDEX idx_created (created_at)
) COMMENT 'Log of WeCom messages sent to groups';

SELECT 'Message log table created.' as result;

-- ============================================================================
-- OPTIONAL: Add WeCom user ID to tutors for @mentions
-- ============================================================================

ALTER TABLE tutors
ADD COLUMN wecom_userid VARCHAR(100) NULL COMMENT 'WeCom username for @mentions in group messages';

SELECT 'Added optional WeCom userid to tutors table.' as result;

SELECT 'MIGRATION 023 COMPLETED - Internal WeCom messaging ready.' as final_status;

-- =====================================================
-- END Migration 023
-- =====================================================