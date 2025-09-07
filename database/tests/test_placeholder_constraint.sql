-- Test script for placeholder-aware duplicate prevention constraint
-- Run this after applying migration 007

-- Setup test data (assuming student_id=1, tutor_id=1 exist)
-- Clean up any existing test data first
DELETE FROM session_log WHERE notes LIKE 'TEST:%';

-- Test 1: Insert a real session (should succeed)
INSERT INTO session_log 
(student_id, tutor_id, session_date, time_slot, location, session_status, financial_status, notes, last_modified_by)
VALUES 
(1, 1, '2025-09-15', '14:00 - 15:00', 'Test Location', 'Scheduled', 'Unpaid', 'TEST: Real session 1', 'test@example.com');

-- Test 2: Try to insert duplicate real session (should FAIL with constraint error)
-- Uncomment to test:
/*
INSERT INTO session_log 
(student_id, tutor_id, session_date, time_slot, location, session_status, financial_status, notes, last_modified_by)
VALUES 
(1, 1, '2025-09-15', '14:00 - 15:00', 'Test Location', 'Scheduled', 'Unpaid', 'TEST: Real session 2 (duplicate)', 'test@example.com');
*/

-- Test 3: Insert placeholder session with same details (should SUCCEED)
INSERT INTO session_log 
(student_id, tutor_id, session_date, time_slot, location, session_status, financial_status, notes, last_modified_by)
VALUES 
(1, 1, '2025-09-15', '14:00 - 15:00', 'Test Location', 'Rescheduled - Make-up Booked', 'Unpaid', 'TEST: Placeholder rescheduled', 'test@example.com');

-- Test 4: Insert another different placeholder (should SUCCEED)
INSERT INTO session_log 
(student_id, tutor_id, session_date, time_slot, location, session_status, financial_status, notes, last_modified_by)
VALUES 
(1, 1, '2025-09-15', '14:00 - 15:00', 'Test Location', 'Sick Leave - Make-up Booked', 'Unpaid', 'TEST: Placeholder sick leave', 'test@example.com');

-- Test 5: Insert cancelled session (should SUCCEED)  
INSERT INTO session_log 
(student_id, tutor_id, session_date, time_slot, location, session_status, financial_status, notes, last_modified_by)
VALUES 
(1, 1, '2025-09-15', '14:00 - 15:00', 'Test Location', 'Cancelled', 'Waived', 'TEST: Cancelled session', 'test@example.com');

-- Show all test sessions created
SELECT 
    id,
    session_date,
    time_slot,
    session_status,
    notes,
    -- Show the computed constraint value
    (CASE 
        WHEN session_status IN ('Rescheduled - Make-up Booked', 'Sick Leave - Make-up Booked', 'Cancelled') 
        THEN CONCAT(id, '-', session_status)
        ELSE 'REAL'
    END) as constraint_value
FROM session_log 
WHERE notes LIKE 'TEST:%'
ORDER BY id;

-- Test 6: Now try to add another real session (should FAIL)
-- Uncomment to test constraint violation:
/*
INSERT INTO session_log 
(student_id, tutor_id, session_date, time_slot, location, session_status, financial_status, notes, last_modified_by)
VALUES 
(1, 1, '2025-09-15', '14:00 - 15:00', 'Test Location', 'Attended', 'Paid', 'TEST: Another real session (should fail)', 'test@example.com');
*/

-- Real-world scenario test: Student reschedules then wants original time back
SELECT 'SCENARIO TEST: Student reschedules lesson then wants original time back' as scenario;

-- Step 1: Original lesson exists
SELECT 'Step 1: Original lesson exists (already inserted above)' as step;

-- Step 2: Student reschedules - original becomes placeholder  
UPDATE session_log 
SET session_status = 'Rescheduled - Make-up Booked',
    notes = 'TEST: Original lesson rescheduled'
WHERE notes = 'TEST: Real session 1';

-- Step 3: Student wants original time back - should be able to create new session
INSERT INTO session_log 
(student_id, tutor_id, session_date, time_slot, location, session_status, financial_status, notes, last_modified_by)
VALUES 
(1, 1, '2025-09-15', '14:00 - 15:00', 'Test Location', 'Scheduled', 'Unpaid', 'TEST: Back to original time after reschedule', 'test@example.com');

-- Show final result
SELECT 
    'Final state - should show placeholder + new real session' as result_description;
    
SELECT 
    id,
    session_status,
    notes,
    (CASE 
        WHEN session_status IN ('Rescheduled - Make-up Booked', 'Sick Leave - Make-up Booked', 'Cancelled') 
        THEN CONCAT(id, '-', session_status)
        ELSE 'REAL'
    END) as constraint_value
FROM session_log 
WHERE notes LIKE 'TEST:%'
AND (session_status = 'Rescheduled - Make-up Booked' OR session_status = 'Scheduled')
ORDER BY id;

-- Cleanup test data
-- DELETE FROM session_log WHERE notes LIKE 'TEST:%';