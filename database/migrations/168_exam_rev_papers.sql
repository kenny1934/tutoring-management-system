-- Migration 168: archive of tailor-made exam revision papers
--
-- This file was numbered 130 when it was applied to production on
-- 15 July 2026. It was renumbered before merging because main had taken
-- 130 for an unrelated summer backfill in the meantime. Nothing needs
-- re-running.
--
-- Tutors build aggregated revision papers for one school's test or exam and
-- file them in the weekly prep folders. Filenames rarely carry topics, so the
-- papers become unfindable a year later. backfill_rev_papers.py detects them
-- in the drive tree, dedupes answer/source variants into one row, and links
-- each paper to the calendar event it was made for.
--
-- Topic index comes from exam_rev_paper_concepts, filled by tier --
-- 'event' copies the linked event's parsed scope, 'code' maps a chapter code
-- in the filename, 'proxy' borrows the scope of the same school and grade's
-- event in another year at a similar week, 'ai' is a later filename pass.
-- scope_source on the paper records which tier won.
--
-- Papers outlive calendar events (the file is still on the drive when the
-- sync retires an event), hence ON DELETE SET NULL on the link.

CREATE TABLE IF NOT EXISTS `exam_rev_papers` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `file_path` VARCHAR(500) NOT NULL COMMENT 'canonical alias-form path, preview-ready',
    `match_path` VARCHAR(500) NOT NULL COMMENT 'prefix-stripped join key',
    `file_basename` VARCHAR(255) NOT NULL,
    `variant_paths` TEXT NULL COMMENT 'JSON array of companion files (answers, source doc)',
    `school` VARCHAR(100) NULL COMMENT 'canonical school, NULL when the folder is not recognisable',
    `grade` VARCHAR(20) NULL,
    `lang_stream` VARCHAR(10) NULL,
    `academic_year` VARCHAR(10) NOT NULL,
    `week_number` INT NOT NULL,
    `exam_kind` VARCHAR(20) NULL COMMENT 'Exam / Test / Quiz / Mock keyword from folder or filename',
    `calendar_event_id` INT NULL,
    `link_confidence` DECIMAL(3,2) NULL,
    `scope_source` ENUM('event', 'code', 'proxy', 'ai', 'none') NOT NULL DEFAULT 'none',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_rev_paper_path` (`match_path`),
    KEY `idx_rev_paper_school` (`school`, `grade`, `academic_year`),
    KEY `idx_rev_paper_event` (`calendar_event_id`),
    CONSTRAINT `fk_rev_paper_event` FOREIGN KEY (`calendar_event_id`)
        REFERENCES `calendar_events`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `exam_rev_paper_concepts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `paper_id` INT NOT NULL,
    `concept_id` INT NOT NULL,
    `confidence` DECIMAL(3,2) NOT NULL DEFAULT 0.70,
    `source` ENUM('event', 'code', 'proxy', 'ai', 'manual') NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_rev_paper_concept` (`paper_id`, `concept_id`, `source`),
    KEY `idx_rpc_concept` (`concept_id`),
    CONSTRAINT `fk_rpc_paper` FOREIGN KEY (`paper_id`)
        REFERENCES `exam_rev_papers`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_rpc_concept` FOREIGN KEY (`concept_id`)
        REFERENCES `curriculum_concepts`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
