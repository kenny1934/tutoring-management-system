-- Revert summer apply form intro back to a single sentence. Earlier this
-- migration appended a "all fields required unless marked optional" note,
-- but the form ended up not marking any field with 「可選」 (the natural
-- language of each question conveys optionality), so the second line was
-- promising something the form never delivered.
--
-- Idempotent: re-running just resets text_content.intro_{zh,en} to the
-- canonical single-sentence form.

UPDATE summer_course_configs
SET text_content = JSON_SET(
  text_content,
  '$.intro_zh', '此表格僅為收集上課時間意向，並非正式報名。導師會於稍後聯絡家長確認留位。',
  '$.intro_en', 'This form only collects your preferred class time. It is not a formal registration. Our team will contact you to confirm enrolment.'
)
WHERE year = 2026 AND is_active = 1
