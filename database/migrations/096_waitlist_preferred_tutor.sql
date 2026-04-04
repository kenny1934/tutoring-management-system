-- Add optional preferred tutor to waitlist slot preferences
ALTER TABLE waitlist_slot_preferences
  ADD COLUMN preferred_tutor_id INT NULL AFTER time_slot,
  ADD CONSTRAINT fk_waitlist_pref_tutor FOREIGN KEY (preferred_tutor_id) REFERENCES tutors(id) ON DELETE SET NULL;

CREATE INDEX idx_waitlist_pref_tutor ON waitlist_slot_preferences(preferred_tutor_id);
