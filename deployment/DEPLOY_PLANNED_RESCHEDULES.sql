-- =================================================
-- PLANNED RESCHEDULES FEATURE - DATABASE DEPLOYMENT
-- =================================================
-- Run this SQL script in your Cloud SQL console
-- This adds the planned_reschedules table to your existing database

-- Step 1: Create the planned_reschedules table
CREATE TABLE planned_reschedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id INT NOT NULL,
    planned_date DATE NOT NULL,
    reschedule_to_date DATE NULL COMMENT 'Optional: if specified, creates linked make-up session',
    reason VARCHAR(500),
    status VARCHAR(20) DEFAULT 'Pending' COMMENT 'Pending, Applied, Cancelled',
    requested_date DATE NOT NULL,
    requested_by VARCHAR(255),
    notes TEXT,
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
    INDEX idx_enrollment_date (enrollment_id, planned_date),
    INDEX idx_status (status)
) COMMENT 'Tracks future leave requests before sessions are generated';

-- Step 2: Verify table creation
DESCRIBE planned_reschedules;

-- Step 3: Insert test data (optional - remove after testing)
-- INSERT INTO planned_reschedules 
-- (enrollment_id, planned_date, reason, requested_date, requested_by) 
-- VALUES (1, '2025-09-15', 'Test leave request', '2025-08-21', 'admin@test.com');

-- Step 4: Verify test data (optional - remove after testing)  
-- SELECT * FROM planned_reschedules;