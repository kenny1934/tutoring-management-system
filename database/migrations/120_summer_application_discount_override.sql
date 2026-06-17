-- Pre-publish discount tier override on summer applications.
--
-- Context: the admin tier override (restoring e.g. EB3P that the auto-tier
-- forfeited) previously lived only on the published enrollment. But the fee
-- message is generated and sent *before* publish, so a tier that needs
-- correcting (a buddy withdrew and was replaced past the deadline, etc.) could
-- only be fixed after the parent had already been quoted the wrong amount.
--
-- These columns let an admin pin the tier on the application itself, in the
-- application detail modal. At publish time the value is carried forward onto
-- the enrollment (which remains the source of truth post-publish, where the
-- nightly sweep + overdue page operate). Mirrors the enrollments override
-- columns added in 113.

ALTER TABLE summer_applications
  ADD COLUMN discount_override_code VARCHAR(32) NULL
    COMMENT 'Admin pre-publish override: if set, bypasses computed tier',
  ADD COLUMN discount_override_reason TEXT NULL
    COMMENT 'Admin override: free-text justification (required when code is set)',
  ADD COLUMN discount_override_by VARCHAR(255) NULL
    COMMENT 'Admin override: email of admin who set the override',
  ADD COLUMN discount_override_at DATETIME NULL
    COMMENT 'Admin override: timestamp when override was set';
