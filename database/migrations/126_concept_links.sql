-- Migration 126: Concept links (cross-series equivalence, prerequisites reserved)
-- When: 2026-07-03
-- Purpose: relations BETWEEN concepts. First use: MAS <-> HK cross-series
--   equivalence so the pacing comparison can align lanes when comparing an
--   MAS-series school against an HK-series school (today their concept rows
--   are disjoint and comparison lanes never merge).
--   kind 'prerequisite' is reserved for a later authoring pass (AI batch +
--   veto review) -- no rows of that kind are seeded yet.
--   Links are stored once per pair -- 'equivalent' is symmetric and readers
--   must check both directions.

CREATE TABLE IF NOT EXISTS `concept_links` (
    `id`              INTEGER PRIMARY KEY AUTO_INCREMENT,
    `from_concept_id` INTEGER NOT NULL,
    `to_concept_id`   INTEGER NOT NULL,
    `kind`            ENUM('equivalent','prerequisite') NOT NULL,
    `source`          ENUM('xser','manual','ai') NOT NULL,
    `confidence`      DECIMAL(3,2) NOT NULL DEFAULT 1.00,
    `note`            VARCHAR(255) NULL COMMENT 'rationale, e.g. partial overlap',
    `created_at`      DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_link_from` FOREIGN KEY (`from_concept_id`) REFERENCES `curriculum_concepts`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_link_to` FOREIGN KEY (`to_concept_id`) REFERENCES `curriculum_concepts`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `uq_link` (`from_concept_id`, `to_concept_id`, `kind`),
    KEY `idx_link_to` (`to_concept_id`, `kind`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
