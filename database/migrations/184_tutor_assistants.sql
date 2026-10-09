-- =====================================================
-- Migration 184: tutors who assist another tutor
-- =====================================================
-- Since 2.1.2 only a lesson's own tutor or an admin can change its classwork
-- and homework. That broke one real arrangement. A new tutor who sits in on
-- another tutor's lessons as an assistant needs to add the classwork to those
-- lessons, and nothing in CSM said that the two of them work together.
--
-- Each row here says that one tutor assists another. While the row is active,
-- the assistant can change the classwork and homework of the lead tutor's
-- lessons, and nothing else about them. Rating, attendance and every other
-- change stay with the lead tutor and the admins.
--
-- effective_until is the last day the arrangement holds. It is optional, so a
-- row without it lasts until an admin removes it. Setting it lets the access
-- lapse by itself once the new tutor has students of their own.
--
-- This only adds a table, so the deployed backend keeps working if it lands
-- before the code that reads it.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the next statement in half and the
-- whole run aborts. Use a full stop.

CREATE TABLE IF NOT EXISTS tutor_assistants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    assistant_tutor_id INT NOT NULL COMMENT 'The tutor who helps out',
    lead_tutor_id INT NOT NULL COMMENT 'The tutor whose lessons they help with',
    effective_until DATE NULL COMMENT 'Last day the arrangement holds. NULL means until removed.',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'UTC, from Cloud SQL',
    created_by VARCHAR(255) NULL COMMENT 'Email of the admin who set it up',
    UNIQUE KEY uq_assistant_lead (assistant_tutor_id, lead_tutor_id),
    INDEX idx_assistant_lead_tutor (lead_tutor_id),
    CONSTRAINT fk_assistant_tutor FOREIGN KEY (assistant_tutor_id) REFERENCES tutors(id) ON DELETE CASCADE,
    CONSTRAINT fk_assistant_lead FOREIGN KEY (lead_tutor_id) REFERENCES tutors(id) ON DELETE CASCADE
) COMMENT 'Tutors who may change the classwork and homework of another tutor''s lessons';

SELECT 'Migration 184 completed successfully.' as result;

-- ROLLBACK:
-- DROP TABLE tutor_assistants
