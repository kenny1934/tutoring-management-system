-- Preserve the individual worksheet counts used by the nightly grade check.
-- This additive table leaves existing observations and readers unchanged.
CREATE TABLE IF NOT EXISTS curriculum_grade_check_evidence (
    student_id INTEGER NOT NULL,
    academic_year VARCHAR(20) NOT NULL,
    school VARCHAR(255) NOT NULL,
    grade VARCHAR(50) NOT NULL,
    worksheet_grade VARCHAR(50) NOT NULL,
    worksheet_count INTEGER NOT NULL,
    first_week INTEGER NOT NULL,
    last_week INTEGER NOT NULL,
    PRIMARY KEY (student_id, academic_year, worksheet_grade),
    KEY idx_grade_check_year (academic_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Match the student grade comparison even if this table already exists.
ALTER TABLE curriculum_grade_check_evidence
    CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
