-- Update text_content.target_grades_{zh,en} to unambiguous forms that
-- repeat the "rising to" prefix on both endpoints. Without the second 升
-- (or "Pre-"), parents can misread the range as "from incoming F1 up to
-- current F3" — which would wrongly include students heading into F4.
UPDATE summer_course_configs
SET text_content = JSON_SET(
  text_content,
  '$.target_grades_zh', '升中一至升中三',
  '$.target_grades_en', 'Pre-F1 to Pre-F3'
)
WHERE year = 2026 AND is_active = 1
