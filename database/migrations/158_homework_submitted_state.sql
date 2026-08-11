-- =====================================================
-- Migration 158: "Submitted" homework state
-- =====================================================
-- The four states mixed two axes: whether the work came back (the student's
-- side) and whether a tutor has assessed it (the tutor's side). Completed,
-- Partially Completed and Not Completed are verdicts that imply someone
-- looked. Not Checked says nothing about the work itself. The missing cell is
-- "it is in my hands, I have not marked it yet", which is exactly the case
-- that deserves a nudge.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the next statement in half and the
-- whole run aborts. Use a full stop.
--
-- Submitted becomes a rung on the ladder rather than a second field:
--
--   Not Checked -> Submitted -> Completed / Partially Completed / Not Completed
--   nothing        came in,     ------------- assessed -------------
--   recorded       not marked
--
-- Two independent fields would allow contradictory rows (not submitted and
-- Completed) that nothing prevents. A ladder has no invalid states.
--
-- Submitted counts as NOT checked everywhere: it stays in the backlog, keeps
-- ageing through sessions_ago, and keeps counting against the HW badge. That
-- ageing is the reminder.

-- -----------------------------------------------------
-- The state itself
-- -----------------------------------------------------
-- Added after 'Not Checked' so the stored order matches the ladder the UI
-- draws, which is what ORDER BY completion_status gives a report for free.

-- MODIFY COLUMN replaces the whole definition, so DEFAULT has to be restated.
-- Dropping it would let a row land with a NULL status, which every rebuilt
-- view below reads as neither open nor checked and so hides entirely.

ALTER TABLE homework_completion
MODIFY COLUMN completion_status
    ENUM('Not Checked', 'Submitted', 'Completed', 'Partially Completed', 'Not Completed')
    NULL DEFAULT 'Not Checked'
    COMMENT 'Ladder: nothing recorded, handed in but unmarked, then the three verdicts';

-- -----------------------------------------------------
-- Promote the legacy handed-in rows
-- -----------------------------------------------------
-- The AppSheet-era flag already recorded work that came back without a
-- verdict, which had no state to live in and so read as Not Checked. That is
-- precisely what Submitted is for, so those rows move rather than being
-- flattened by the resync at the end of this file. Replayable: after the
-- first run there is nothing left matching.

UPDATE homework_completion
   SET completion_status = 'Submitted'
 WHERE completion_status = 'Not Checked'
   AND submitted = 1;

-- -----------------------------------------------------
-- homework_to_check: Submitted is still open
-- -----------------------------------------------------
-- Identical to migration 154 apart from the still-open clause, which now
-- keeps handed-in-but-unmarked homework in the backlog, and check_status,
-- which reports it as its own thing so a caller need not spell out the ladder.

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
        WHEN hc.completion_status = 'Submitted' THEN 'Submitted'
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
  -- Still open, or closed right here. Handed in but unmarked is still open, so
  -- it keeps ageing until someone assesses it. Items assessed in an earlier
  -- session drop out.
  AND (
      hc.id IS NULL
      OR hc.completion_status IN ('Not Checked', 'Submitted')
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
-- student_homework_history: assessed assignments only
-- -----------------------------------------------------
-- Submitted is excluded alongside Not Checked. This view is the record of what
-- a tutor judged, and handed-in-but-unmarked carries no judgement yet.

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
  AND hc.completion_status NOT IN ('Not Checked', 'Submitted');

-- -----------------------------------------------------
-- student_homework_statistics: per-student rollup
-- -----------------------------------------------------
-- Submitted counts as not checked, so checked_rate_percent keeps meaning
-- "how much of what was set has a tutor assessed". It gets its own count so
-- the gap between handed in and marked is visible, and contributes NULL to
-- avg_completion_score because there is no verdict to average.

CREATE OR REPLACE VIEW student_homework_statistics AS
SELECT
    s.id AS student_id,
    s.student_name,
    s.grade,
    s.school,

    COUNT(DISTINCT se.id) AS total_homework_assigned,
    COUNT(DISTINCT CASE WHEN hc.completion_status NOT IN ('Not Checked', 'Submitted') THEN hc.id END) AS total_checked,
    SUM(CASE WHEN hc.completion_status = 'Submitted' THEN 1 ELSE 0 END) AS total_awaiting_marking,
    SUM(CASE WHEN hc.completion_status = 'Completed' THEN 1 ELSE 0 END) AS total_completed,
    SUM(CASE WHEN hc.completion_status = 'Partially Completed' THEN 1 ELSE 0 END) AS total_partial,
    SUM(CASE WHEN hc.completion_status = 'Not Completed' THEN 1 ELSE 0 END) AS total_not_completed,

    ROUND(
        CASE
            WHEN COUNT(DISTINCT se.id) > 0 THEN
                (COUNT(DISTINCT CASE WHEN hc.completion_status NOT IN ('Not Checked', 'Submitted') THEN hc.id END) * 100.0)
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
         AND hc.completion_status NOT IN ('Not Checked', 'Submitted')
        THEN hc.id
    END) AS recent_checked_30d,

    MAX(sl.session_date) AS last_homework_date,
    -- checked_at is stamped when work is taken in as well as when it is
    -- assessed, so this filters to the verdicts. Otherwise "last checked"
    -- would move for a receipt that nobody has marked.
    MAX(CASE
        WHEN hc.completion_status NOT IN ('Not Checked', 'Submitted')
        THEN hc.checked_at
    END) AS last_checked_date

FROM students s
LEFT JOIN session_log sl ON sl.student_id = s.id
LEFT JOIN session_exercises se ON (se.session_id = sl.id AND se.exercise_type IN ('HW', 'Homework'))
LEFT JOIN homework_completion hc ON hc.session_exercise_id = se.id
GROUP BY s.id, s.student_name, s.grade, s.school;

-- -----------------------------------------------------
-- Legacy submitted flag
-- -----------------------------------------------------
-- The column finally gets to mean what its name says. It was derived from
-- "Completed or Partially Completed", which missed both handed-in-but-unmarked
-- work and work handed in blank. Anything with a recorded state other than
-- Not Completed came back.

UPDATE homework_completion
   SET submitted = (completion_status IN ('Submitted', 'Completed', 'Partially Completed'))
 WHERE completion_status IS NOT NULL;

-- =====================================================
-- END Migration 158
-- =====================================================
