-- =====================================================
-- Migration 177: more students wins a tie in the weekly consensus
-- =====================================================
-- Migration 176 caps a topic's assignment weight at three students, so that
-- a big class doing the same worksheet cannot outweigh a curriculum sheet
-- plus a tutor confirming the topic. Measured against the rebuilt data, the
-- cap leaves many topics level. In SRL-C F2 week 1 of 2026-2027, 三角形 came
-- from 13 students and 4 tutors, and two other topics from 3 students and 1
-- tutor each. All three reached the capped weight and the lowest concept id
-- took first place. Last school year about 1,700 topic weeks had three or
-- more students behind them.
--
-- So a tie in weight now goes to the topic with more students behind it,
-- then to the topic that belongs to the grade, then to the lower id. The
-- timeline endpoint ranks the same way, and also prefers a topic the school
-- was already on the week before, which a view cannot check cheaply.
--
-- Only the ORDER BY changes. Everything else is exactly migration 176.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the statement in half.

CREATE OR REPLACE VIEW school_week_topic_consensus AS
SELECT
    wc.school,
    wc.grade,
    wc.lang_stream,
    wc.academic_year,
    wc.week_number,
    wc.concept_id,
    wc.weight,
    wc.source_count,
    wc.sources,
    wc.student_count,
    ROW_NUMBER() OVER (
        PARTITION BY wc.school, wc.grade, wc.lang_stream, wc.academic_year, wc.week_number
        ORDER BY wc.weight DESC, wc.student_count DESC,
                 (c.grade <=> wc.grade) DESC, wc.concept_id
    ) AS rank_in_week
FROM (
    SELECT
        school,
        grade,
        lang_stream,
        academic_year,
        week_number,
        concept_id,
        SUM(source_weight) AS weight,
        COUNT(*) AS source_count,
        GROUP_CONCAT(source ORDER BY source) AS sources,
        SUM(students) AS student_count
    FROM (
        SELECT
            school,
            grade,
            lang_stream,
            academic_year,
            week_number,
            concept_id,
            source,
            CASE WHEN source = 'assignment'
                 THEN MAX(confidence) * (1 + 0.5 * (LEAST(COUNT(*), 3) - 1))
                 ELSE SUM(confidence) END AS source_weight,
            CASE WHEN source = 'assignment' THEN COUNT(*) ELSE 0 END AS students
        FROM (
            SELECT
                school,
                grade,
                lang_stream,
                academic_year,
                week_number,
                concept_id,
                source,
                MAX(confidence) AS confidence
            FROM school_topic_observations
            WHERE is_revision = FALSE AND excluded_reason IS NULL
            GROUP BY
                school, grade, lang_stream, academic_year, week_number,
                concept_id, source,
                CASE WHEN source = 'tutor_confirm' AND tutor_id IS NOT NULL
                     THEN CONCAT('t', tutor_id)
                     WHEN source = 'assignment' AND student_id IS NOT NULL
                     THEN CONCAT('s', student_id)
                     ELSE CONCAT('r', id) END
        ) one_vote_per_voice
        GROUP BY school, grade, lang_stream, academic_year, week_number, concept_id, source
    ) per_source
    GROUP BY school, grade, lang_stream, academic_year, week_number, concept_id
) wc
LEFT JOIN curriculum_concepts c ON c.id = wc.concept_id
