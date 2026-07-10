-- Migration 128: persisted exam-scope concept rows
--
-- Mechanical scope parsing (curriculum/exam_scope.py) is deterministic and
-- runs on demand -- only AI-batch results and manual corrections need to
-- persist. Rows are keyed to the description line they were parsed from
-- (matched_text) so a re-synced description that drops the line silently
-- retires the row.
--
-- calendar_events rows are deleted by the calendar sync when events vanish
-- from Google Calendar, hence ON DELETE CASCADE.

CREATE TABLE IF NOT EXISTS `exam_scope_concepts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `calendar_event_id` INT NOT NULL,
    `concept_id` INT NOT NULL,
    `matched_text` VARCHAR(500) NOT NULL COMMENT 'description line this mapping came from',
    `confidence` DECIMAL(3,2) NOT NULL DEFAULT 0.70,
    `source` ENUM('ai', 'manual') NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_scope_event_concept_source` (`calendar_event_id`, `concept_id`, `source`),
    KEY `idx_scope_event` (`calendar_event_id`),
    CONSTRAINT `fk_scope_event` FOREIGN KEY (`calendar_event_id`)
        REFERENCES `calendar_events`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_scope_concept` FOREIGN KEY (`concept_id`)
        REFERENCES `curriculum_concepts`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
