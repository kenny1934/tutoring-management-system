-- Rename 華士古分校 in English from "Jardim de Vasco Center" to "Vasco Center"
-- on the summer form, the same change migration 147 made on the regular form.
-- "Jardim de Vasco" was never the branch's name, so parents reading the
-- English summer pages were being shown a wrong one.
--
-- name_en is display-only, because the summer form stores and matches on the
-- Chinese `name`, so submitted applications are unaffected.
--
-- Both columns are updated so the form does not show the branch under two
-- English names: `locations` drives the branch picker, and `center_options`
-- drives the "which centre do you attend now?" chips.
--
-- Each UPDATE covers every summer config row. Inside a row, JSON_SEARCH finds
-- the path to the entry, so the statement doesn't depend on the order the
-- branches were seeded in. The WHERE guard makes both statements no-ops once
-- applied.

UPDATE summer_course_configs
SET locations = JSON_SET(
    locations,
    JSON_UNQUOTE(JSON_SEARCH(locations, 'one', 'Jardim de Vasco Center')),
    'Vasco Center'
)
WHERE JSON_SEARCH(locations, 'one', 'Jardim de Vasco Center') IS NOT NULL;

UPDATE summer_course_configs
SET center_options = JSON_SET(
    center_options,
    JSON_UNQUOTE(JSON_SEARCH(center_options, 'one', 'MathConcept Secondary Academy (Jardim de Vasco Center)')),
    'MathConcept Secondary Academy (Vasco Center)'
)
WHERE JSON_SEARCH(center_options, 'one', 'MathConcept Secondary Academy (Jardim de Vasco Center)') IS NOT NULL;
