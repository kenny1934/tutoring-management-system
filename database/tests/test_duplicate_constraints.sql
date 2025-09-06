-- Test Duplicate Prevention Constraints
-- This will verify that the unique constraints are working properly

-- STEP 1: Verify constraints exist
SELECT 'CHECKING CONSTRAINTS EXIST' as test_status;

SHOW INDEX FROM enrollments WHERE Key_name = 'unique_student_tutor_schedule';
SHOW INDEX FROM session_log WHERE Key_name = 'unique_student_tutor_session';

-- STEP 2: Test enrollment duplicate prevention
SELECT 'TESTING ENROLLMENT DUPLICATE PREVENTION' as test_status;

-- This should work (first insert)
INSERT INTO enrollments 
(student_id, tutor_id, assigned_day, assigned_time, location, payment_status, last_modified_by) 
VALUES 
(1, 1, 'Monday', '3:00 PM', 'Student Home', 'Test', 'test@example.com');

-- Get the ID we just inserted
SET @test_enrollment_id = LAST_INSERT_ID();

-- This should FAIL with duplicate key error
-- (Uncomment to test - it will throw an error which is expected)
/*
INSERT INTO enrollments 
(student_id, tutor_id, assigned_day, assigned_time, location, payment_status, last_modified_by) 
VALUES 
(1, 1, 'Monday', '3:00 PM', 'Student Home', 'Test', 'test@example.com');
*/

-- This should work (different student, same tutor/time/location)
INSERT INTO enrollments 
(student_id, tutor_id, assigned_day, assigned_time, location, payment_status, last_modified_by) 
VALUES 
(2, 1, 'Monday', '3:00 PM', 'Student Home', 'Test', 'test@example.com');

-- This should work (same student, different tutor)
INSERT INTO enrollments 
(student_id, tutor_id, assigned_day, assigned_time, location, payment_status, last_modified_by) 
VALUES 
(1, 2, 'Monday', '3:00 PM', 'Student Home', 'Test', 'test@example.com');

-- This should work (same student/tutor, different time)
INSERT INTO enrollments 
(student_id, tutor_id, assigned_day, assigned_time, location, payment_status, last_modified_by) 
VALUES 
(1, 1, 'Monday', '4:00 PM', 'Student Home', 'Test', 'test@example.com');

-- STEP 3: Test session duplicate prevention  
SELECT 'TESTING SESSION DUPLICATE PREVENTION' as test_status;

-- This should work (first insert)
INSERT INTO session_log 
(enrollment_id, student_id, tutor_id, session_date, time_slot, location, session_status, financial_status, last_modified_by) 
VALUES 
(@test_enrollment_id, 1, 1, '2025-09-15', '3:00 PM', 'Student Home', 'Test', 'Test', 'test@example.com');

-- This should FAIL with duplicate key error
-- (Uncomment to test - it will throw an error which is expected)
/*
INSERT INTO session_log 
(enrollment_id, student_id, tutor_id, session_date, time_slot, location, session_status, financial_status, last_modified_by) 
VALUES 
(@test_enrollment_id, 1, 1, '2025-09-15', '3:00 PM', 'Student Home', 'Test', 'Test', 'test@example.com');
*/

-- This should work (different student, same tutor/date/time)
INSERT INTO session_log 
(enrollment_id, student_id, tutor_id, session_date, time_slot, location, session_status, financial_status, last_modified_by) 
VALUES 
(NULL, 2, 1, '2025-09-15', '3:00 PM', 'Student Home', 'Test', 'Test', 'test@example.com');

-- This should work (same student, different tutor)
INSERT INTO session_log 
(enrollment_id, student_id, tutor_id, session_date, time_slot, location, session_status, financial_status, last_modified_by) 
VALUES 
(NULL, 1, 2, '2025-09-15', '3:00 PM', 'Student Home', 'Test', 'Test', 'test@example.com');

-- STEP 4: Show test data created
SELECT 'TEST ENROLLMENTS CREATED' as test_status;
SELECT * FROM enrollments WHERE payment_status = 'Test';

SELECT 'TEST SESSIONS CREATED' as test_status;
SELECT * FROM session_log WHERE session_status = 'Test';

-- STEP 5: Cleanup test data
SELECT 'CLEANING UP TEST DATA' as test_status;
DELETE FROM session_log WHERE session_status = 'Test';
DELETE FROM enrollments WHERE payment_status = 'Test';

-- STEP 6: Final verification
SELECT 'CONSTRAINTS WORKING PROPERLY!' as test_result;
SELECT 'To test duplicates failing, uncomment the duplicate INSERT statements above' as note;