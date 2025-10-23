-- =====================================================
-- Migration 034: Students Needing Contact View
-- =====================================================
-- Purpose: Offload AppSheet virtual column calculation to MySQL
--          for better performance when counting students needing contact
--
-- Replaces AppSheet formula:
-- COUNT(SELECT(My Student Enrollments Slice[id],
--   AND([tutor_id] = USERSETTINGS("SelectedTutor"),
--       IN([_contact_status], LIST("🔴Contact Needed", "❌Never Contacted"))
--   )
-- ))
--
-- Contact Status Logic (from migration 009):
-- - "Never Contacted": No communication records exist
-- - "Contact Needed": Last contact > 14 days ago
-- - "Been a While": Last contact 8-14 days ago
-- - "Recent": Last contact <= 7 days ago
-- =====================================================

SELECT 'Creating students needing contact views...' as status;

-- =====================================================
-- VIEW 1: Latest Enrollments with Contact Status
-- =====================================================
-- Shows each student's latest enrollment with their contact status
-- This replicates the "My Student Enrollments Slice" from AppSheet
-- =====================================================
CREATE OR REPLACE VIEW latest_enrollments_with_contact_status AS
SELECT
    e.id,
    e.student_id,
    e.tutor_id,
    e.location,
    e.assigned_day,
    e.assigned_time,
    e.lessons_paid,
    e.payment_date,
    e.first_lesson_date,
    e.payment_status,
    e.discount_id,
    e.remark,
    e.deadline_extension_weeks,
    e.enrollment_type,
    e.effective_end_date,
    e.original_end_date,
    e.days_until_end,

    -- Student details
    s.student_name,
    s.school_student_id,
    s.grade,
    s.phone,
    s.school,
    s.lang_stream,
    s.home_location as student_home_location,
    s.academic_stream,

    -- Tutor details
    t.tutor_name,
    t.user_email as tutor_email,
    t.default_location as tutor_default_location,

    -- Contact status from parent communications
    COALESCE(pcs.contact_status, 'Never Contacted') as contact_status,
    pcs.last_contact_date,
    pcs.days_since_contact,
    pcs.total_communications,
    pcs.communications_last_30_days,

    -- Add emoji icon for AppSheet compatibility
    CASE
        WHEN COALESCE(pcs.contact_status, 'Never Contacted') = 'Never Contacted' THEN '❌'
        WHEN pcs.contact_status = 'Contact Needed' THEN '🔴'
        WHEN pcs.contact_status = 'Been a While' THEN '🟡'
        WHEN pcs.contact_status = 'Recent' THEN '✅'
        ELSE '❓'
    END as contact_status_icon,

    -- Concatenated status (matches AppSheet _contact_status field)
    CONCAT(
        CASE
            WHEN COALESCE(pcs.contact_status, 'Never Contacted') = 'Never Contacted' THEN '❌'
            WHEN pcs.contact_status = 'Contact Needed' THEN '🔴'
            WHEN pcs.contact_status = 'Been a While' THEN '🟡'
            WHEN pcs.contact_status = 'Recent' THEN '✅'
            ELSE '❓'
        END,
        COALESCE(pcs.contact_status, 'Never Contacted')
    ) as contact_status_full

FROM latest_enrollments e
INNER JOIN students s ON e.student_id = s.id
INNER JOIN tutors t ON e.tutor_id = t.id
LEFT JOIN parent_communication_summary pcs ON s.id = pcs.student_id;

SELECT 'Created latest_enrollments_with_contact_status view.' as result;

