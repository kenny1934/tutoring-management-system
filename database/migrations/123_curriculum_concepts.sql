-- Migration 123: Curriculum concepts schema
-- When: 2026-07-03
-- Purpose: Two-layer curriculum suggestion foundation.
--   Layer 1 (timeless): curriculum_concepts + concept_code_aliases + courseware_concepts
--     map exercise PDFs to name-anchored, bilingual concepts.
--   Layer 2 (yearly): school_topic_observations record school x grade x stream x week
--     topic evidence from multiple sources. Consensus/pacing computed in later views.
-- Also drops the empty AppSheet-era curriculum_current_week view (superseded by
-- tutor_confirm observations).

-- ============================================================
-- 1. Concepts: name-anchored vocabulary (series-agnostic)
-- ============================================================
CREATE TABLE IF NOT EXISTS `curriculum_concepts` (
    `id`            INTEGER PRIMARY KEY AUTO_INCREMENT,
    `kind`          ENUM('chapter','subtopic','extension') NOT NULL,
    `parent_id`     INTEGER NULL,
    `name_en`       VARCHAR(255) NULL,
    `name_zh`       VARCHAR(255) NULL,
    `grade`         VARCHAR(50) NULL COMMENT 'F1-F3 band, matches students.grade format. NULL = spans grades',
    `display_order` INTEGER NULL COMMENT 'ordering within grade for timeline UI',
    `notes`         TEXT NULL COMMENT 'provenance, e.g. crosswalk decisions',
    `created_at`    DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_concept_parent` FOREIGN KEY (`parent_id`) REFERENCES `curriculum_concepts`(`id`),
    KEY `idx_concept_kind_grade` (`kind`, `grade`)
);

-- ============================================================
-- 2. Code aliases: per-code-space chapter codes pointing at concepts
--    code_space values: MAS / HK_OLD / HK_NEW / SM / SS (VARCHAR: new spaces
--    are a data decision, not a schema change).
--    (code_space, code) is deliberately NOT unique: split chapters alias
--    one old code to multiple concepts (e.g. HK_OLD 709 -> Congruence + Similarity).
-- ============================================================
CREATE TABLE IF NOT EXISTS `concept_code_aliases` (
    `id`         INTEGER PRIMARY KEY AUTO_INCREMENT,
    `concept_id` INTEGER NOT NULL,
    `code_space` VARCHAR(12) NOT NULL,
    `code`       VARCHAR(12) NOT NULL COMMENT 'e.g. 803 or 903.1',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_alias_concept` FOREIGN KEY (`concept_id`) REFERENCES `curriculum_concepts`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `uq_alias` (`code_space`, `code`, `concept_id`),
    KEY `idx_alias_lookup` (`code_space`, `code`)
);

-- ============================================================
-- 3. Courseware -> concept map (the content layer)
--    file_path: canonical ALIAS-form path (e.g. 'Center\Courseware (Eng)\...'),
--      directly usable in the exercise modal via resolveAliasPath().
--    match_path: alias/drive prefix stripped -> join key against assignment
--      history regardless of drive letter or era.
--    file_basename: fallback join key (weekly-folder copies reference the
--      same physical exercise under different paths).
-- ============================================================
CREATE TABLE IF NOT EXISTS `courseware_concepts` (
    `id`            INTEGER PRIMARY KEY AUTO_INCREMENT,
    `file_path`     VARCHAR(500) NOT NULL COMMENT 'canonical alias-form path, modal-ready',
    `match_path`    VARCHAR(500) NOT NULL COMMENT 'prefix-stripped normalized path, join key',
    `file_basename` VARCHAR(255) NOT NULL,
    `concept_id`    INTEGER NOT NULL,
    `role`          ENUM('master','exercise','quiz','mc','revision','question_bank','past_paper','mock') NULL,
    `lang`          ENUM('e','c') NULL,
    `source`        ENUM('code','filename_term','ai','manual') NOT NULL,
    `confidence`    DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    `created_at`    DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_cw_concept` FOREIGN KEY (`concept_id`) REFERENCES `curriculum_concepts`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `uq_file_concept` (`match_path`, `concept_id`),
    KEY `idx_cw_basename` (`file_basename`),
    KEY `idx_cw_concept` (`concept_id`)
);

-- ============================================================
-- 4. School topic observations (the timeline layer, per academic year)
--    Raw evidence only. Consensus (majority vote excluding revision) and
--    pacing bands (median week +/- spread across years) are computed views
--    added in a later migration once backfill lands.
-- ============================================================
CREATE TABLE IF NOT EXISTS `school_topic_observations` (
    `id`            INTEGER PRIMARY KEY AUTO_INCREMENT,
    `school`        VARCHAR(255) NOT NULL COMMENT 'canonical school name (alias map applied at ingest)',
    `grade`         VARCHAR(50) NOT NULL,
    `lang_stream`   VARCHAR(50) NULL COMMENT 'NULL = unknown stream',
    `academic_year` VARCHAR(20) NOT NULL COMMENT 'e.g. 2025-2026, matches academic_weeks',
    `week_number`   INTEGER NOT NULL,
    `concept_id`    INTEGER NOT NULL,
    `source`        ENUM('prep_folder','assignment','sheet','exam_scope','tutor_confirm') NOT NULL,
    `confidence`    DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    `is_revision`   BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'test-prep/revision evidence, excluded from topic consensus',
    `source_ref`    VARCHAR(500) NULL COMMENT 'provenance: file path / sheet cell / session id',
    `created_at`    DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_obs_concept` FOREIGN KEY (`concept_id`) REFERENCES `curriculum_concepts`(`id`) ON DELETE CASCADE,
    KEY `idx_obs_timeline` (`school`, `grade`, `lang_stream`, `academic_year`, `week_number`),
    KEY `idx_obs_concept_year` (`concept_id`, `academic_year`)
);

-- ============================================================
-- 5. Retire the empty AppSheet-era view (0 rows, unreferenced in webapp).
--    Flywheel tutor_confirm observations replace its purpose.
-- ============================================================
DROP VIEW IF EXISTS `curriculum_current_week`;
