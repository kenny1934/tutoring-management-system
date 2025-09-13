-- Parent Communication Tracking System (MVP)
-- Allows tutors to log their communications with parents for accountability
-- Version: 009
-- Date: 2024-09-10

-- =====================================================
-- PURPOSE: Track when and how tutors communicate with parents
-- This is critical for assessing tutor responsibilities
-- =====================================================

-- Step 1: Create parent communications table
SELECT 'CREATING PARENT COMMUNICATIONS TABLE' as status;

CREATE TABLE IF NOT EXISTS parent_communications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    tutor_id INT NOT NULL,
    contact_date DATETIME DEFAULT (CONVERT_TZ(NOW(), '+00:00', '+08:00')),
    contact_method ENUM('WeChat', 'Phone', 'In-Person') DEFAULT 'WeChat',
    contact_type ENUM('Progress Update', 'Concern', 'Schedule', 'Payment', 'General', 'Homework', 'Behavior') DEFAULT 'Progress Update',
    what_was_discussed VARCHAR(500) COMMENT 'Summary of what was discussed in the conversation',
    follow_up_needed BOOLEAN DEFAULT FALSE,
    follow_up_date DATE NULL COMMENT 'When follow-up is needed by',
    created_at TIMESTAMP DEFAULT (CONVERT_TZ(NOW(), '+00:00', '+08:00')),
    created_by VARCHAR(255) DEFAULT 'system',
    
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id),
    INDEX idx_student_date (student_id, contact_date DESC),
    INDEX idx_tutor_date (tutor_id, contact_date DESC),
    INDEX idx_follow_up (follow_up_needed, follow_up_date)
) COMMENT 'Tracks all parent-tutor communications for accountability and follow-up';

-- Step 2: Create a view for easy reporting
SELECT 'CREATING COMMUNICATION SUMMARY VIEW' as status;

CREATE OR REPLACE VIEW parent_communication_summary AS
SELECT 
    s.id as student_id,
    s.student_name,
    s.grade,
    s.phone as parent_phone,
    t.tutor_name,
    MAX(pc.contact_date) as last_contact_date,
    DATEDIFF(CURDATE(), DATE(MAX(pc.contact_date))) as days_since_contact,
    COUNT(pc.id) as total_communications,
    COUNT(CASE WHEN pc.contact_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 END) as communications_last_30_days,
    MAX(CASE WHEN pc.follow_up_needed = TRUE AND pc.follow_up_date >= CURDATE() THEN pc.follow_up_date END) as pending_follow_up_date,
    CASE 
        WHEN DATEDIFF(CURDATE(), DATE(MAX(pc.contact_date))) <= 7 THEN 'Recent'
        WHEN DATEDIFF(CURDATE(), DATE(MAX(pc.contact_date))) <= 14 THEN 'Been a While'
        WHEN DATEDIFF(CURDATE(), DATE(MAX(pc.contact_date))) > 14 THEN 'Contact Needed'
        ELSE 'Never Contacted'
    END as contact_status
FROM students s
LEFT JOIN parent_communications pc ON s.id = pc.student_id
LEFT JOIN tutors t ON pc.tutor_id = t.id
GROUP BY s.id, s.student_name, s.grade, s.phone, t.tutor_name;

-- Step 3: Insert sample data for testing (optional - comment out in production)
/*
INSERT INTO parent_communications (student_id, tutor_id, contact_method, contact_type, what_was_discussed) 
VALUES 
    (1, 1, 'WeChat', 'Progress Update', 'Student doing well in algebra, suggested extra practice on word problems'),
    (2, 1, 'Phone', 'Concern', 'Discussed recent drop in homework completion, parent will monitor'),
    (3, 2, 'In-Person', 'General', 'Met during pickup, discussed upcoming exam preparation');
*/

-- Step 4: Verify the table was created
SELECT 'VERIFYING TABLE CREATION' as status;

SELECT 
    TABLE_NAME,
    TABLE_COMMENT,
    CREATE_TIME
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'parent_communications';

-- Step 5: Show initial statistics
SELECT 'INITIAL COMMUNICATION STATISTICS' as status;

SELECT 
    COUNT(DISTINCT s.id) as total_students,
    COUNT(DISTINCT pc.student_id) as students_with_communications,
    COUNT(DISTINCT s.id) - COUNT(DISTINCT pc.student_id) as students_never_contacted,
    COUNT(pc.id) as total_communication_records
FROM students s
LEFT JOIN parent_communications pc ON s.id = pc.student_id;

SELECT 'MIGRATION COMPLETED SUCCESSFULLY' as final_status;

-- =====================================================
-- ROLLBACK SCRIPT (if needed):
-- DROP VIEW IF EXISTS parent_communication_summary;
-- DROP TABLE IF EXISTS parent_communications;
-- =====================================================

-- =====================================================
-- APPSHEET INTEGRATION NOTES:
-- 1. Add parent_communications as new data source
-- 2. Add parent_communication_summary as read-only view
-- 3. Create "Log Parent Contact" action on student detail view
-- 4. Add virtual columns to students table:
--    - Last_Contact_Date: MAX(SELECT(parent_communications[contact_date], [student_id] = [_THISROW].[id]))
--    - Days_Since_Contact: ROUND(TODAY() - [Last_Contact_Date])
--    - Contact_Status_Badge: IF([Days_Since_Contact] <= 7, "✓", IF([Days_Since_Contact] <= 14, "!", "⚠"))
-- 5. Create slice "Students Needing Contact" where Days_Since_Contact > 14
-- =====================================================