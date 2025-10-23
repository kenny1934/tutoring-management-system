-- Migration: Add work_week_start_day to tutors table with automatic calculation based on RDOs
-- Purpose: Calculate each tutor's work week start day based on their Regular Days Off (RDO)
-- This enables AppSheet to show weekly schedules aligned with each tutor's custom work week
--
-- Logic:
-- - Work week starts the day after the last consecutive RDO
-- - Handles wrap-around case: if RDO includes both Saturday (6) and Sunday (0),
--   treats Sunday as the last day, so work week starts Monday (1)
-- - Examples:
--   * RDO [2,3] (Tue,Wed) -> work week starts Thursday (4)
--   * RDO [6,0] (Sat,Sun) -> work week starts Monday (1)
--   * RDO [5,6,0] (Fri,Sat,Sun) -> work week starts Monday (1)
--   * RDO [5,6] (Fri,Sat) -> work week starts Sunday (0)

-- ============================================================================
-- STEP 1: ADD COLUMN TO TUTORS TABLE
-- ============================================================================

SELECT 'Adding work_week_start_day column to tutors table...' as status;

ALTER TABLE tutors
ADD COLUMN work_week_start_day TINYINT DEFAULT 1
COMMENT 'Day of week (0-6) when work week starts, calculated from current RDOs';

SELECT 'Column added successfully.' as result;

-- ============================================================================
-- STEP 2: CREATE FUNCTION TO CALCULATE WORK WEEK START DAY
-- ============================================================================

SELECT 'Creating calculate_work_week_start function...' as status;

-- Drop function if exists
DROP FUNCTION IF EXISTS calculate_work_week_start;

CREATE FUNCTION calculate_work_week_start(p_tutor_id INT)
RETURNS TINYINT
DETERMINISTIC
READS SQL DATA
COMMENT 'Calculates the work week start day (0-6) based on tutor RDOs'
BEGIN
    DECLARE has_saturday BOOLEAN;
    DECLARE has_sunday BOOLEAN;
    DECLARE last_rdo_day TINYINT;

    -- Check if tutor has Saturday (6) as an active RDO
    SELECT
        COUNT(*) > 0 INTO has_saturday
    FROM tutor_rdo
    WHERE tutor_id = p_tutor_id
      AND day_of_week = 6
      AND (effective_from IS NULL OR effective_from <= CURDATE())
      AND (effective_to IS NULL OR effective_to >= CURDATE());

    -- Check if tutor has Sunday (0) as an active RDO
    SELECT
        COUNT(*) > 0 INTO has_sunday
    FROM tutor_rdo
    WHERE tutor_id = p_tutor_id
      AND day_of_week = 0
      AND (effective_from IS NULL OR effective_from <= CURDATE())
      AND (effective_to IS NULL OR effective_to >= CURDATE());

    -- Wrap-around case: If tutor has both Saturday and Sunday RDOs,
    -- use MIN (which will be 0/Sunday) as the last consecutive RDO day.
    -- Otherwise, use MAX to find the highest numbered RDO day.
    IF has_saturday AND has_sunday THEN
        SELECT MIN(day_of_week) INTO last_rdo_day
        FROM tutor_rdo
        WHERE tutor_id = p_tutor_id
          AND (effective_from IS NULL OR effective_from <= CURDATE())
          AND (effective_to IS NULL OR effective_to >= CURDATE());
    ELSE
        SELECT MAX(day_of_week) INTO last_rdo_day
        FROM tutor_rdo
        WHERE tutor_id = p_tutor_id
          AND (effective_from IS NULL OR effective_from <= CURDATE())
          AND (effective_to IS NULL OR effective_to >= CURDATE());
    END IF;

    -- Return the day after the last RDO (with MOD 7 for wrap-around)
    -- If no RDOs found, default to Monday (1)
    RETURN IF(last_rdo_day IS NULL, 1, MOD(last_rdo_day + 1, 7));
END;

SELECT 'Function created successfully.' as result;

-- ============================================================================
-- STEP 3: CREATE TRIGGERS FOR AUTO-UPDATE
-- ============================================================================

SELECT 'Creating triggers for automatic work_week_start_day updates...' as status;

-- Drop triggers if they exist
DROP TRIGGER IF EXISTS update_work_week_after_rdo_insert;
DROP TRIGGER IF EXISTS update_work_week_after_rdo_update;
DROP TRIGGER IF EXISTS update_work_week_after_rdo_delete;

-- Trigger: After inserting a new RDO record
CREATE TRIGGER update_work_week_after_rdo_insert
AFTER INSERT ON tutor_rdo
FOR EACH ROW
BEGIN
    UPDATE tutors
    SET work_week_start_day = calculate_work_week_start(NEW.tutor_id)
    WHERE id = NEW.tutor_id;
