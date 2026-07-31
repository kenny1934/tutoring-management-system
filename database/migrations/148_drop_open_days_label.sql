-- Drop the open_days_label / open_days_label_en keys from every course config.
--
-- Nothing ever rendered them. They were editable in the summer config editor
-- and written by both seeds, but no form, status page or admin view read them
-- back, so they could drift from open_days without anyone noticing — 二龍喉
-- sat on "closed Tue & Wed" long after it opened those days. Removing the
-- field is what migration 146 should have done. Correcting the text there only
-- made invisible data agree with itself.
--
-- Every config holds two locations. JSON_REMOVE ignores paths that are not
-- present, so listing a few spare indices costs nothing and keeps this correct
-- if a third branch is ever added before it runs. Removing object keys does
-- not shift array indices, so the paths stay valid as they are applied.

UPDATE regular_course_configs
SET locations = JSON_REMOVE(
    locations,
    '$[0].open_days_label', '$[0].open_days_label_en',
    '$[1].open_days_label', '$[1].open_days_label_en',
    '$[2].open_days_label', '$[2].open_days_label_en',
    '$[3].open_days_label', '$[3].open_days_label_en'
);

UPDATE summer_course_configs
SET locations = JSON_REMOVE(
    locations,
    '$[0].open_days_label', '$[0].open_days_label_en',
    '$[1].open_days_label', '$[1].open_days_label_en',
    '$[2].open_days_label', '$[2].open_days_label_en',
    '$[3].open_days_label', '$[3].open_days_label_en'
);

-- The column comment documented the field, so it would now describe a shape
-- the data no longer has.
ALTER TABLE regular_course_configs
MODIFY COLUMN locations JSON NOT NULL
COMMENT '[{name, name_en, address, address_en, open_days, time_slots: {day: [slots]}}]';
