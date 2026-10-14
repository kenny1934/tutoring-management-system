-- Remove seven confirmed coupon discounts copied by batch renewal on 8 October.
-- The affected students had no coupons before their renewals were created.
-- Use only the verified enrolment IDs and expected state, so later changes
-- and an already-corrected enrolment are left alone. Re-running is a no-op.
-- Recompute the tuition revenue snapshot along with the discount.
-- Payment status, payment dates, sessions and coupon inventory stay unchanged.
-- Keep personal names and the investigation evidence in private local records.

UPDATE enrollments AS e
JOIN student_coupons AS sc ON sc.student_id = e.student_id
SET e.discount_id = NULL,
    e.revenue_total = 400 * e.lessons_paid,
    e.last_modified_time = CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00'),
    e.last_modified_by = 'migration:186_coupon_discount_correction'
WHERE e.id IN (
    154727044, 154727084, 154727168, 154727171,
    154727173, 154727214, 154727220
)
  AND e.discount_id = 1
  AND e.enrollment_type = 'Regular'
  AND e.lessons_paid = 6
  AND e.revenue_total = 2100
  AND e.payment_status IN ('Pending Payment', 'Paid')
  AND sc.available_coupons = 0
  AND sc.last_synced_at < '2026-10-08 00:00:00';
