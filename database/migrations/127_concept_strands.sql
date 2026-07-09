-- Migration 127: strand classification for the curriculum atlas
--
-- strand groups concepts into the atlas rows (number / algebra / geometry / data)
-- VARCHAR not ENUM for the same reason as concept_code_aliases.code_space --
-- adding a strand later is a data decision, not a schema change
--
-- atlas_grade is a display-only column for concepts whose grade is NULL
-- (extension topics that span grades) so every atlas node has a column --
-- the real grade stays NULL
--
-- Values are filled by database/curriculum/fill_concept_strands.py from
-- private/curriculum_data/concept_strands_seed.json (veto-reviewed)

ALTER TABLE `curriculum_concepts`
    ADD COLUMN `strand` VARCHAR(30) NULL COMMENT 'atlas row: number / algebra / geometry / data',
    ADD COLUMN `atlas_grade` VARCHAR(50) NULL COMMENT 'display grade for NULL-grade concepts on the atlas'
