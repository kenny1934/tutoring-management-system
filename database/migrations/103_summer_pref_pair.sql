-- Add backup-pair preference columns for the summer apply form.
--
-- Semantics derived from sessions_per_week:
--   1x/week: pref1 = primary slot, pref2 = optional backup slot.
--            pref3/pref4 unused.
--   2x/week: pref1 + pref2 = primary weekly pair (both required, different days).
--            pref3 + pref4 = optional backup pair (if either set, both required,
--                            different days).
--
-- Columns are kept generically named to minimise churn — semantics live in the
-- application layer.

ALTER TABLE summer_applications
  ADD COLUMN preference_3_day  VARCHAR(20) NULL AFTER preference_2_time,
  ADD COLUMN preference_3_time VARCHAR(50) NULL AFTER preference_3_day,
  ADD COLUMN preference_4_day  VARCHAR(20) NULL AFTER preference_3_time,
  ADD COLUMN preference_4_time VARCHAR(50) NULL AFTER preference_4_day
