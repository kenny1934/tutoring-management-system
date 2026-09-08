-- =====================================================
-- Migration 171: real provenance on a tutor's topic confirmation
-- =====================================================
-- Until now a confirmation recorded who made it by writing a string into
-- source_ref, shaped like "tutor:2:student:2573:confirm". That string is the
-- idempotency key, so it has to stay, but it is a poor place to keep facts we
-- want to ask questions about. Working out which tutors answer, or whether an
-- answer came from the suggested list or from the correction picker, meant
-- parsing text, and two of those facts were not in the string at all.
--
-- Five columns, all nullable because every row written before today lacks
-- them and none of the older sources (prep folders, assignments, sheets) will
-- ever fill them in.
--
--   tutor_id     who answered. Only ever set on tutor_confirm rows.
--   student_id   which student's lesson raised the question. This is how two
--                classes at one school on different topics can be told apart
--                from one school that moved on mid-week, so it is worth a
--                column of its own rather than a substring of source_ref.
--   session_id   the session the tutor was working on when they answered.
--   observed_on  the session date. week_number is the unit the timeline runs
--                on, and that does not change, but a week is too coarse to
--                tell drift from disagreement. A school can teach one topic on
--                Monday and the next on Saturday, and without a date those two
--                answers are the same row shape. This column is what lets the
--                strip say "confirmed Mon 8 Sep" and what lets a later session
--                in the same week ask whether the school has moved on.
--   action       confirm or accept_suggestion, previously only in the string.
--   origin       where the answer was given. strip is the one-line question on
--                the collapsed School Progress header, suggested is a topic
--                button in the expanded list, correction is the topic picker,
--                file_add is a suggested worksheet being assigned. legacy is
--                the three rows that predate this column, where we genuinely
--                cannot tell which of the first three it was.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the next statement in half and the
-- whole run aborts. Use a full stop.

ALTER TABLE school_topic_observations
    ADD COLUMN tutor_id INT NULL
        COMMENT 'Who confirmed. tutor_confirm rows only, NULL on derived evidence.',
    ADD COLUMN student_id INT NULL
        COMMENT 'Whose lesson raised the question. Separates parallel classes from mid-week drift.',
    ADD COLUMN session_id INT NULL
        COMMENT 'Session the tutor was working on when they answered.',
    ADD COLUMN observed_on DATE NULL
        COMMENT 'Session date behind the answer. Day resolution inside week_number.',
    ADD COLUMN action VARCHAR(20) NULL
        COMMENT 'confirm or accept_suggestion.',
    ADD COLUMN origin VARCHAR(20) NULL
        COMMENT 'strip, suggested, correction, file_add, or legacy for pre-171 rows.';

CREATE INDEX idx_obs_tutor_day ON school_topic_observations (tutor_id, created_at);

CREATE INDEX idx_obs_confirm_week ON school_topic_observations
    (school, grade, academic_year, week_number, source);

UPDATE school_topic_observations
SET tutor_id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(source_ref, ':', 2), ':', -1) AS UNSIGNED),
    student_id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(source_ref, ':', 4), ':', -1) AS UNSIGNED),
    action = SUBSTRING_INDEX(source_ref, ':', -1),
    origin = 'legacy'
WHERE source = 'tutor_confirm'
  AND source_ref LIKE 'tutor:%'
  AND tutor_id IS NULL;
