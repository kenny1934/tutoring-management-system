-- =====================================================
-- Migration 179: lesson ink saved on the server
-- =====================================================
-- Until now a tutor's ink lived only in the browser tab. Leaving a lesson
-- deleted it, which is why the lesson views forced a Download All on the way
-- out, and nobody could reopen a lesson's marks later or carry them to
-- another device. This table keeps it, one row per page of ink.
--
--   session_id           the lesson the ink belongs to. Deleted with it.
--   session_exercise_id  the exercise it was drawn on. Deleted with it, so
--                        taking an exercise off a lesson takes its ink too.
--                        Empty for a parallel-version preview, which is not
--                        an exercise row.
--   target_key           what the page belongs to within the lesson. It is
--                        ex:<exercise id> for an exercise, or preview:<file id>
--                        for a preview, which the multi-student view files
--                        under the slot's first session.
--   page_index           the page's position among the pages shown, as the
--                        lesson views count them. The Draft's sheets are 1000
--                        and up.
--   pdf_page             the real page of the PDF, so ink can be put back on
--                        its own page if the exercise's page range is edited.
--                        Empty for a Draft sheet.
--   pdf_name             the file, so the ink still makes sense on its own.
--   strokes              the page's strokes as JSON, with points rounded by
--                        the app before sending.
--   version              goes up by one on every write. A save names the
--                        version it started from, and the later save wins.
--   updated_by           the email of whoever wrote the page last.
--   updated_at           when, in Hong Kong time, written by the server.
--
-- A nightly job deletes ink from lessons more than a year old.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the statement in half.

CREATE TABLE IF NOT EXISTS `lesson_ink` (
    `id`                  INT PRIMARY KEY AUTO_INCREMENT,
    `session_id`          INT NOT NULL,
    `session_exercise_id` INT NULL,
    `target_key`          VARCHAR(40) NOT NULL COMMENT 'ex:<exercise id> or preview:<file id>',
    `page_index`          INT NOT NULL COMMENT 'Position among the pages shown. Draft sheets are 1000 and up',
    `pdf_page`            INT NULL COMMENT 'Real PDF page. Empty for a Draft sheet',
    `pdf_name`            VARCHAR(500) NULL,
    `strokes`             JSON NOT NULL,
    `version`             INT NOT NULL DEFAULT 1,
    `updated_by`          VARCHAR(255) NOT NULL,
    `updated_at`          DATETIME NOT NULL,
    UNIQUE KEY `uq_lesson_ink_page` (`session_id`, `target_key`, `page_index`),
    CONSTRAINT `fk_lesson_ink_session` FOREIGN KEY (`session_id`)
        REFERENCES `session_log`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_lesson_ink_exercise` FOREIGN KEY (`session_exercise_id`)
        REFERENCES `session_exercises`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
