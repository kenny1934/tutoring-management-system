-- Make the Step 5 review-page disclaimer date-aware.
--
-- Migration 105 baked the confirm-by date ("5月21日" / "21 May") into the
-- disclaimer prose. Once that date passes, parents read the stale future-tense
-- promise as confirmation their application is already settled.
--
-- This splits the disclaimer: the editable text now holds only the evergreen
-- scheduling note, and the date moves to a structured `contact_by_date` key.
-- The frontend (ReviewSubmitStep) prepends "we'll contact you on or before
-- <date>" while the date is upcoming, and "we'll contact you shortly" once it
-- has passed or is unset.
--
-- Update contact_by_date each season. A past date is fine (shows the date-less
-- variant). Lives in summer_course_configs.text_content (JSON). Idempotent.

UPDATE summer_course_configs
SET text_content = JSON_SET(
  text_content,
  '$.disclaimer_zh', '實際時段會根據整體報名情況安排及調整。',
  '$.disclaimer_en', 'Actual schedules will be arranged and adjusted based on overall demand.',
  '$.contact_by_date', '2026-05-21'
)
WHERE year = 2026 AND is_active = 1
