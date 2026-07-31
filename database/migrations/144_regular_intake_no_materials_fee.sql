-- The September 2026 intake does not collect the one-off materials fee.
--
-- Not from anyone: not a student new to us, not one moving up from a
-- MathConcept primary branch, not a returning student. Everyone's first block
-- is plain tuition.
--
-- registration_fee stays at 100 because it is still the standard fee, and the
-- Back to School offer quotes it: a genuinely new student is told the fee
-- normally exists and that the offer covered it. That line is the only place
-- the $100 appears, and it is wording rather than arithmetic.
--
-- Scoped to this config on purpose. The flag is read only for enrollments
-- published from a regular application, so ordinary Regular enrollments and
-- renewals created after the intake keep charging the fee as they always have.
-- Absent means charged, so every other config is unaffected.

UPDATE regular_course_configs
SET pricing_config = JSON_SET(
    COALESCE(pricing_config, JSON_OBJECT()),
    '$.registration_fee_charged',
    CAST('false' AS JSON)
)
WHERE year = 2026;
