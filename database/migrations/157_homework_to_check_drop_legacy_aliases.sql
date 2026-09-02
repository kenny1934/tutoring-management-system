-- =====================================================
-- Migration 157: Drop the legacy aliases from homework_to_check
-- =====================================================
-- Migration 155 restored previous_session_id and submitted as aliases so the
-- backend deployed at the time could keep reading the view. That backend has
-- since been replaced (v2.0.107), and nothing selects either name any more.
--
-- The view is the only thing losing them. homework_completion.submitted stays:
-- it is still written alongside completion_status for the legacy reporting
-- queries.
--
-- CREATE OR REPLACE VIEW is atomic, so this is safe to replay.

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

-- =====================================================
-- END Migration 157
-- =====================================================
