-- Add lang_stream_options to summer_course_configs (config-driven language stream choices)
ALTER TABLE summer_course_configs
  ADD COLUMN lang_stream_options JSON DEFAULT NULL AFTER center_options;

-- Add buddy_referrer_name to summer_applications (name of friend who shared buddy code)
ALTER TABLE summer_applications
  ADD COLUMN buddy_referrer_name VARCHAR(255) DEFAULT NULL AFTER buddy_names;
