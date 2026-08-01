-- 135: Drop the leading emoji from the regular application make-up confirmation copy.
-- The checkbox text is stored in regular_course_configs.text_content, so the seed
-- change alone does not reach configs that are already live.

UPDATE regular_course_configs
SET text_content = JSON_SET(
  text_content,
  '$.makeup_note_zh',
  TRIM(REPLACE(JSON_UNQUOTE(JSON_EXTRACT(text_content, '$.makeup_note_zh')), '📅', ''))
)
WHERE JSON_EXTRACT(text_content, '$.makeup_note_zh') IS NOT NULL;

UPDATE regular_course_configs
SET text_content = JSON_SET(
  text_content,
  '$.makeup_note_en',
  TRIM(REPLACE(JSON_UNQUOTE(JSON_EXTRACT(text_content, '$.makeup_note_en')), '📅', ''))
)
WHERE JSON_EXTRACT(text_content, '$.makeup_note_en') IS NOT NULL;
