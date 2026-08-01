-- Regular course: align language-stream values with the summer intake.
--
-- The regular config was seeded from the summer seed FILE, which still carries
-- the retired CMI / EMI / IS codes. The live summer config uses C / E / Int,
-- and the grade badge colours are keyed on grade + stream (F1C, F2E, ...), so
-- a regular application rendered "F3" with a separate grey "CMI" chip while
-- the same student on a summer page rendered one coloured "F3C" badge.
--
-- Rewrites the stored options on every regular config and converts the values
-- already recorded on applications and their audit trail.

UPDATE regular_course_configs
SET lang_stream_options = JSON_ARRAY(
    JSON_OBJECT('name', '中文部', 'name_en', 'Chinese Section', 'value', 'C'),
    JSON_OBJECT('name', '英文部', 'name_en', 'English Section', 'value', 'E'),
    JSON_OBJECT('name', '國際學校', 'name_en', 'International', 'value', 'Int')
)
WHERE lang_stream_options IS NOT NULL;

UPDATE regular_applications
SET lang_stream = CASE lang_stream
    WHEN 'CMI' THEN 'C'
    WHEN 'EMI' THEN 'E'
    WHEN 'IS' THEN 'Int'
    ELSE lang_stream
END
WHERE lang_stream IN ('CMI', 'EMI', 'IS');

UPDATE regular_application_edits
SET old_value = CASE old_value
    WHEN 'CMI' THEN 'C'
    WHEN 'EMI' THEN 'E'
    WHEN 'IS' THEN 'Int'
    ELSE old_value
END
WHERE field_name = 'lang_stream' AND old_value IN ('CMI', 'EMI', 'IS');

UPDATE regular_application_edits
SET new_value = CASE new_value
    WHEN 'CMI' THEN 'C'
    WHEN 'EMI' THEN 'E'
    WHEN 'IS' THEN 'Int'
    ELSE new_value
END
WHERE field_name = 'lang_stream' AND new_value IN ('CMI', 'EMI', 'IS');
