-- Migration 018: Holiday-Aware Lesson Dates Calculation
-- Purpose: Add MySQL function to calculate lesson dates skipping holidays for fee messages

-- ============================================================================
-- CREATE LESSON DATES CALCULATION FUNCTION
-- ============================================================================

SELECT 'Creating lesson dates calculation function...' as status;

-- Drop function if exists
DROP FUNCTION IF EXISTS get_lesson_dates_formatted;

-- Create the function to calculate lesson dates with holiday checking
-- Note: If running in a tool that doesn't support stored functions,
-- execute this CREATE FUNCTION block separately in MySQL command line or workbench

CREATE FUNCTION get_lesson_dates_formatted(
    p_first_lesson_date DATE,
    p_lessons_paid INT
)
RETURNS TEXT
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_dates TEXT DEFAULT '';
    DECLARE v_current_date DATE;
    DECLARE v_lesson_count INT DEFAULT 0;
    DECLARE v_week_offset INT DEFAULT 0;
    DECLARE v_holiday_count INT;

    -- Start from first lesson date
    SET v_current_date = p_first_lesson_date;

    -- Build lesson dates list
    WHILE v_lesson_count < p_lessons_paid DO
        -- Check if current date is a holiday
        SELECT COUNT(*) INTO v_holiday_count
        FROM holidays
        WHERE holiday_date = v_current_date;

        -- If not a holiday, include this date
        IF v_holiday_count = 0 THEN
            -- Add formatting and date
            IF v_dates != '' THEN
                SET v_dates = CONCAT(v_dates, CHAR(10), '                  ');
            END IF;
            SET v_dates = CONCAT(v_dates, DATE_FORMAT(v_current_date, '%Y/%m/%d'));
            SET v_lesson_count = v_lesson_count + 1;
        END IF;

        -- Move to next week
        SET v_week_offset = v_week_offset + 7;
        SET v_current_date = DATE_ADD(p_first_lesson_date, INTERVAL v_week_offset DAY);
    END WHILE;

    RETURN v_dates;
END;

SELECT 'Lesson dates calculation function created successfully.' as result;

-- ============================================================================
-- CREATE VIEW WITH FORMATTED LESSON DATES
-- ============================================================================

SELECT 'Creating enrollments view with formatted lesson dates...' as status;

-- Create or update view that includes the formatted lesson dates
CREATE OR REPLACE VIEW enrollment_fee_details AS
SELECT
    e.id AS enrollment_id,
    e.student_id,
    e.tutor_id,
    e.first_lesson_date,
    e.lessons_paid,
    e.assigned_day,
    e.assigned_time,
    e.location,
    e.payment_status,
    s.student_name,
    s.school_student_id,
    t.tutor_name,

    -- Holiday-aware lesson dates formatted for fee message
    get_lesson_dates_formatted(e.first_lesson_date, e.lessons_paid) AS lesson_dates_formatted,

    -- Individual lesson dates (first 8 for compatibility)
    e.first_lesson_date AS lesson_date_1,

    -- Calculate second lesson date (first valid date after first lesson)
    (SELECT MIN(candidate_date)
     FROM (
         SELECT DATE_ADD(e.first_lesson_date, INTERVAL 7 DAY) AS candidate_date
         UNION
         SELECT DATE_ADD(e.first_lesson_date, INTERVAL 14 DAY)
         UNION
         SELECT DATE_ADD(e.first_lesson_date, INTERVAL 21 DAY)
         UNION
         SELECT DATE_ADD(e.first_lesson_date, INTERVAL 28 DAY)
     ) dates
     WHERE candidate_date NOT IN (SELECT holiday_date FROM holidays)
     AND candidate_date > e.first_lesson_date
    ) AS lesson_date_2

FROM enrollments e
JOIN students s ON e.student_id = s.id
JOIN tutors t ON e.tutor_id = t.id;

SELECT 'Enrollment fee details view created successfully.' as result;

-- ============================================================================
-- USAGE EXAMPLES AND NOTES
-- ============================================================================

/*
USAGE IN APPSHEET:

Replace this in your _fee_message formula:

OLD:
"上課日期：\n",
"                  ", TEXT([first_lesson_date], "yyyy/mm/dd"), "\n",
"                  ", TEXT([first_lesson_date] + 7, "yyyy/mm/dd"), "\n",
...

NEW:
"上課日期：\n                  ",
[lesson_dates_formatted],
"\n",

The function automatically:
1. Calculates correct number of dates based on lessons_paid
2. Skips holidays by checking the holidays table
3. Formats with proper indentation for fee message
4. Returns only the actual lesson dates

TESTING:
To test the function:
SELECT get_lesson_dates_formatted('2025-10-01', 6);

This will return formatted lesson dates for 6 lessons starting Oct 1, 2025,
skipping any holidays in the holidays table.

APPSHEET INTEGRATION:
1. Add enrollment_fee_details as a slice or use directly
2. Reference [lesson_dates_formatted] in your fee message
3. The calculation happens server-side for accuracy and performance

BENEFITS:
- Handles any number of lessons (not limited to 6 or 8)
- Accurate holiday checking using MySQL date functions
- Consistent with calculate_end_date() function logic
- Single source of truth for lesson date calculations
- Much cleaner than complex AppSheet formulas
*/

-- Test the function with sample data (optional)
-- SELECT
--     'Test: 6 lessons from 2025-10-01' as test_case,
--     get_lesson_dates_formatted('2025-10-01', 6) as result;

SELECT 'Migration 018: Lesson dates calculation function completed successfully.' as result;