-- Point the September intake at the application form banner.
--
-- The artwork is last year's Google Form header, re-exported at 2400x600 and
-- committed as a static asset. Its wording carries no year, so it stands for
-- every September intake.
--
-- Guarded on NULL so re-running never overwrites a banner set from the config
-- editor, which is where an admin would change it.
--
-- Renumbered from 141, which collided with a summer migration that reached
-- main while this branch was in flight. It was applied to production under the
-- old number and ahead of 142-149, so its place in the sequence is not the
-- order it actually ran in.

UPDATE regular_course_configs
SET banner_image_url = '/regular/regular-banner.jpg'
WHERE year = 2026 AND banner_image_url IS NULL;
