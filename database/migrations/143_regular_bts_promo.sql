-- 2026 中學教室 Back to School 新生優惠 (code 26BTSSA).
--
-- The offer is worth MOP 400 to a new student: $300 off September tuition,
-- the $100 materials fee waived, plus a desk calendar that costs the parent
-- nothing and so never enters the arithmetic.
--
-- Only the $300 is money moving through an enrollment, so it is an ordinary
-- discounts row — publishing, revenue snapshots and the enrollment page then
-- price it through the same path as any coupon, with no special cases. The
-- waiver and the advertising window live in the config's promo block, because
-- a discount row cannot express "and stop charging the one-off fee" or "do not
-- mention this before 12 August".
--
-- Deliberately NOT encoded as a single $400 discount with the materials fee
-- still charged. That reaches the same $2,100 total but claims we collected a
-- fee we waived, which would misstate materials-fee takings and shift tutor
-- revenue by $100 per student.
--
-- Both statements are guarded, so re-running is a no-op.

INSERT INTO discounts (discount_name, discount_type, discount_value, is_active)
SELECT '2026 Back to School 新生優惠', 'fixed', 300.00, 1 FROM DUAL
WHERE NOT EXISTS (
    SELECT 1 FROM discounts WHERE discount_name = '2026 Back to School 新生優惠'
);

-- from_date is what holds the offer back: the application form opens around
-- 5 August but the campaign launches on the 12th, and the form must not
-- advertise an offer the marketing has not announced yet. until_date is left
-- null so the offer runs to the end of the intake unless an admin sets one.
UPDATE regular_course_configs
SET pricing_config = JSON_SET(
    COALESCE(pricing_config, JSON_OBJECT()),
    '$.promo',
    CAST('{
        "code": "26BTSSA",
        "name_zh": "2026 中學教室 Back to School 新生優惠",
        "name_en": "2026 Secondary Academy Back to School New Student Offer",
        "short_name_zh": "2026 Back to School 新生優惠",
        "short_name_en": "2026 Back to School new student offer",
        "total_value": 400,
        "tuition_amount": 300,
        "waives_registration_fee": true,
        "from_date": "2026-08-12",
        "until_date": null,
        "items": [
            {"name_zh": "9月新生學費立減 MOP 300", "name_en": "MOP 300 off September tuition for new students"},
            {"name_zh": "免教材費 MOP 100", "name_en": "MOP 100 materials fee waived"},
            {"name_zh": "贈 MathConcept 限量檯曆一份（價值 MOP 100）", "name_en": "A limited edition MathConcept desk calendar (worth MOP 100)"}
        ]
    }' AS JSON)
)
WHERE year = 2026;

-- Point the promo at the discount row seeded above. Split from the JSON
-- literal so the id is looked up rather than hardcoded, which keeps this
-- migration correct on any database where the row lands at a different id.
UPDATE regular_course_configs
SET pricing_config = JSON_SET(
    pricing_config,
    '$.promo.discount_id',
    (SELECT id FROM discounts WHERE discount_name = '2026 Back to School 新生優惠' LIMIT 1)
)
WHERE year = 2026;
