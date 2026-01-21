-- =====================================================
-- Performance Indexes Migration
-- Run on Google Cloud SQL (MySQL)
--
-- Adds 7 new indexes for frequently filtered columns
-- to improve query performance on large tables
-- =====================================================

-- Enrollment table indexes (4 new)
CREATE INDEX idx_enrollment_first_lesson ON enrollments(first_lesson_date);
CREATE INDEX idx_enrollment_student ON enrollments(student_id);
CREATE INDEX idx_enrollment_tutor ON enrollments(tutor_id);
CREATE INDEX idx_enrollment_location ON enrollments(location);

-- Session log table indexes (3 new)
CREATE INDEX idx_session_log_student ON session_log(student_id);
CREATE INDEX idx_session_log_tutor ON session_log(tutor_id);
CREATE INDEX idx_session_log_enrollment ON session_log(enrollment_id);

-- Note: Parent communications indexes not needed
-- (student_id, tutor_id, contact_date already covered by existing composite indexes)
