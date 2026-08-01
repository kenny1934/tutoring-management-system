-- Strip the editor-local _id key from every stored config list.
--
-- The config editors stamp each list item with an _id so drag-to-reorder has a
-- stable React key, then sent the state straight to the API, so the key was
-- being saved into the config JSON. It is regenerated on every load, so a
-- stored one is meaningless -- it just made every config carry a field nothing
-- reads. stripIds now undoes the stamping at the payload boundary, and this
-- clears what the leak already wrote.
--
-- Paths are listed to 24 per list, comfortably above the longest one in use
-- (center_options, at 9). JSON_REMOVE ignores paths that are not present, and
-- removing an object key does not shift array indices, so the fixed paths stay
-- valid as they are applied left to right.

UPDATE regular_course_configs
SET locations = JSON_REMOVE(
    locations,
    '$[0]._id', '$[1]._id', '$[2]._id', '$[3]._id',
    '$[4]._id', '$[5]._id', '$[6]._id', '$[7]._id',
    '$[8]._id', '$[9]._id', '$[10]._id', '$[11]._id',
    '$[12]._id', '$[13]._id', '$[14]._id', '$[15]._id',
    '$[16]._id', '$[17]._id', '$[18]._id', '$[19]._id',
    '$[20]._id', '$[21]._id', '$[22]._id', '$[23]._id'
)
WHERE locations IS NOT NULL;

UPDATE regular_course_configs
SET available_grades = JSON_REMOVE(
    available_grades,
    '$[0]._id', '$[1]._id', '$[2]._id', '$[3]._id',
    '$[4]._id', '$[5]._id', '$[6]._id', '$[7]._id',
    '$[8]._id', '$[9]._id', '$[10]._id', '$[11]._id',
    '$[12]._id', '$[13]._id', '$[14]._id', '$[15]._id',
    '$[16]._id', '$[17]._id', '$[18]._id', '$[19]._id',
    '$[20]._id', '$[21]._id', '$[22]._id', '$[23]._id'
)
WHERE available_grades IS NOT NULL;

UPDATE regular_course_configs
SET existing_student_options = JSON_REMOVE(
    existing_student_options,
    '$[0]._id', '$[1]._id', '$[2]._id', '$[3]._id',
    '$[4]._id', '$[5]._id', '$[6]._id', '$[7]._id',
    '$[8]._id', '$[9]._id', '$[10]._id', '$[11]._id',
    '$[12]._id', '$[13]._id', '$[14]._id', '$[15]._id',
    '$[16]._id', '$[17]._id', '$[18]._id', '$[19]._id',
    '$[20]._id', '$[21]._id', '$[22]._id', '$[23]._id'
)
WHERE existing_student_options IS NOT NULL;

UPDATE regular_course_configs
SET center_options = JSON_REMOVE(
    center_options,
    '$[0]._id', '$[1]._id', '$[2]._id', '$[3]._id',
    '$[4]._id', '$[5]._id', '$[6]._id', '$[7]._id',
    '$[8]._id', '$[9]._id', '$[10]._id', '$[11]._id',
    '$[12]._id', '$[13]._id', '$[14]._id', '$[15]._id',
    '$[16]._id', '$[17]._id', '$[18]._id', '$[19]._id',
    '$[20]._id', '$[21]._id', '$[22]._id', '$[23]._id'
)
WHERE center_options IS NOT NULL;

UPDATE regular_course_configs
SET lang_stream_options = JSON_REMOVE(
    lang_stream_options,
    '$[0]._id', '$[1]._id', '$[2]._id', '$[3]._id',
    '$[4]._id', '$[5]._id', '$[6]._id', '$[7]._id',
    '$[8]._id', '$[9]._id', '$[10]._id', '$[11]._id',
    '$[12]._id', '$[13]._id', '$[14]._id', '$[15]._id',
    '$[16]._id', '$[17]._id', '$[18]._id', '$[19]._id',
    '$[20]._id', '$[21]._id', '$[22]._id', '$[23]._id'
)
WHERE lang_stream_options IS NOT NULL;

UPDATE regular_course_configs
SET pricing_config = JSON_REMOVE(
    pricing_config,
    '$.discounts[0]._id', '$.discounts[1]._id', '$.discounts[2]._id', '$.discounts[3]._id',
    '$.discounts[4]._id', '$.discounts[5]._id', '$.discounts[6]._id', '$.discounts[7]._id',
    '$.discounts[8]._id', '$.discounts[9]._id', '$.discounts[10]._id', '$.discounts[11]._id',
    '$.discounts[12]._id', '$.discounts[13]._id', '$.discounts[14]._id', '$.discounts[15]._id',
    '$.discounts[16]._id', '$.discounts[17]._id', '$.discounts[18]._id', '$.discounts[19]._id',
    '$.discounts[20]._id', '$.discounts[21]._id', '$.discounts[22]._id', '$.discounts[23]._id'
)
WHERE JSON_LENGTH(pricing_config, '$.discounts') > 0;

