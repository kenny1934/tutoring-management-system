-- Adds a nullable JSON column for the summer apply-form pitch block
-- (hero line, pillars, philosophy paragraph). Null = no pitch block rendered.
ALTER TABLE summer_course_configs ADD COLUMN course_intro JSON NULL
