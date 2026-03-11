-- Add text_content and banner_image_url columns to summer_course_configs
-- for admin-editable bilingual text and banner image

ALTER TABLE summer_course_configs ADD COLUMN text_content JSON DEFAULT NULL;
ALTER TABLE summer_course_configs ADD COLUMN banner_image_url VARCHAR(500) DEFAULT NULL;
