-- =====================================================
-- Migration 031: Add Tutor Basic Salary Column
-- =====================================================
-- Purpose: Track tutor base salary for monthly salary calculations
--
-- Total salary = basic_salary + session revenue

SELECT 'Adding basic_salary column to tutors...' as status;

ALTER TABLE tutors
ADD COLUMN basic_salary DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Monthly base salary (before session revenue)';

SELECT 'Migration 031 completed.' as result;
SELECT 'Update tutor basic_salary values in AppSheet or MySQL.' as reminder;

-- =====================================================
-- Example: Set basic salary for tutors
-- =====================================================

-- UPDATE tutors
-- SET basic_salary = 5000.00
-- WHERE tutor_name = 'Teacher A';

-- UPDATE tutors
-- SET basic_salary = 4500.00
-- WHERE tutor_name = 'Teacher B';

-- =====================================================
-- END Migration 031
-- =====================================================
