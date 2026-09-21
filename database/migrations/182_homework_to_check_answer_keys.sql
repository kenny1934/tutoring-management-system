-- =====================================================
-- Migration 182: answer keys on homework_to_check
-- =====================================================
-- Every panel where a tutor marks homework reads this view. The new Check
-- Viewer opens a homework item's worksheet and its answer key side by side,
-- so the view has to hand over the answer key a tutor chose for the homework,
-- as well as the worksheet. In the 60 days to 2026-09-21, 1,021 of 1,469
-- homework items named their answer file by hand, so leaving these columns
-- out would make the viewer ignore most of those choices.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the next statement in half and the
-- whole run aborts. Use a full stop.
--
-- This only adds columns. The view is identical to migration 158 apart from
-- the four answer columns after assignment_remarks, and no column is renamed
-- or dropped. The deployed backend only selects the columns its model maps,
-- so it keeps working when this lands before the code that reads them.
-- Replaying it is harmless, since CREATE OR REPLACE rebuilds the same view.

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

    -- The answer key the tutor chose for this homework, if any. The Check
    -- Viewer opens it beside the worksheet. Left NULL, the viewer searches for
    -- one by the worksheet's file name, as lesson mode does.
    se.answer_pdf_name,
    se.answer_page_start,
    se.answer_page_end,
    se.answer_remarks,

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
