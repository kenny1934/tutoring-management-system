-- =====================================================
-- Migration 173: one tutor, one vote per topic week
-- =====================================================
-- school_week_topic_consensus adds up the confidence of every observation for
-- a school week, which was right while the evidence came from files. It stops
-- being right now that tutors answer a question on screen, because a
-- confirmation is idempotent per tutor and student, not per tutor. A tutor who
-- answers the same question for five students of the same school and grade
-- writes five rows worth 1.00 each, and one person's single piece of knowledge
-- lands with weight five, heavy enough to bury a genuine second opinion from
-- somebody else.
--
-- The rows themselves stay exactly as they are. They carry the student ids
-- that let us notice when two classes at one school are on different topics,
-- and that is worth keeping. Only the weight changes: tutor_confirm rows now
-- collapse to one per tutor before the sum, so a second tutor agreeing still
-- adds weight and the same tutor repeating themselves does not.
--
-- Evidence from files is untouched. Each of those rows keeps counting on its
-- own, which the CASE below does by grouping them on their own primary key.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the next statement in half and the
-- whole run aborts. Use a full stop.

CREATE OR REPLACE VIEW school_week_topic_consensus AS
SELECT
    school,
    grade,
    lang_stream,
    academic_year,
    week_number,
    concept_id,
    weight,
    source_count,
    sources,
    ROW_NUMBER() OVER (
        PARTITION BY school, grade, lang_stream, academic_year, week_number
        ORDER BY weight DESC, concept_id
    ) AS rank_in_week
FROM (
    SELECT
        school,
        grade,
        lang_stream,
        academic_year,
        week_number,
        concept_id,
        SUM(confidence) AS weight,
        COUNT(DISTINCT source) AS source_count,
        GROUP_CONCAT(DISTINCT source ORDER BY source) AS sources
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
        WHERE is_revision = FALSE
        GROUP BY
            school, grade, lang_stream, academic_year, week_number,
            concept_id, source,
            CASE WHEN source = 'tutor_confirm' AND tutor_id IS NOT NULL
                 THEN CONCAT('t', tutor_id)
                 ELSE CONCAT('r', id) END
    ) one_vote_per_voice
    GROUP BY school, grade, lang_stream, academic_year, week_number, concept_id
) week_concepts;
