-- =====================================================
-- Migration 178: store the order of a session's exercises
-- =====================================================
-- Saving "Edit exercises" used to delete every exercise of that type and
-- insert the list again, so every save gave every exercise a new id. That cut
-- homework completion records loose from their exercise, and it would orphan
-- anything else keyed by an exercise id, such as lesson ink saved on the server.
--
-- The save now updates rows in place and keeps their ids. The list used to be
-- shown in id order, and dragging a row to a new place only worked because
-- the save recreated the rows in the new order. With stable ids that no longer
-- happens, so the edit form stores each row's place here.
--
-- Existing rows are left empty, and so are rows added any other way, such as
-- from a courseware panel or a bulk assign. The app shows rows with a place
-- first, in that order, and then the empty ones in the order they were added.
-- Every session therefore keeps the order it has today, and an added
-- exercise still goes to the end.
--
-- A nullable column added at the end is an instant change in MySQL 8, and the
-- backend that is already deployed never reads it.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the statement in half.

ALTER TABLE session_exercises
    ADD COLUMN sort_order INT NULL
    COMMENT 'Place in the edit form list. Empty rows follow the rest in id order';
