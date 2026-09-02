-- Backfill verified_branch_origin on regular applications that a P6 prospect
-- already claims.
--
-- The prospect-link paths now carry the prospect's primary branch onto the
-- application's origin, the way the summer side has always done. Links made
-- before that existed left the origin either empty or reading MSA/MSB, which
-- is where the applicant landed rather than where they came from: linking the
-- student record fills the origin from that student's home location, and for a
-- P6 transition the enrolment usually happens before anyone links the prospect.
--
-- The WHERE clause is should_fill_prospect_origin() in SQL. It rewrites an
-- empty origin, a 'New' one (which a prospect link contradicts), and a
-- Secondary Academy one. An origin naming another primary branch is a real
-- admin decision and is left alone.
--
-- Idempotent: a second run matches nothing, because every row it touches ends
-- up holding the prospect's own branch.

UPDATE regular_applications a
JOIN primary_prospects p ON p.regular_application_id = a.id
SET a.verified_branch_origin = p.source_branch
WHERE p.source_branch IS NOT NULL
  AND TRIM(p.source_branch) <> ''
  AND (
    a.verified_branch_origin IS NULL
    OR TRIM(a.verified_branch_origin) = ''
    OR a.verified_branch_origin = 'New'
    OR UPPER(a.verified_branch_origin) IN ('MSA', 'MSB')
  );
