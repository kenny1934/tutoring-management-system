-- 136: Align the regular application status ladder with the summer one.
-- Adds Placement Offered / Fee Sent / Paid, and renames Schedule Confirmed to
-- Placement Confirmed so admins work both intakes from one vocabulary.
-- Runs in three steps because MySQL rejects an UPDATE to a value the ENUM does
-- not yet allow: widen to a superset, move the data, then narrow.

ALTER TABLE regular_applications
    MODIFY COLUMN application_status ENUM(
        'Submitted', 'Under Review', 'Schedule Confirmed', 'Placement Offered',
        'Placement Confirmed', 'Fee Sent', 'Paid', 'Enrolled',
        'Waitlisted', 'Withdrawn', 'Rejected'
    ) NOT NULL DEFAULT 'Submitted';

UPDATE regular_applications
SET application_status = 'Placement Confirmed'
WHERE application_status = 'Schedule Confirmed';

-- The audit trail stores raw status strings, so old rows would otherwise still
-- read "Schedule Confirmed" in the history panel.
UPDATE regular_application_edits
SET old_value = 'Placement Confirmed'
WHERE field_name = 'application_status' AND old_value = 'Schedule Confirmed';

UPDATE regular_application_edits
SET new_value = 'Placement Confirmed'
WHERE field_name = 'application_status' AND new_value = 'Schedule Confirmed';

ALTER TABLE regular_applications
    MODIFY COLUMN application_status ENUM(
        'Submitted', 'Under Review', 'Placement Offered', 'Placement Confirmed',
        'Fee Sent', 'Paid', 'Enrolled',
        'Waitlisted', 'Withdrawn', 'Rejected'
    ) NOT NULL DEFAULT 'Submitted';
