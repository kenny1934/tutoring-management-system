-- =====================================================
-- Migration 027: Add Staff Referral Flag
-- =====================================================
-- Purpose: Flag students who are staff relatives
--          They get unlimited $500 Staff Referral discount
--
-- Priority: Staff discount ($500) > Regular coupon ($300)

SELECT 'Adding staff referral flag to students...' as status;

ALTER TABLE students
ADD COLUMN is_staff_referral BOOLEAN DEFAULT FALSE COMMENT 'TRUE if student is staff relative (unlimited $500 discount)',
ADD COLUMN staff_referral_notes TEXT NULL COMMENT 'Which staff member, relationship, etc.';

CREATE INDEX idx_staff_referral ON students(is_staff_referral);

SELECT 'Migration 027 completed.' as result;
SELECT 'Mark staff referral students manually in AppSheet or run UPDATE query.' as reminder;

-- =====================================================
-- Example: Mark students as staff referral
-- =====================================================
-- UPDATE students
-- SET is_staff_referral = TRUE,
--     staff_referral_notes = 'Son of Teacher ABC'
-- WHERE id = ?;

-- =====================================================
-- END Migration 027
-- =====================================================
