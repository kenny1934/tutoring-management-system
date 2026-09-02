-- Prospect journey: link a P6 prospect to a regular application.
--
-- Mirrors primary_prospects.summer_application_id. One prospect row is one
-- child's whole journey (summer app, regular app, or both), so the regular link
-- lives on the prospect exactly like the summer link. ON DELETE SET NULL so
-- deleting a regular application never orphans a prospect.

ALTER TABLE primary_prospects
  ADD COLUMN regular_application_id INT NULL,
  ADD CONSTRAINT fk_prospect_regular_app
    FOREIGN KEY (regular_application_id) REFERENCES regular_applications(id)
    ON DELETE SET NULL,
  ADD INDEX idx_prospect_regular_app (regular_application_id);
