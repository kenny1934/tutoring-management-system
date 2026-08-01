-- Structured pricing for the regular course application form.
-- Shape: {"base_fee": 2400, "lessons_per_block": 6, "registration_fee": 100}

ALTER TABLE regular_course_configs
  ADD COLUMN pricing_config JSON NULL COMMENT 'Fee display config: {base_fee, lessons_per_block, registration_fee}';