END;

-- Trigger: After updating an RDO record
CREATE TRIGGER update_work_week_after_rdo_update
AFTER UPDATE ON tutor_rdo
FOR EACH ROW
BEGIN
    -- Update the old tutor's work week (in case tutor_id changed)
    UPDATE tutors
    SET work_week_start_day = calculate_work_week_start(OLD.tutor_id)
    WHERE id = OLD.tutor_id;

    -- If tutor_id changed, also update the new tutor
    IF NEW.tutor_id != OLD.tutor_id THEN
        UPDATE tutors
        SET work_week_start_day = calculate_work_week_start(NEW.tutor_id)
        WHERE id = NEW.tutor_id;
    END IF;
END;

-- Trigger: After deleting an RDO record
CREATE TRIGGER update_work_week_after_rdo_delete
AFTER DELETE ON tutor_rdo
FOR EACH ROW
BEGIN
    UPDATE tutors
    SET work_week_start_day = calculate_work_week_start(OLD.tutor_id)
    WHERE id = OLD.tutor_id;
END;

SELECT 'Triggers created successfully.' as result;

-- ============================================================================
-- STEP 4: POPULATE EXISTING DATA
-- ============================================================================

SELECT 'Populating work_week_start_day for all existing tutors...' as status;

UPDATE tutors
SET work_week_start_day = calculate_work_week_start(id);

SELECT CONCAT('Updated ', ROW_COUNT(), ' tutor records.') as result;

-- ============================================================================
-- VERIFICATION (OPTIONAL)
-- ============================================================================

/*
-- Uncomment to verify the migration results:

SELECT
    t.id,
    t.name,
    t.work_week_start_day,
    CASE t.work_week_start_day
        WHEN 0 THEN 'Sunday'
        WHEN 1 THEN 'Monday'
        WHEN 2 THEN 'Tuesday'
        WHEN 3 THEN 'Wednesday'
        WHEN 4 THEN 'Thursday'
        WHEN 5 THEN 'Friday'
        WHEN 6 THEN 'Saturday'
    END AS work_week_start_name,
    GROUP_CONCAT(rdo.day_of_week ORDER BY rdo.day_of_week) AS rdo_days
FROM tutors t
LEFT JOIN tutor_rdo rdo ON t.id = rdo.tutor_id
    AND (rdo.effective_from IS NULL OR rdo.effective_from <= CURDATE())
    AND (rdo.effective_to IS NULL OR rdo.effective_to >= CURDATE())
GROUP BY t.id, t.name, t.work_week_start_day
ORDER BY t.id;
*/

SELECT 'Migration 033: Tutor work week start calculation completed successfully.' as result;

-- ============================================================================
-- USAGE IN APPSHEET
-- ============================================================================

/*
APPSHEET SLICE FORMULA:

Use this formula in your session slice to show the current work week for each tutor:

AND(
    [tutor_id] = USERSETTINGS("SelectedTutor"),

    [session_date] >= (
        USERSETTINGS("SelectedScheduleDate") -
        MOD(
            WEEKDAY(USERSETTINGS("SelectedScheduleDate")) -
            [tutor_id].[work_week_start_day] + 7,
            7
        )
    ),

    [session_date] <= (
        USERSETTINGS("SelectedScheduleDate") -
        MOD(
            WEEKDAY(USERSETTINGS("SelectedScheduleDate")) -
            [tutor_id].[work_week_start_day] + 7,
            7
        ) + 6
    ),

    [session_status] <> "Cancelled"
)

TESTING EXAMPLES:

1. Tutor with RDO [6,0] (Sat-Sun):
   - work_week_start_day = 1 (Monday)
   - Work week: Monday → Sunday

2. Tutor with RDO [2,3] (Tue-Wed):
   - work_week_start_day = 4 (Thursday)
   - Work week: Thursday → Wednesday

3. Tutor with RDO [5,6] (Fri-Sat):
   - work_week_start_day = 0 (Sunday)
   - Work week: Sunday → Saturday

4. Tutor with RDO [5,6,0] (Fri-Sat-Sun):
   - work_week_start_day = 1 (Monday)
   - Work week: Monday → Sunday

MAINTENANCE:

The work_week_start_day column is automatically maintained by triggers.
When you add, update, or delete records in tutor_rdo, the corresponding
tutor's work_week_start_day will be automatically recalculated.

For manual recalculation (if needed):
UPDATE tutors SET work_week_start_day = calculate_work_week_start(id) WHERE id = <tutor_id>;
*/
