-- =====================================================
-- Migration 180: key lesson ink by the page of the PDF
-- =====================================================
-- Migration 179 described page_index as the page's position among the pages
-- an exercise shows. That position moves when someone edits the exercise's
-- page range, so ink saved under it would land on the wrong page, and a new
-- page could take over the key of ink that is no longer shown.
--
-- The lesson views therefore save a worksheet page under its page of the PDF,
-- counted from 0, which never moves. A Draft sheet keeps its own index, 1000
-- and up. Only the column comment changes, and the table was still empty
-- when this ran.
--
-- No semicolons in prose anywhere in this file, punctuation included.
-- run_migrations.py splits on the statement separator before it strips
-- comments, so one inside a comment cuts the statement in half.

ALTER TABLE lesson_ink
    MODIFY COLUMN page_index INT NOT NULL
    COMMENT 'The PDF page counted from 0. Draft sheets are 1000 and up';
