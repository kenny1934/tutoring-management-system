-- =====================================================
-- Migration 030: Add Tutor Revenue Tracking
-- =====================================================
-- Purpose: Calculate tutor revenue on a monthly basis for salary calculations
--
-- Revenue Calculation Logic:
-- 1. Enrollment final fee = (base_fee × lessons_paid) - discount + reg_fee (new students only)
-- 2. Tutor revenue per enrollment = final_fee - reg_fee (reg fee doesn't go to tutor)
-- 3. Cost per session = tutor_revenue_per_enrollment / lessons_paid
-- 4. Monthly tutor revenue = SUM(cost_per_session) for all attended sessions in month
--
-- Countable sessions: 'Attended', 'Attended (Make-up)', 'No Show'
-- (Sessions where tutor took attendance, not rescheduled)

SELECT 'Creating tutor revenue tracking views...' as status;

-- =====================================================
-- VIEW: Enrollment Costs and Revenue Breakdown
-- =====================================================
CREATE OR REPLACE VIEW enrollment_costs AS
SELECT
    e.id as enrollment_id,
    e.student_id,
    e.tutor_id,
    e.lessons_paid,
    e.is_new_student,
    e.payment_status,
    e.first_lesson_date,

    -- Base fee calculation
    400 * e.lessons_paid as base_fee,

    -- Discount amount (if any)
    COALESCE(d.discount_value, 0) as discount_amount,
    d.discount_name,

    -- Registration fee (only for new students)
    CASE WHEN e.is_new_student = TRUE THEN 100 ELSE 0 END as reg_fee,

    -- Final fee (what student pays)
    (400 * e.lessons_paid) - COALESCE(d.discount_value, 0) +
    CASE WHEN e.is_new_student = TRUE THEN 100 ELSE 0 END as final_fee,

    -- Tutor revenue from enrollment (excludes reg fee, counts towards tutor salary)
    (400 * e.lessons_paid) - COALESCE(d.discount_value, 0) as tutor_revenue_total,

    -- Cost per session for tutor revenue calculation
    ((400 * e.lessons_paid) - COALESCE(d.discount_value, 0)) / e.lessons_paid as cost_per_session

FROM enrollments e
LEFT JOIN discounts d ON e.discount_id = d.id
WHERE e.payment_status IN ('Paid', 'Pending Payment');

SELECT 'Created enrollment_costs view.' as result;

-- =====================================================
-- VIEW: Session Costs (Individual Session Revenue)
-- =====================================================
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
    ec.cost_per_session,
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
  AND sl.enrollment_id IS NOT NULL;  -- Exclude sessions without enrollment link

SELECT 'Created session_costs view.' as result;

-- =====================================================
-- VIEW: Tutor Monthly Revenue (Main Summary)
-- =====================================================
CREATE OR REPLACE VIEW tutor_monthly_revenue AS
SELECT
    t.id as tutor_id,
    t.tutor_name,
    sc.session_year,
    sc.session_month,
    sc.session_period,

    -- Session counts
    COUNT(sc.session_id) as sessions_count,

    -- Revenue calculation
    SUM(sc.cost_per_session) as total_revenue,
    AVG(sc.cost_per_session) as avg_revenue_per_session,
    MIN(sc.cost_per_session) as min_revenue_per_session,
    MAX(sc.cost_per_session) as max_revenue_per_session

FROM tutors t
INNER JOIN session_costs sc ON t.id = sc.tutor_id
GROUP BY t.id, t.tutor_name, sc.session_year, sc.session_month, sc.session_period
ORDER BY sc.session_year DESC, sc.session_month DESC, t.tutor_name;

SELECT 'Created tutor_monthly_revenue view.' as result;

-- =====================================================
-- VIEW: Tutor Monthly Revenue Details (with breakdown)
-- =====================================================
CREATE OR REPLACE VIEW tutor_monthly_revenue_details AS
SELECT
    sc.session_id,
    sc.student_id,
    sc.tutor_id,
    sc.tutor_name,
    sc.session_period,
    sc.session_date,
    sc.time_slot,
    sc.student_name_formatted as student_name,
    sc.session_status,
    sc.cost_per_session,
    sc.enrollment_id
FROM session_costs sc
ORDER BY sc.tutor_id, sc.session_date DESC;

SELECT 'Created tutor_monthly_revenue_details view.' as result;

-- =====================================================
-- EXAMPLE QUERIES
-- =====================================================

-- Get September 2025 revenue for all tutors
-- SELECT * FROM tutor_monthly_revenue
-- WHERE session_year = 2025 AND session_month = 9
-- ORDER BY total_revenue DESC;

-- Get specific tutor's revenue for September 2025
-- SELECT * FROM tutor_monthly_revenue
-- WHERE tutor_name = 'Teacher Name'
--   AND session_year = 2025
--   AND session_month = 9;

-- Get detailed session breakdown for a tutor in a month
-- SELECT * FROM tutor_monthly_revenue_details
-- WHERE tutor_name = 'Teacher Name'
--   AND session_period = '2025-09'
-- ORDER BY session_date;

-- Compare all tutors for a specific month
-- SELECT
--     tutor_name,
--     sessions_count,
--     total_revenue,
--     ROUND(avg_revenue_per_session, 2) as avg_per_session
-- FROM tutor_monthly_revenue
-- WHERE session_period = '2025-09'
-- ORDER BY total_revenue DESC;

SELECT 'Migration 030 completed.' as final_status;
SELECT 'Use tutor_monthly_revenue view for salary calculations.' as reminder;

-- =====================================================
-- END Migration 030
-- =====================================================
