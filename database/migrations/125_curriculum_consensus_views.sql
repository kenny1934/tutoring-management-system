-- Migration 125: Curriculum consensus + pacing views
-- When: 2026-07-03
-- Purpose: computed layers over school_topic_observations.
--   school_week_topic_consensus: confidence-weighted concept ranking per
--     school x grade x stream x year x week (revision evidence excluded).
--     Consumers filter rank_in_week = 1 for the majority topic, or <= 3 for
--     alternatives. tutor_confirm rows flow in automatically (flywheel).
--   school_concept_pacing: when each school typically reaches each concept,
--     across all observed years. Replaces the fixed +/-2 week window with a
--     measured band (mean week +/- spread).

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
    FROM school_topic_observations
    WHERE is_revision = FALSE
    GROUP BY school, grade, lang_stream, academic_year, week_number, concept_id
) week_concepts;

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
WHERE is_revision = FALSE
GROUP BY school, grade, lang_stream, concept_id;
