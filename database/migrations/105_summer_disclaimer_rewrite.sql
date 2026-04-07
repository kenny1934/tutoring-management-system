-- Rewrite the Step 5 review-page disclaimer. The original was wordy,
-- buried the most actionable fact (the 21 May confirmation date) in a
-- parenthetical, duplicated the Step 1 intro, and apologised for
-- something that hadn't happened yet. New version leads with the date
-- and explains the constraint without the apologetic tone.
--
-- Lives in summer_course_configs.text_content (JSON). Idempotent.

UPDATE summer_course_configs
SET text_content = JSON_SET(
  text_content,
  '$.disclaimer_zh', '我們會在5月21日或之前聯絡您確認上課時間，實際時段會根據整體報名情況安排及調整。',
  '$.disclaimer_en', 'We will contact you on or before 21 May to confirm class times. Actual schedules will be arranged and adjusted based on overall demand.'
)
WHERE year = 2026 AND is_active = 1
