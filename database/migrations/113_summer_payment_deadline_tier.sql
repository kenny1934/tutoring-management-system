-- Summer payment deadline + locked discount tier on enrollments.
--
-- Context: Summer Early Bird discounts have a `before_date` (e.g. 2025-06-15).
-- Until now, whether a tier applied was decided purely by submission /
-- buddy-join timestamps. If a parent submitted by the deadline but never paid,
-- the overdue page still surfaced them only by first_lesson_date (July) and
-- the system let them keep the EB discount for free.
--
-- These columns snapshot the tier the applicant locked in at publish time,
-- and let the overdue page + nightly sweep downgrade applicants who missed
-- the payment window. The override columns let admins restore the higher
-- tier for late-recorded-but-actually-on-time payments.

ALTER TABLE enrollments
  ADD COLUMN payment_deadline DATE NULL
    COMMENT 'Summer: discount before_date or first_lesson_date, whichever is earlier',
  ADD COLUMN locked_discount_code VARCHAR(32) NULL
    COMMENT 'Summer: discount code currently in effect (EB / EB3P / 3P / NONE)',
  ADD COLUMN locked_discount_amount INT NULL
    COMMENT 'Summer: discount amount currently in effect (HKD)',
  ADD COLUMN discount_override_code VARCHAR(32) NULL
    COMMENT 'Admin override: if set, bypasses computed tier',
  ADD COLUMN discount_override_reason TEXT NULL
    COMMENT 'Admin override: free-text justification (required when code is set)',
  ADD COLUMN discount_override_by VARCHAR(255) NULL
    COMMENT 'Admin override: email of admin who set the override',
  ADD COLUMN discount_override_at DATETIME NULL
    COMMENT 'Admin override: timestamp when override was set';

CREATE INDEX idx_enrollments_payment_deadline
  ON enrollments (payment_status, payment_deadline);

-- Applications need a payment date so we can tell whether an applicant paid
-- by the discount deadline, and so the published enrollment can inherit the
-- actual payment date instead of "today at publish time".
ALTER TABLE summer_applications
  ADD COLUMN paid_at DATETIME NULL
    COMMENT 'Timestamp when admin marked the application as Paid';
