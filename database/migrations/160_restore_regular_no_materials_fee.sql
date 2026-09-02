-- Put the September 2026 intake's "no materials fee" rule back.
--
-- Migration 144 set registration_fee_charged to false on this config, and it
-- was gone again by the time anyone looked. The admin config editor rebuilt
-- pricing_config out of the four fields it had a form for (base fee, lessons
-- per block, materials fee, and the seasonal offer it deliberately kept), so
-- the flag was deleted the next time someone saved the config on 5 August.
--
-- With the flag missing, the default takes over and the fee is charged, which
-- is how a Back to School applicant was quoted $2,200: $2,400 of tuition, less
-- the $300 discount row, plus a $100 materials fee the offer had already told
-- the parent was waived. The offer is worth $400 off a $2,500 list price, so
-- the number a parent should see is $2,100.
--
-- The editor no longer drops pricing keys it has no field for, and it now has
-- a tick box for this one, so restoring the flag here is the whole fix.
--
-- JSON_SET overwrites or inserts, so re-running this changes nothing.

UPDATE regular_course_configs
SET pricing_config = JSON_SET(
    COALESCE(pricing_config, JSON_OBJECT()),
    '$.registration_fee_charged',
    CAST('false' AS JSON)
)
WHERE year = 2026;
