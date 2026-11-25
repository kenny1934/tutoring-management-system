-- Preserve sold lesson values when monthly timetables gain sessions.
-- This migration is additive and must precede the new backend.
ALTER TABLE session_log ADD COLUMN billing_tuition_amount DECIMAL(12,6) NULL
    COMMENT 'Agreed tuition per original or replacement session';

CREATE OR REPLACE VIEW enrollment_costs AS
SELECT
    e.id as enrollment_id,
    e.student_id,
    e.tutor_id,
    e.lessons_paid,
    e.is_new_student,
    e.payment_status,
    e.first_lesson_date,

    -- Legacy informational columns (flat formula), kept for display only.
    400 * e.lessons_paid as base_fee,
    COALESCE(d.discount_value, 0) as discount_amount,
    d.discount_name,
    CASE WHEN e.is_new_student = TRUE THEN 100 ELSE 0 END as reg_fee,

    -- What the student pays: real fee (revenue_total + reg fee), with a fallback
    -- to the old formula while revenue_total is still NULL (pre-backfill).
    COALESCE(e.revenue_total, (400 * e.lessons_paid) - COALESCE(d.discount_value, 0))
        + CASE WHEN e.is_new_student = TRUE THEN 100 ELSE 0 END as final_fee,

    -- Tutor revenue from the enrollment (excludes reg fee), same fallback.
    COALESCE(e.revenue_total, (400 * e.lessons_paid) - COALESCE(d.discount_value, 0)) as tutor_revenue_total,

    -- Per-session worth recognised when attendance is taken.
    CASE
        WHEN e.revenue_total IS NOT NULL
            THEN e.revenue_total / NULLIF(e.lessons_paid, 0)
        ELSE ((400 * e.lessons_paid) - COALESCE(d.discount_value, 0)) / NULLIF(e.lessons_paid, 0)
    END as cost_per_session

FROM enrollments e
LEFT JOIN discounts d ON e.discount_id = d.id
WHERE e.payment_status IN ('Paid', 'Pending Payment', 'Partially Paid');

CREATE OR REPLACE VIEW session_costs AS
SELECT
    sl.id as session_id,
    sl.enrollment_id,
    sl.student_id,
    sl.tutor_id,
    sl.session_date,
    sl.session_status,
    sl.time_slot,
    sl.location,

    -- Student and tutor names
    CONCAT(s.home_location, '-', s.school_student_id, ' ', s.student_name) as student_name_formatted,
    s.student_name,
    t.tutor_name,

    -- Revenue calculation
    COALESCE(sl.billing_tuition_amount, ec.cost_per_session) as cost_per_session,
    ec.base_fee as enrollment_base_fee,
    ec.discount_amount as enrollment_discount,
    ec.tutor_revenue_total as enrollment_tutor_revenue,

    -- Date breakdown for reporting
    YEAR(sl.session_date) as session_year,
    MONTH(sl.session_date) as session_month,
    DATE_FORMAT(sl.session_date, '%Y-%m') as session_period,
    DATE_FORMAT(sl.session_date, '%Y-%m-%d') as session_date_formatted

FROM session_log sl
INNER JOIN enrollment_costs ec ON sl.enrollment_id = ec.enrollment_id
INNER JOIN students s ON sl.student_id = s.id
INNER JOIN tutors t ON sl.tutor_id = t.id
WHERE sl.session_status IN ('Attended', 'Attended (Make-up)', 'No Show')  -- Only sessions where tutor attended
  AND sl.enrollment_id IS NOT NULL;
