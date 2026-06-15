-- Seed the "Extra Lessons (per 2)" promo discount.
--
-- Context: a promotion offers $100 off for every 2 extra one-off lessons. This
-- is modelled as a normal Discount row, distinguished by discount_type =
-- 'per_2_lessons'. The backend scales the value by floor(lessons / 2) and
-- exempts this type from the usual 6-lesson minimum (see compute_discount_value
-- and PER_TWO_LESSONS_DISCOUNT_TYPE). discount_value is the amount per 2 lessons.
--
-- Office staff apply it manually from the discount dropdown on a One-Time
-- enrollment. Ending the promo is just flipping is_active to 0 — no code change.
--
-- Guarded so re-runs are a no-op (matched on discount_type).

INSERT INTO discounts (discount_name, discount_type, discount_value, is_active)
SELECT 'Extra Lessons (per 2)', 'per_2_lessons', 100.00, 1 FROM DUAL
WHERE NOT EXISTS (
    SELECT 1 FROM discounts WHERE discount_type = 'per_2_lessons'
);
