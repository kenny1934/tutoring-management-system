-- =====================================================
-- Migration 122: Per-session revenue from the real fee (all enrollment types)
-- =====================================================
-- Problem: the migration-030 revenue views computed per-session worth with a
-- hardcoded SQL formula —
--     ((400 * lessons_paid) - COALESCE(discounts.discount_value, 0)) / lessons_paid
-- which is wrong for:
--   * Summer (discount lives on the locked tier / override, discount_id is NULL,
--     and the base is not a flat 400 — the view priced every summer session at 400)
--   * Regular per-2-lessons promos (the value scales with lesson count, not flat)
--   * Regular flat discounts below the 6-lesson minimum (the floor zeroes them)
--
-- Fix: store the correct tutor-facing revenue total on the enrollment, computed
-- in Python (resolve_enrollment_total_fee, which matches the fee message for
-- every type) MINUS the registration fee (not tutor revenue). The views divide
-- it by lessons_paid. A NULL revenue_total falls back to the old formula so the
-- numbers never regress before the backfill runs (see
-- database/backfill_enrollment_revenue.py).

ALTER TABLE enrollments
    ADD COLUMN revenue_total DECIMAL(10,2) NULL
    COMMENT 'Tutor revenue total = real fee minus reg fee. Views divide by lessons_paid. Computed in Python.';

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
WHERE e.payment_status IN ('Paid', 'Pending Payment');

-- session_costs / tutor_monthly_revenue / tutor_monthly_revenue_details read
-- enrollment_costs.cost_per_session unchanged, so they need no edit here.

-- =====================================================
-- END Migration 122
-- =====================================================
