-- Shorten 華士古分校's English name to "Vasco Center" on the regular form.
--
-- name_en is display-only on every surface that reads it — the branch radio,
-- the review step and the status page all store and match on the Chinese
-- `name` — so this is a copy change, not a key change, and submitted
-- applications are unaffected.
--
-- Both columns are updated so the form does not show the branch under two
-- English names: `locations` drives the branch picker, and `center_options`
-- drives the "which centre do you attend now?" chips.
--
-- Paths come from JSON_SEARCH rather than a hardcoded index, so neither
-- statement depends on the order the entries were seeded in. The WHERE guard
-- makes both no-ops once applied.

UPDATE regular_course_configs
SET locations = JSON_SET(
    locations,
    JSON_UNQUOTE(JSON_SEARCH(locations, 'one', 'Jardim de Vasco Center')),
    'Vasco Center'
)
WHERE JSON_SEARCH(locations, 'one', 'Jardim de Vasco Center') IS NOT NULL;

UPDATE regular_course_configs
SET center_options = JSON_SET(
    center_options,
    JSON_UNQUOTE(JSON_SEARCH(center_options, 'one', 'MathConcept Secondary Academy (Jardim de Vasco Center)')),
    'MathConcept Secondary Academy (Vasco Center)'
)
WHERE JSON_SEARCH(center_options, 'one', 'MathConcept Secondary Academy (Jardim de Vasco Center)') IS NOT NULL;
