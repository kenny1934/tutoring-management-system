-- =====================================================
-- Migration 154: Homework completion rework
-- =====================================================
-- Reworks the legacy AppSheet-era homework checking model so tutors can
-- actually mark homework in the app.
--
-- 1. One completion record per homework assignment, not per checking session.
--    The old unique key allowed the same assignment to be checked again in
--    every later session, which is what made a rolling backlog impossible.
-- 2. Editing a session's homework no longer destroys completion history.
--    The exercise FK becomes SET NULL and the record keeps its own snapshot
--    of what was assigned.
-- 3. homework_to_check looks back up to 3 attended sessions instead of 1, and
--    reports which session each item came from.
-- 4. The reporting views drop the "submitted" flag in favour of the single
--    four-state completion_status.

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;

-- -----------------------------------------------------
-- Re-key homework_completion onto the assignment
-- -----------------------------------------------------
-- Each index and key change is guarded, so this section can be re-run and
-- lands the same way whatever state the table is in. MySQL commits DDL as it
-- goes, so a failure part way through cannot be rolled back and the rest has
-- to be safe to replay.
--
-- Order matters. current_session_id gets its own index before the composite
-- unique key goes, otherwise its foreign key has nothing left to lean on.

SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'homework_completion'
       AND INDEX_NAME = 'idx_current_session'
);
SET @sql := IF(@idx_exists > 0,
    'DO 0',
    'ALTER TABLE homework_completion ADD INDEX idx_current_session (current_session_id)');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'homework_completion'
       AND CONSTRAINT_NAME = 'homework_completion_ibfk_2'
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(@fk_exists > 0,
    'ALTER TABLE homework_completion DROP FOREIGN KEY homework_completion_ibfk_2',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'homework_completion'
       AND INDEX_NAME = 'session_exercise_id'
);
SET @sql := IF(@idx_exists > 0,
    'ALTER TABLE homework_completion DROP INDEX session_exercise_id',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'homework_completion'
       AND INDEX_NAME = 'unique_exercise_check'
);
SET @sql := IF(@idx_exists > 0,
    'ALTER TABLE homework_completion DROP INDEX unique_exercise_check',
    'DO 0');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE homework_completion
MODIFY COLUMN session_exercise_id INT NULL
    COMMENT 'Homework assignment being checked. NULL once the assignment row is edited away, the snapshot columns keep the history';

SET @idx_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'homework_completion'
       AND INDEX_NAME = 'unique_homework_check'
);
SET @sql := IF(@idx_exists > 0,
    'DO 0',
    'ALTER TABLE homework_completion ADD UNIQUE KEY unique_homework_check (session_exercise_id)');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'homework_completion'
       AND CONSTRAINT_NAME = 'homework_completion_ibfk_2'
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(@fk_exists > 0,
    'DO 0',
    'ALTER TABLE homework_completion ADD CONSTRAINT homework_completion_ibfk_2 FOREIGN KEY (session_exercise_id) REFERENCES session_exercises(id) ON DELETE SET NULL');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE homework_completion
MODIFY COLUMN current_session_id INT NOT NULL
    COMMENT 'Session in which the homework was checked';

-- -----------------------------------------------------
-- homework_to_check: rolling backlog, up to 3 sessions back
-- -----------------------------------------------------

