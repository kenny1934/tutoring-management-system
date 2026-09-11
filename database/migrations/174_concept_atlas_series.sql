-- =====================================================
-- Migration 174: which series an extension topic belongs to on the atlas
-- =====================================================
-- The atlas works out a topic's series from its chapter codes. An extension
-- topic has no code by definition, so until now it appeared in both the MAS
-- and the HK atlas regardless of the evidence. For most of them that is right,
-- because schools on both series teach them. Travel Graphs and Sequences are
-- the exceptions. Every observation of Travel Graphs comes from HK series
-- schools, and Sequences has twenty HK observations against two MAS ones, so
-- showing either of them in the MAS atlas suggested a topic that MAS schools
-- do not teach.
--
-- atlas_series holds MAS or HK when the topic belongs to one series only.
-- NULL keeps the old behaviour, which is to follow the chapter codes and fall
-- back to both series when there are none. Like strand, it is display-only
-- and filled by database/curriculum/fill_concept_strands.py from
-- private/curriculum_data/concept_strands_seed.json.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the statement in half.

ALTER TABLE `curriculum_concepts`
    ADD COLUMN `atlas_series` VARCHAR(12) NULL COMMENT 'MAS or HK when an extension topic belongs to one series, NULL follows the codes'
