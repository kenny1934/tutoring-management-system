-- Store each regular-course branch's open_days in Sunday-first week order.
--
-- open_days is a plain JSON array and the forms render it in stored order, so
-- 華士古's seeded order (Monday..Friday then the weekend) made the apply form's
-- time picker, the status page and the admin arrangement page all start the
-- week on Monday, while the branch card's open-days strip above them starts on
-- Sunday. The summer form only looks right because its seed happened to list
-- the days Sunday-first.
--
-- Rebuilds the array by filtering the canonical week order against the days a
-- branch already has, so membership is preserved and only the order changes.
-- A branch already in order is rewritten to itself, making this a no-op on
-- re-run and on any config an admin has since edited (the config editor
-- normalises order when a day is toggled on).

UPDATE regular_course_configs
SET locations = JSON_SET(
    locations,
    '$[0].open_days',
    JSON_MERGE_PRESERVE(
        JSON_ARRAY(),
        IF(JSON_CONTAINS(locations, '"Sunday"',    '$[0].open_days'), JSON_ARRAY('Sunday'),    JSON_ARRAY()),
        IF(JSON_CONTAINS(locations, '"Monday"',    '$[0].open_days'), JSON_ARRAY('Monday'),    JSON_ARRAY()),
        IF(JSON_CONTAINS(locations, '"Tuesday"',   '$[0].open_days'), JSON_ARRAY('Tuesday'),   JSON_ARRAY()),
        IF(JSON_CONTAINS(locations, '"Wednesday"', '$[0].open_days'), JSON_ARRAY('Wednesday'), JSON_ARRAY()),
        IF(JSON_CONTAINS(locations, '"Thursday"',  '$[0].open_days'), JSON_ARRAY('Thursday'),  JSON_ARRAY()),
        IF(JSON_CONTAINS(locations, '"Friday"',    '$[0].open_days'), JSON_ARRAY('Friday'),    JSON_ARRAY()),
        IF(JSON_CONTAINS(locations, '"Saturday"',  '$[0].open_days'), JSON_ARRAY('Saturday'),  JSON_ARRAY())
    )
)
WHERE JSON_LENGTH(locations) > 0;

UPDATE regular_course_configs
SET locations = JSON_SET(
    locations,
    '$[1].open_days',
    JSON_MERGE_PRESERVE(
        JSON_ARRAY(),
        IF(JSON_CONTAINS(locations, '"Sunday"',    '$[1].open_days'), JSON_ARRAY('Sunday'),    JSON_ARRAY()),
        IF(JSON_CONTAINS(locations, '"Monday"',    '$[1].open_days'), JSON_ARRAY('Monday'),    JSON_ARRAY()),
        IF(JSON_CONTAINS(locations, '"Tuesday"',   '$[1].open_days'), JSON_ARRAY('Tuesday'),   JSON_ARRAY()),
        IF(JSON_CONTAINS(locations, '"Wednesday"', '$[1].open_days'), JSON_ARRAY('Wednesday'), JSON_ARRAY()),
        IF(JSON_CONTAINS(locations, '"Thursday"',  '$[1].open_days'), JSON_ARRAY('Thursday'),  JSON_ARRAY()),
        IF(JSON_CONTAINS(locations, '"Friday"',    '$[1].open_days'), JSON_ARRAY('Friday'),    JSON_ARRAY()),
        IF(JSON_CONTAINS(locations, '"Saturday"',  '$[1].open_days'), JSON_ARRAY('Saturday'),  JSON_ARRAY())
    )
)
WHERE JSON_LENGTH(locations) > 1;
