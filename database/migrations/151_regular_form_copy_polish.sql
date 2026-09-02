-- Natural-English pass on the parent-facing regular application form copy.
--
-- The original English strings were word-for-word translations of the Chinese
-- and read stiff ("intended solely for collecting", "To keep class
-- arrangements complete"). The final-step disclaimer also repeated the step-1
-- intro almost verbatim, so its first sentence is dropped rather than reworded.
--
-- disclaimer_zh changes punctuation only. The form joins it after a generated
-- "we will contact you by <date>" sentence that now ends in a full stop, so
-- the note's own first break becomes a comma to read as one flowing sentence.
--
-- The seed (database/seed_regular_2026.py) and the code fallback for the
-- make-up note are updated in the same commit. Keep the three in sync.

UPDATE regular_course_configs
SET text_content = JSON_SET(
    COALESCE(text_content, JSON_OBJECT()),
    '$.intro_en',
    'This form collects your preferred class times. The final timetable will be based on the times that suit most students.',
    '$.disclaimer_en',
    'The final schedule will be based on the times that suit most students. We apologise if your preferred time slot cannot be offered.',
    '$.disclaimer_zh',
    '此表單僅用於收集學生的理想上課時間，正式開班時間將根據多數學生的選擇而定。如我們未能配合您所選擇之時段，敬希見諒。',
    '$.makeup_note_en',
    'If the student cannot attend a lesson during the paid lesson block, please notify the tutor in advance so a make-up lesson can be arranged as early as possible.'
)
WHERE year = 2026;
