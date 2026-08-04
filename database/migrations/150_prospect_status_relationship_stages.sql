-- Prospect applied/enrolled are now derived per course from the application
-- links (summer_application_id / regular_application_id plus enrollment-row
-- existence), so the manual status field keeps only relationship stages:
-- New / Contacted / Interested / Declined. Remap the rows the old auto-match
-- promoted to Applied. Nothing is lost - every such row is link-explained,
-- and the derived summer_state / regular_state now carry the journey.

UPDATE primary_prospects
SET status = 'New'
WHERE status IN ('Applied', 'Enrolled');
