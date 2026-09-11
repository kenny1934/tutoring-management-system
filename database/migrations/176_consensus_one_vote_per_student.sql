-- =====================================================
-- Migration 176: one student, one vote, and evidence the grade check sets aside
-- =====================================================
-- Until now the observation rebuild kept a single assignment row per school,
-- grade, week and topic, worth 0.70 whether one student did the worksheet or
-- the whole class did. So the consensus could not tell one student from a
-- cohort, and a single student's worksheets could become a school's main
-- topic for the week. That is how 三角形 ended up as the SRL-C F3 topic in
-- September 2026, from one student whose grade on record was wrong.
--
-- The rebuild now writes one assignment row per student, with student_id
-- filled in, and this view gives each student one vote. The first student is
-- worth what the single row was worth before, each further student adds half
-- of that again, and the total stops growing at three students. Three is the
-- cap so that a big class doing the same worksheet cannot outweigh a
-- curriculum sheet plus a tutor confirming the topic. The view also returns
-- student_count, which the timeline uses to label a topic that only one
-- student's worksheets stand behind.
--
-- excluded_reason marks evidence the rebuild keeps for inspection but that
-- must not count. The only reason so far is grade_check, which the rebuild
-- sets on every assignment row of a student whose worksheets sit mostly
-- below their recorded grade when their school's own plans do not. That is
-- a repeating student whose grade was not corrected, or a student doing
-- catch-up work, and either way it says nothing about where the school is.
-- Both views ignore those rows, and the admin list of students to check
-- reads them.
--
-- Ties used to be broken by concept id, which meant the lower id won. They
-- now go to the topic that belongs to the grade being looked at first.
--
-- tutor_confirm keeps its one vote per tutor from migration 173, and prep
-- folders and sheets still count one row each.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the statement in half.

ALTER TABLE school_topic_observations
    ADD COLUMN excluded_reason VARCHAR(20) NULL
        COMMENT 'Set when a row is kept for inspection but must not count. grade_check is the only value.';

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
        ORDER BY wc.weight DESC, (c.grade <=> wc.grade) DESC, wc.concept_id
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
LEFT JOIN curriculum_concepts c ON c.id = wc.concept_id;

CREATE OR REPLACE VIEW school_concept_pacing AS
SELECT
    school,
    grade,
    lang_stream,
    concept_id,
    COUNT(DISTINCT academic_year) AS years_observed,
    ROUND(SUM(week_number * confidence) / SUM(confidence), 1) AS mean_week,
    MIN(week_number) AS min_week,
    MAX(week_number) AS max_week,
    ROUND(COALESCE(STDDEV(week_number), 0), 1) AS week_spread,
    ROUND(SUM(confidence), 2) AS total_weight
FROM school_topic_observations
WHERE is_revision = FALSE AND excluded_reason IS NULL
GROUP BY school, grade, lang_stream, concept_id