CREATE OR REPLACE VIEW homework_to_check AS
SELECT
    cur.id AS current_session_id,
    cur.student_id,
    cur.tutor_id AS current_tutor_id,
    cur.session_date AS current_session_date,
    s.student_name,
    t_current.tutor_name AS current_tutor_name,

    -- Where the homework came from. May be several sessions back.
    prev.id AS assigned_session_id,
    DATE(prev.session_date) AS homework_assigned_date,
    prev.time_slot AS assigned_time_slot,
    prev.tutor_id AS assigned_by_tutor_id,
    t_prev.tutor_name AS assigned_by_tutor,
    (
        SELECT COUNT(*)
        FROM session_log x
        WHERE x.student_id = cur.student_id
          AND (x.session_date, x.id) < (cur.session_date, cur.id)
          AND (x.session_date, x.id) > (prev.session_date, prev.id)
          AND x.session_status NOT IN (
              'Cancelled',
              'No Show',
              'Rescheduled - Make-up Booked',
              'Rescheduled - Pending Make-up',
              'Sick Leave - Make-up Booked',
              'Sick Leave - Pending Make-up',
              'Weather Cancelled - Make-up Booked',
              'Weather Cancelled - Pending Make-up'
          )
    ) + 1 AS sessions_ago,

    -- The assignment itself
    se.id AS session_exercise_id,
    se.pdf_name,
    se.url,
    se.url_title,
    se.page_start,
    se.page_end,
    CASE
        WHEN se.page_start IS NOT NULL AND se.page_end IS NOT NULL
        THEN CONCAT('p.', se.page_start, '-', se.page_end)
        WHEN se.page_start IS NOT NULL
        THEN CONCAT('p.', se.page_start)
        ELSE ''
    END AS pages,
    se.remarks AS assignment_remarks,

    -- Completion state, keyed to the assignment rather than this session
    hc.id AS completion_id,
    COALESCE(hc.completion_status, 'Not Checked') AS completion_status,
    hc.homework_rating,
    hc.tutor_comments,
    hc.checked_by,
    hc.checked_at,
    hc.current_session_id AS checked_in_session_id,
    (SELECT COUNT(*) FROM homework_files hf WHERE hf.homework_completion_id = hc.id) AS attachment_count,
    CASE
        WHEN hc.id IS NULL OR hc.completion_status = 'Not Checked' THEN 'Pending'
        ELSE 'Checked'
    END AS check_status

FROM session_log cur
JOIN students s ON cur.student_id = s.id
LEFT JOIN tutors t_current ON cur.tutor_id = t_current.id

-- Sessions the student actually sat, within a sane window
JOIN session_log prev ON (
    prev.student_id = cur.student_id
    AND prev.session_date < cur.session_date
    AND prev.session_date >= DATE_SUB(cur.session_date, INTERVAL 60 DAY)
    AND prev.session_status NOT IN (
        'Cancelled',
        'No Show',
        'Rescheduled - Make-up Booked',
        'Rescheduled - Pending Make-up',
        'Sick Leave - Make-up Booked',
        'Sick Leave - Pending Make-up',
        'Weather Cancelled - Make-up Booked',
        'Weather Cancelled - Pending Make-up'
    )
)
LEFT JOIN tutors t_prev ON prev.tutor_id = t_prev.id

JOIN session_exercises se ON (
    se.session_id = prev.id
    AND se.exercise_type IN ('HW', 'Homework')
)

LEFT JOIN homework_completion hc ON hc.session_exercise_id = se.id

WHERE cur.session_status IN ('Scheduled', 'Attended', 'Attended (Make-up)', 'Make-up Class', 'Trial Class')
  -- Still open, or closed right here. Items checked in an earlier session drop out.
  AND (
      hc.id IS NULL
      OR hc.completion_status = 'Not Checked'
      OR hc.current_session_id = cur.id
  )
  -- At most three sat sessions between the assignment and now
  AND (
      SELECT COUNT(*)
      FROM session_log x
      WHERE x.student_id = cur.student_id
        AND (x.session_date, x.id) < (cur.session_date, cur.id)
        AND (x.session_date, x.id) > (prev.session_date, prev.id)
        AND x.session_status NOT IN (
            'Cancelled',
            'No Show',
            'Rescheduled - Make-up Booked',
            'Rescheduled - Pending Make-up',
            'Sick Leave - Make-up Booked',
            'Sick Leave - Pending Make-up',
            'Weather Cancelled - Make-up Booked',
            'Weather Cancelled - Pending Make-up'
        )
  ) < 3;

-- -----------------------------------------------------
-- student_homework_history: one row per checked assignment
-- -----------------------------------------------------

