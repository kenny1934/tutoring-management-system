-- Migration: Add debug_audit_logs table for Super Admin debug panel
-- This table stores an audit trail of all operations performed through the debug panel

CREATE TABLE IF NOT EXISTS debug_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,

    -- Who performed the action
    admin_id INT NOT NULL,
    admin_email VARCHAR(255) NOT NULL COMMENT 'Denormalized for historical record',

    -- What was done
    operation VARCHAR(20) NOT NULL COMMENT 'CREATE, UPDATE, DELETE',
    table_name VARCHAR(100) NOT NULL,
    row_id INT NULL COMMENT 'NULL for CREATE before insert',

    -- Before/after state for auditing
    before_state TEXT NULL COMMENT 'JSON snapshot before change',
    after_state TEXT NULL COMMENT 'JSON snapshot after change',
    changed_fields TEXT NULL COMMENT 'JSON list of changed field names',

    -- Request context
    ip_address VARCHAR(45) NULL,

    -- When
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Indexes for efficient querying
    INDEX idx_audit_admin (admin_id),
    INDEX idx_audit_table (table_name),
    INDEX idx_audit_created (created_at DESC),
    INDEX idx_audit_operation (operation),

    -- Foreign key
    FOREIGN KEY (admin_id) REFERENCES tutors(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
