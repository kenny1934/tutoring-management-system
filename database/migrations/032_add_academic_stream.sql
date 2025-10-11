-- =====================================================
-- Migration 032: Add Academic Stream for F4-F6 Students
-- =====================================================
-- Purpose: Track Science vs Arts stream for senior form students
--          (F4-F6 students have different test schedules and curriculum)
--
-- Examples:
-- - Student A: school=SRL-E, grade=F4, academic_stream=Science
-- - Student B: school=SRL-E, grade=F4, academic_stream=Arts

SELECT 'Adding academic_stream column to students...' as status;

ALTER TABLE students
ADD COLUMN academic_stream VARCHAR(50) NULL COMMENT 'Academic stream for F4-F6: Science, Arts, or NULL for junior forms';

CREATE INDEX idx_academic_stream ON students(academic_stream);

SELECT 'Migration 032 completed.' as result;
SELECT 'Update F4-F6 students with their academic stream in AppSheet.' as reminder;

-- =====================================================
-- Example: Set academic stream for students
-- =====================================================

-- UPDATE students
-- SET academic_stream = 'Science'
-- WHERE grade IN ('F4', 'F5', 'F6') AND <condition>;

-- UPDATE students
-- SET academic_stream = 'Arts'
-- WHERE grade IN ('F4', 'F5', 'F6') AND <condition>;

-- =====================================================
-- Example queries
-- =====================================================

-- Find all F4 Science students
-- SELECT * FROM students
-- WHERE grade = 'F4' AND academic_stream = 'Science';

-- Find all SRL-E F5 Arts students
-- SELECT * FROM students
-- WHERE school = 'SRL-E' AND grade = 'F5' AND academic_stream = 'Arts';

-- Count students by grade and stream
-- SELECT grade, academic_stream, COUNT(*) as student_count
-- FROM students
-- WHERE grade IN ('F4', 'F5', 'F6')
-- GROUP BY grade, academic_stream
-- ORDER BY grade, academic_stream;

-- =====================================================
-- END Migration 032
-- =====================================================