CREATE OR REPLACE VIEW student_homework_history AS
SELECT
    hc.id AS completion_id,
    hc.student_id,
    s.student_name,
    hc.session_exercise_id,
    hc.assigned_date,
    hc.pdf_name,
    hc.url,
    CASE
        WHEN hc.page_start IS NOT NULL AND hc.page_end IS NOT NULL
        THEN CONCAT('p.', hc.page_start, '-', hc.page_end)
        WHEN hc.page_start IS NOT NULL
        THEN CONCAT('p.', hc.page_start)
        ELSE ''
    END AS pages,
    hc.exercise_remarks AS assignment_notes,

    hc.completion_status,
    hc.homework_rating,
    hc.tutor_comments,
    (SELECT COUNT(*) FROM homework_files hf WHERE hf.homework_completion_id = hc.id) AS file_count,

    checking_session.session_date AS checked_date,
    hc.checked_at,
    t_checked.tutor_name AS checked_by_tutor,
    t_assigned.tutor_name AS assigned_by_tutor,

    CASE hc.completion_status
        WHEN 'Completed' THEN '✅'
        WHEN 'Partially Completed' THEN '⚠️'
        WHEN 'Not Completed' THEN '❌'
        ELSE '⏸️'
    END AS status_icon,

    CASE hc.completion_status
        WHEN 'Completed' THEN 1
        WHEN 'Partially Completed' THEN 0.5
        WHEN 'Not Completed' THEN 0
        ELSE NULL
    END AS completion_score

FROM homework_completion hc
JOIN students s ON hc.student_id = s.id
LEFT JOIN session_log checking_session ON hc.current_session_id = checking_session.id
LEFT JOIN tutors t_checked ON hc.checked_by = t_checked.id
LEFT JOIN tutors t_assigned ON hc.assigned_by_tutor_id = t_assigned.id
WHERE hc.completion_status IS NOT NULL
  AND hc.completion_status <> 'Not Checked';

-- -----------------------------------------------------
-- student_homework_statistics: per-student rollup
-- -----------------------------------------------------

CREATE OR REPLACE VIEW student_homework_statistics AS
SELECT
    s.id AS student_id,
    s.student_name,
    s.grade,
    s.school,

    COUNT(DISTINCT se.id) AS total_homework_assigned,
    COUNT(DISTINCT CASE WHEN hc.completion_status <> 'Not Checked' THEN hc.id END) AS total_checked,
    SUM(CASE WHEN hc.completion_status = 'Completed' THEN 1 ELSE 0 END) AS total_completed,
    SUM(CASE WHEN hc.completion_status = 'Partially Completed' THEN 1 ELSE 0 END) AS total_partial,
    SUM(CASE WHEN hc.completion_status = 'Not Completed' THEN 1 ELSE 0 END) AS total_not_completed,

    ROUND(
        CASE
            WHEN COUNT(DISTINCT se.id) > 0 THEN
                (COUNT(DISTINCT CASE WHEN hc.completion_status <> 'Not Checked' THEN hc.id END) * 100.0)
                / COUNT(DISTINCT se.id)
            ELSE 0
        END,
        1
    ) AS checked_rate_percent,

    ROUND(
        AVG(
            CASE hc.completion_status
                WHEN 'Completed' THEN 100
                WHEN 'Partially Completed' THEN 50
                WHEN 'Not Completed' THEN 0
                ELSE NULL
            END
        ),
        1
    ) AS avg_completion_score,

    ROUND(
        AVG(
            CASE
                WHEN hc.homework_rating IS NOT NULL AND CHAR_LENGTH(hc.homework_rating) > 0
                THEN CHAR_LENGTH(hc.homework_rating)
                ELSE NULL
            END
        ),
        1
    ) AS avg_star_rating,

    SUM(CASE WHEN hc.homework_rating IS NOT NULL AND CHAR_LENGTH(hc.homework_rating) > 0 THEN 1 ELSE 0 END) AS total_rated,

    COUNT(DISTINCT CASE WHEN sl.session_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN se.id END) AS recent_assigned_30d,
    COUNT(DISTINCT CASE
        WHEN sl.session_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         AND hc.completion_status <> 'Not Checked'
        THEN hc.id
    END) AS recent_checked_30d,

    MAX(sl.session_date) AS last_homework_date,
    MAX(hc.checked_at) AS last_checked_date

FROM students s
LEFT JOIN session_log sl ON sl.student_id = s.id
LEFT JOIN session_exercises se ON (se.session_id = sl.id AND se.exercise_type IN ('HW', 'Homework'))
LEFT JOIN homework_completion hc ON hc.session_exercise_id = se.id
GROUP BY s.id, s.student_name, s.grade, s.school;

SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1);
SET UNIQUE_CHECKS=IFNULL(@OLD_UNIQUE_CHECKS, 1);

-- =====================================================
-- END Migration 154
-- =====================================================
