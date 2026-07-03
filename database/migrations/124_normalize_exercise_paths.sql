-- Migration 124: Normalize historical exercise paths to alias form
-- When: 2026-07-03
-- Purpose: pdf_name/answer_pdf_name rows from the AppSheet era (pre 2026-03) carry
--   raw drive-letter paths (Z:\..., W:\..., sometimes quoted). Drive letters vary
--   per machine, so these only resolve on machines with the same mapping. Rewrite
--   them to the shareable alias form the path-alias system understands
--   (resolveAliasPath in lib/file-system.ts), identified by ROOT-FOLDER FINGERPRINT,
--   never by drive letter.
--
-- Fingerprints (verified against actual share roots on 2026-07-03):
--   MCSA drive  -> alias 'Courseware Developer 中學':
--     Secondary | 中學參考教材 | new_math7-9 Source | 10_Courseware book | 進度表
--   Center drive -> alias 'Center':
--     Courseware (Chi) | Courseware (Eng) | ANS | MathConceptition | Unofficial | School Info | DSE Mock
--
-- Deliberately NOT rewritten (left as-is):
--   - Staff-drive roots (scan, 3. Staff, ...): MSA and MSB staff drives share the
--     same root layout, so rows cannot be safely attributed to the 'MSA Staff' alias.
--   - C:\Users\... personal paths.
--   - Rows already in alias form.
--
-- Originals are backed up to session_exercises_path_backup (reversible).
-- Idempotent: rewritten rows no longer match the drive-letter predicate.

-- ============================================================
-- 1. Backup table for originals
-- ============================================================
CREATE TABLE IF NOT EXISTS `session_exercises_path_backup` (
    `id`                  INTEGER PRIMARY KEY AUTO_INCREMENT,
    `session_exercise_id` INTEGER NOT NULL,
    `column_name`         VARCHAR(32) NOT NULL,
    `original_value`      VARCHAR(2048) NULL,
    `migrated_at`         DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_backup_exercise` (`session_exercise_id`)
);

-- ============================================================
-- 2. Back up pdf_name rows that will be rewritten
-- ============================================================
INSERT INTO `session_exercises_path_backup` (`session_exercise_id`, `column_name`, `original_value`)
SELECT `id`, 'pdf_name', `pdf_name`
FROM `session_exercises`
WHERE TRIM(BOTH '"' FROM `pdf_name`) REGEXP '^[A-Za-z]:[\\\\/](Secondary|中學參考教材|new_math7-9 Source|10_Courseware book|進度表|Courseware \\(Chi\\)|Courseware \\(Eng\\)|ANS|MathConceptition|Unofficial|School Info|DSE Mock)[\\\\/]';

INSERT INTO `session_exercises_path_backup` (`session_exercise_id`, `column_name`, `original_value`)
SELECT `id`, 'answer_pdf_name', `answer_pdf_name`
FROM `session_exercises`
WHERE TRIM(BOTH '"' FROM `answer_pdf_name`) REGEXP '^[A-Za-z]:[\\\\/](Secondary|中學參考教材|new_math7-9 Source|10_Courseware book|進度表|Courseware \\(Chi\\)|Courseware \\(Eng\\)|ANS|MathConceptition|Unofficial|School Info|DSE Mock)[\\\\/]';

-- ============================================================
-- 3. Rewrite pdf_name: MCSA drive fingerprints
--    'X:\Secondary\...' (any letter, optional quotes, / or \) ->
--    'Courseware Developer 中學\Secondary\...'
-- ============================================================
UPDATE `session_exercises`
SET `pdf_name` = CONCAT('Courseware Developer 中學', REPLACE(SUBSTRING(TRIM(BOTH '"' FROM `pdf_name`), 3), '/', '\\'))
WHERE TRIM(BOTH '"' FROM `pdf_name`) REGEXP '^[A-Za-z]:[\\\\/](Secondary|中學參考教材|new_math7-9 Source|10_Courseware book|進度表)[\\\\/]';

-- ============================================================
-- 4. Rewrite pdf_name: Center drive fingerprints
-- ============================================================
UPDATE `session_exercises`
SET `pdf_name` = CONCAT('Center', REPLACE(SUBSTRING(TRIM(BOTH '"' FROM `pdf_name`), 3), '/', '\\'))
WHERE TRIM(BOTH '"' FROM `pdf_name`) REGEXP '^[A-Za-z]:[\\\\/](Courseware \\(Chi\\)|Courseware \\(Eng\\)|ANS|MathConceptition|Unofficial|School Info|DSE Mock)[\\\\/]';

-- ============================================================
-- 5. Same rewrites for answer_pdf_name
-- ============================================================
UPDATE `session_exercises`
SET `answer_pdf_name` = CONCAT('Courseware Developer 中學', REPLACE(SUBSTRING(TRIM(BOTH '"' FROM `answer_pdf_name`), 3), '/', '\\'))
WHERE TRIM(BOTH '"' FROM `answer_pdf_name`) REGEXP '^[A-Za-z]:[\\\\/](Secondary|中學參考教材|new_math7-9 Source|10_Courseware book|進度表)[\\\\/]';

UPDATE `session_exercises`
SET `answer_pdf_name` = CONCAT('Center', REPLACE(SUBSTRING(TRIM(BOTH '"' FROM `answer_pdf_name`), 3), '/', '\\'))
WHERE TRIM(BOTH '"' FROM `answer_pdf_name`) REGEXP '^[A-Za-z]:[\\\\/](Courseware \\(Chi\\)|Courseware \\(Eng\\)|ANS|MathConceptition|Unofficial|School Info|DSE Mock)[\\\\/]';
