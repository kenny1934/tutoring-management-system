-- Migration: Add path alias definitions for cross-user file path sharing
-- When: 2025-12-19
-- Purpose: Allow admin to define path aliases (e.g., "Center", "Archive") that users
--          can map to their local drive letters for consistent file path sharing

-- Path alias definitions (admin-managed)
CREATE TABLE IF NOT EXISTS `path_alias_definitions` (
    `id` INTEGER PRIMARY KEY AUTO_INCREMENT,
    `alias` VARCHAR(255) NOT NULL UNIQUE,
    `description` TEXT,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert some common default aliases
INSERT INTO `path_alias_definitions` (`alias`, `description`) VALUES
    ('Courseware Developer 中學', 'MCSA Official Drive'),
    ('Center', 'Center Drive from HK'),
    ('MSA Staff', 'MSA Staff'),
    ('MSB Staff', 'MSB Staff');