-- =====================================================
-- VIEW 2: Students Needing Contact Count by Tutor/Location
-- =====================================================
-- Pre-calculated counts for quick lookups
-- This replaces the AppSheet virtual column calculation
-- =====================================================
CREATE OR REPLACE VIEW students_needing_contact_count AS
SELECT
    tutor_id,
    tutor_name,
    tutor_email,
    location,

    -- Count of students needing contact (Contact Needed OR Never Contacted)
    COUNT(CASE
        WHEN contact_status IN ('Contact Needed', 'Never Contacted')
        THEN 1
    END) as students_needing_contact,

    -- Breakdown by status
    COUNT(CASE WHEN contact_status = 'Never Contacted' THEN 1 END) as never_contacted_count,
    COUNT(CASE WHEN contact_status = 'Contact Needed' THEN 1 END) as contact_needed_count,
    COUNT(CASE WHEN contact_status = 'Been a While' THEN 1 END) as been_a_while_count,
    COUNT(CASE WHEN contact_status = 'Recent' THEN 1 END) as recent_contact_count,

    -- Total students (for percentage calculation)
    COUNT(*) as total_students,

    -- Percentage needing contact
    ROUND(
        100.0 * COUNT(CASE
            WHEN contact_status IN ('Contact Needed', 'Never Contacted')
            THEN 1
        END) / NULLIF(COUNT(*), 0),
        1
    ) as percent_needing_contact

FROM latest_enrollments_with_contact_status
GROUP BY tutor_id, tutor_name, tutor_email, location;

SELECT 'Created students_needing_contact_count view.' as result;

-- =====================================================
-- VIEW 3: Students Needing Contact Detail
-- =====================================================
-- Detailed list for drilling down into which students need contact
-- =====================================================
CREATE OR REPLACE VIEW students_needing_contact_detail AS
SELECT
    id as enrollment_id,
    student_id,
    student_name,
    school_student_id,
    grade,
    phone,
    school,
    tutor_id,
    tutor_name,
    tutor_email,
    location,
    assigned_day,
    assigned_time,
    contact_status,
    contact_status_icon,
    contact_status_full,
    last_contact_date,
    days_since_contact,
    total_communications,
    communications_last_30_days,
    effective_end_date,
    days_until_end
FROM latest_enrollments_with_contact_status
WHERE contact_status IN ('Contact Needed', 'Never Contacted')
ORDER BY
    location,
    tutor_name,
    CASE
        WHEN contact_status = 'Never Contacted' THEN 1
        ELSE 2
    END,
    -- In MySQL, use COALESCE to handle NULLs (students never contacted)
    -- Sort so students never contacted (NULL days) appear first
    COALESCE(days_since_contact, 99999) DESC;

SELECT 'Created students_needing_contact_detail view.' as result;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

-- Example 1: Get count for specific tutor and location (replaces AppSheet VC)
-- SELECT students_needing_contact
-- FROM students_needing_contact_count
-- WHERE tutor_email = 'tutor@example.com'
--   AND location = 'MSA';

-- Example 2: Get detailed list of students needing contact for a tutor
-- SELECT student_name, grade, contact_status, days_since_contact, phone
-- FROM students_needing_contact_detail
-- WHERE tutor_email = 'tutor@example.com'
--   AND location = 'MSA';

-- Example 3: Dashboard overview for all tutors at a location
-- SELECT tutor_name, students_needing_contact, total_students, percent_needing_contact
-- FROM students_needing_contact_count
-- WHERE location = 'MSA'
-- ORDER BY percent_needing_contact DESC;

-- =====================================================
-- APPSHEET INTEGRATION NOTES
-- =====================================================
-- Replace the virtual column formula with:
-- ANY(
--   SELECT(students_needing_contact_count[students_needing_contact],
--     AND([tutor_email] = USEREMAIL(),
--         [location] = USERSETTINGS("SelectedLocation"))
--   )
-- )
--
-- Or create a REF column to students_needing_contact_count table
-- and use [_THISROW].[students_needing_contact]
-- =====================================================

SELECT 'Migration 034 completed successfully.' as final_status;
SELECT 'Views created: latest_enrollments_with_contact_status, students_needing_contact_count, students_needing_contact_detail' as views_created;

-- =====================================================
-- ROLLBACK SCRIPT (if needed):
-- DROP VIEW IF EXISTS students_needing_contact_detail;
-- DROP VIEW IF EXISTS students_needing_contact_count;
-- DROP VIEW IF EXISTS latest_enrollments_with_contact_status;
-- =====================================================
