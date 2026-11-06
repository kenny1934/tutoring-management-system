-- Correct separator-only differences without changing the actual class times.
-- Each record keeps its own range, including historical and make-up sessions.
-- Keep modification timestamps so this formatting repair does not alter audit chronology.
UPDATE enrollments
SET assigned_time = CASE assigned_time
    WHEN '18:00-19:30' THEN '18:00 - 19:30'
    WHEN '11:45-13:15' THEN '11:45 - 13:15'
    WHEN '17:30-19:00' THEN '17:30 - 19:00'
    END,
    last_modified_time = last_modified_time
WHERE assigned_time IN ('18:00-19:30', '11:45-13:15', '17:30-19:00');

UPDATE session_log
SET time_slot = CASE time_slot
    WHEN '18:00-19:30' THEN '18:00 - 19:30'
    WHEN '11:45-13:15' THEN '11:45 - 13:15'
    WHEN '17:30-19:00' THEN '17:30 - 19:00'
    END,
    last_modified_time = last_modified_time
WHERE time_slot IN ('18:00-19:30', '11:45-13:15', '17:30-19:00');
