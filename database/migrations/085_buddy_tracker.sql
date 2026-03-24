-- 085: Buddy Tracker for Primary Branches
-- Extends buddy group system to support primary branch staff tracking buddy registrations
-- and cross-branch sibling buddy groups.

-- 1. Make config_id nullable (primary-created groups don't have a summer course config)
ALTER TABLE summer_buddy_groups MODIFY config_id INT NULL;

-- 2. Add year column for year-scoped buddy groups
ALTER TABLE summer_buddy_groups ADD COLUMN year INT NULL AFTER config_id;

-- 3. Backfill year from existing configs
UPDATE summer_buddy_groups bg
  JOIN summer_course_configs c ON bg.config_id = c.id
  SET bg.year = c.year;

-- 4. Index on year for buddy tracker queries
CREATE INDEX idx_buddy_year ON summer_buddy_groups(year);

-- 5. Create summer_buddy_members table for primary branch entries
CREATE TABLE IF NOT EXISTS summer_buddy_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    buddy_group_id INT NOT NULL,
    student_id VARCHAR(50) NOT NULL COMMENT 'Primary branch student ID e.g. MAC1234',
    student_name_en VARCHAR(255) NOT NULL,
    student_name_zh VARCHAR(255),
    parent_phone VARCHAR(50),
    source_branch VARCHAR(10) NOT NULL COMMENT 'MAC/MCP/MNT/MTA/MLT/MTR/MOT',
    is_sibling BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'True if cross-branch join confirmed as sibling',
    year INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (buddy_group_id) REFERENCES summer_buddy_groups(id) ON DELETE CASCADE,
    INDEX idx_member_group (buddy_group_id),
    INDEX idx_member_branch_year (source_branch, year),
    INDEX idx_member_student (student_id)
) COMMENT 'Primary branch buddy group members tracked by branch staff';
