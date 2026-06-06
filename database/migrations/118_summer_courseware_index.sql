-- Summer courseware index: a scanned snapshot of the net-drive folder tree.
--
-- Context: Summer course CW/HW PDFs live on a NAS share, organised by a
-- naming convention (grade folder → "SM<code> <topic>" chapter folder →
-- variant files). Unlike regular classes where tutors pick exercises per
-- student, summer materials are determined by (grade, lesson_number,
-- lang_stream) — so lesson mode can resolve defaults from an index instead
-- of tutors assigning files by hand.
--
-- Shape:
--   - Files change on the share during the season, so nothing here is
--     hand-maintained: an admin rescans from a centre PC (browser walks the
--     mapped drive via the File System Access API) and the year's rows are
--     replaced wholesale. Defaults are resolved live from this index at
--     render time — no per-session rows are written until a tutor overrides
--     or marks homework, so a rescan can never leave stale defaults behind.
--   - `summer_courseware_scans` keeps one row per scan (history) with
--     accounting counts, while `summer_courseware_files` holds the latest tree
--     for each year.
--   - Unclassified rows (is_classified=FALSE) are files the parser couldn't
--     match to convention — surfaced in the admin panel as a drift alarm
--     rather than silently dropped.

CREATE TABLE summer_courseware_scans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  year INT NOT NULL,
  root_name VARCHAR(255) NULL
    COMMENT 'Name of the folder the admin picked when scanning (e.g. "Finalised")',
  path_prefix VARCHAR(500) NULL
    COMMENT 'Share path prefix prepended to rel_path to form a full file path',
  total_files INT NOT NULL DEFAULT 0,
  classified_count INT NOT NULL DEFAULT 0,
  unclassified_count INT NOT NULL DEFAULT 0,
  excluded_count INT NOT NULL DEFAULT 0
    COMMENT 'Working files skipped by rule: non-PDFs, Raw / Word Files subtrees',
  skipped_grade_count INT NOT NULL DEFAULT 0
    COMMENT 'Files under grades not indexed yet (F4+ SMSS scheme)',
  scanned_by VARCHAR(255) NULL,
  scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_scw_scan_year (year)
);

CREATE TABLE summer_courseware_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  year INT NOT NULL,
  grade VARCHAR(10) NULL COMMENT 'F1-F3. NULL when unclassified',
  course_code VARCHAR(20) NULL COMMENT 'Chapter code after SM, e.g. "701"',
  lesson_number INT NULL
    COMMENT 'Last two digits of course_code (SM701=L1). Codes beyond the configured lesson count are extra chapters.',
  topic_zh VARCHAR(255) NULL,
  topic_en VARCHAR(255) NULL,
  doc_type VARCHAR(10) NULL COMMENT 'CW | HW | Extra. NULL when unclassified',
  lang VARCHAR(5) NULL COMMENT 'e | c. NULL for parallel versions (both languages merged)',
  is_parallel BOOL NOT NULL DEFAULT FALSE,
  is_answer BOOL NOT NULL DEFAULT FALSE,
  is_classified BOOL NOT NULL DEFAULT TRUE,
  unclassified_reason VARCHAR(255) NULL,
  rel_path VARCHAR(500) NOT NULL
    COMMENT 'Backslash path relative to the scanned root folder',
  file_name VARCHAR(255) NOT NULL,
  file_mtime DATETIME NULL,
  INDEX idx_scw_year_grade_lesson (year, grade, lesson_number),
  INDEX idx_scw_year_classified (year, is_classified)
);
