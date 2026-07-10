-- Migration 129: one exam-scope row per (event, concept, source, line)
--
-- The 128 unique key was (event, concept, source), which collapses several
-- scope lines mapping to the same concept -- the dropped lines then keep
-- showing as "unreadable" because their stored row never existed. The line
-- is part of the identity: each stored row answers one description line.
-- (191-char prefix keeps the utf8mb4 index inside InnoDB limits -- scope
-- lines are far shorter in practice.)

ALTER TABLE `exam_scope_concepts`
    DROP KEY `uq_scope_event_concept_source`,
    ADD UNIQUE KEY `uq_scope_event_concept_line`
        (`calendar_event_id`, `concept_id`, `source`, `matched_text`(191))
