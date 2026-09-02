-- Migration 166: Mark enrollment 154726205 as Waived. The admin created it as
-- a normal One-Time enrollment, but the class is a free goodwill make-up, so
-- nothing is owed and none of it is tutor revenue. Waived enrollments are
-- excluded from the revenue views (which only include Paid and Pending
-- Payment) and the zeroed revenue_total keeps the stored snapshot truthful.
-- The matching application-side feature (Waived as a first-class payment
-- status) ships in the same commit as this file.

UPDATE enrollments
SET payment_status = 'Waived',
    revenue_total = 0.00,
    remark = 'Free make-up class. No fee due.',
    last_modified_by = 'kenny.chiu@mathconceptsecondary.academy',
    last_modified_time = CONVERT_TZ(NOW(), '+00:00', '+08:00')
WHERE id = 154726205;

UPDATE session_log
SET financial_status = 'Waived'
WHERE enrollment_id = 154726205;