UPDATE summer_course_configs
SET locations = JSON_REMOVE(
    locations,
    '$[0]._id', '$[1]._id', '$[2]._id', '$[3]._id',
    '$[4]._id', '$[5]._id', '$[6]._id', '$[7]._id',
    '$[8]._id', '$[9]._id', '$[10]._id', '$[11]._id',
    '$[12]._id', '$[13]._id', '$[14]._id', '$[15]._id',
    '$[16]._id', '$[17]._id', '$[18]._id', '$[19]._id',
    '$[20]._id', '$[21]._id', '$[22]._id', '$[23]._id'
)
WHERE locations IS NOT NULL;

UPDATE summer_course_configs
SET available_grades = JSON_REMOVE(
    available_grades,
    '$[0]._id', '$[1]._id', '$[2]._id', '$[3]._id',
    '$[4]._id', '$[5]._id', '$[6]._id', '$[7]._id',
    '$[8]._id', '$[9]._id', '$[10]._id', '$[11]._id',
    '$[12]._id', '$[13]._id', '$[14]._id', '$[15]._id',
    '$[16]._id', '$[17]._id', '$[18]._id', '$[19]._id',
    '$[20]._id', '$[21]._id', '$[22]._id', '$[23]._id'
)
WHERE available_grades IS NOT NULL;

UPDATE summer_course_configs
SET existing_student_options = JSON_REMOVE(
    existing_student_options,
    '$[0]._id', '$[1]._id', '$[2]._id', '$[3]._id',
    '$[4]._id', '$[5]._id', '$[6]._id', '$[7]._id',
    '$[8]._id', '$[9]._id', '$[10]._id', '$[11]._id',
    '$[12]._id', '$[13]._id', '$[14]._id', '$[15]._id',
    '$[16]._id', '$[17]._id', '$[18]._id', '$[19]._id',
    '$[20]._id', '$[21]._id', '$[22]._id', '$[23]._id'
)
WHERE existing_student_options IS NOT NULL;

UPDATE summer_course_configs
SET center_options = JSON_REMOVE(
    center_options,
    '$[0]._id', '$[1]._id', '$[2]._id', '$[3]._id',
    '$[4]._id', '$[5]._id', '$[6]._id', '$[7]._id',
    '$[8]._id', '$[9]._id', '$[10]._id', '$[11]._id',
    '$[12]._id', '$[13]._id', '$[14]._id', '$[15]._id',
    '$[16]._id', '$[17]._id', '$[18]._id', '$[19]._id',
    '$[20]._id', '$[21]._id', '$[22]._id', '$[23]._id'
)
WHERE center_options IS NOT NULL;

UPDATE summer_course_configs
SET lang_stream_options = JSON_REMOVE(
    lang_stream_options,
    '$[0]._id', '$[1]._id', '$[2]._id', '$[3]._id',
    '$[4]._id', '$[5]._id', '$[6]._id', '$[7]._id',
    '$[8]._id', '$[9]._id', '$[10]._id', '$[11]._id',
    '$[12]._id', '$[13]._id', '$[14]._id', '$[15]._id',
    '$[16]._id', '$[17]._id', '$[18]._id', '$[19]._id',
    '$[20]._id', '$[21]._id', '$[22]._id', '$[23]._id'
)
WHERE lang_stream_options IS NOT NULL;

UPDATE summer_course_configs
SET pricing_config = JSON_REMOVE(
    pricing_config,
    '$.discounts[0]._id', '$.discounts[1]._id', '$.discounts[2]._id', '$.discounts[3]._id',
    '$.discounts[4]._id', '$.discounts[5]._id', '$.discounts[6]._id', '$.discounts[7]._id',
    '$.discounts[8]._id', '$.discounts[9]._id', '$.discounts[10]._id', '$.discounts[11]._id',
    '$.discounts[12]._id', '$.discounts[13]._id', '$.discounts[14]._id', '$.discounts[15]._id',
    '$.discounts[16]._id', '$.discounts[17]._id', '$.discounts[18]._id', '$.discounts[19]._id',
    '$.discounts[20]._id', '$.discounts[21]._id', '$.discounts[22]._id', '$.discounts[23]._id'
)
WHERE JSON_LENGTH(pricing_config, '$.discounts') > 0;
