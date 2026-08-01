-- 二龍喉分校 now opens seven days a week for the 2026 September intake.
--
-- Its open_days and time slots were already opened up to include Tuesday and
-- Wednesday, but the caption underneath still read 星期二、三休息 / "Closed on
-- Tue & Wed". The apply form was therefore offering Tuesday and Wednesday
-- slots at a branch it described as shut on those days.
--
-- Guarded on the branch actually holding all seven days, so this cannot put a
-- seven-day caption on a branch that has since closed one, and re-running it
-- changes nothing. Wording is the one 華士古 already carries rather than a new
-- phrasing.

UPDATE regular_course_configs
SET locations = JSON_SET(
    locations,
    '$[1].open_days_label', '一星期開七日',
    '$[1].open_days_label_en', 'Open 7 days a week'
)
WHERE JSON_LENGTH(locations, '$[1].open_days') = 7;
