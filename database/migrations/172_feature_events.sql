-- =====================================================
-- Migration 172: a small record of what staff actually use
-- =====================================================
-- Asking "has anybody used this feature since we launched it" currently means
-- reading Cloud Run request logs and guessing, because a request tells you a
-- URL was fetched and nothing about whether a human ever saw the result. The
-- School Progress panel made that painfully clear. Its suggestions load on
-- hover, so the request count measured opportunity rather than attention, and
-- the only thing written to the database was the handful of confirmations
-- somebody actually tapped.
--
-- This table holds the middle ground: the moments where a person saw
-- something or chose not to act on it. Those are the moments that never
-- become a row anywhere else.
--
--   event_key    what happened, from a server-side allowlist in routers/
--                events.py. Anything not on the list is rejected, so the table
--                cannot fill up with whatever a page felt like sending.
--   entity_type  and entity_id, the thing it happened to. A session, a
--                student, a school week. Both optional.
--   context      a small JSON object for the details worth keeping, such as
--                the school and week a question was asked about.
--   dedupe_key   optional. When set it is unique across the table, so an event
--                that should only count once per person per day can be sent on
--                every render and land once. NULLs do not collide, so events
--                that want every occurrence simply leave it empty.
--   event_day    the Hong Kong date the event belongs to, written by the
--                server. created_at is not enough on its own: MySQL fills a
--                CURRENT_TIMESTAMP default in UTC while the app writes its own
--                timestamps in Hong Kong time, so a query that buckets by day
--                gets a different answer depending on which wrote the row. The
--                daily limit on how often a tutor is asked anything reads this
--                column and nothing else.
--
-- Nothing here identifies a parent or a child beyond the ids the app already
-- uses internally, and nothing is written for anyone who is not a logged-in
-- member of staff.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the next statement in half and the
-- whole run aborts. Use a full stop.

CREATE TABLE IF NOT EXISTS `feature_events` (
    `id`          INTEGER PRIMARY KEY AUTO_INCREMENT,
    `tutor_id`    INT NOT NULL COMMENT 'Who was on screen. Always a logged-in staff account.',
    `event_key`   VARCHAR(64) NOT NULL COMMENT 'Allowlisted key, e.g. school_progress.asked.routine',
    `entity_type` VARCHAR(32) NULL COMMENT 'session, student, school_week',
    `entity_id`   INT NULL,
    `context`     JSON NULL COMMENT 'Small object, e.g. school and week the question covered',
    `dedupe_key`  VARCHAR(160) NULL COMMENT 'Set to collapse repeats, e.g. once per tutor per session per day',
    `event_day`   DATE NOT NULL COMMENT 'Hong Kong date the event belongs to, written by the server',
    `created_at`  DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_feature_event_tutor` FOREIGN KEY (`tutor_id`) REFERENCES `tutors`(`id`),
    UNIQUE KEY `uq_feature_event_dedupe` (`dedupe_key`),
    KEY `idx_feature_event_key_time` (`event_key`, `event_day`),
    KEY `idx_feature_event_tutor_day` (`tutor_id`, `event_day`, `event_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
