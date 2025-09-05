-- Bulk Exercise Assignment Test - COMPLETED ✅
-- Successfully validated that AppSheet can use staging columns with [_INPUT] 
-- to create session_exercises records for multiple selected sessions

-- CLEANUP: Remove test column and test data
ALTER TABLE session_log DROP COLUMN test_exercise_input;
DELETE FROM session_exercises WHERE remarks = 'BULK TEST';

-- RESULT: Test successful - bulk exercise assignment is feasible
-- Next step: Apply production staging columns from 004_bulk_exercise_staging.sql