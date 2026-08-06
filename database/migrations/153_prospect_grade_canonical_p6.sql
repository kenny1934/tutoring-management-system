-- Canonicalise the free-text grade on primary prospects to 'P6'.
--
-- A prospect is by definition a P6 student heading for secondary, but the
-- grade column is whatever a branch tutor pasted from their own spreadsheet.
-- Two branches typed 'P6/G6', which is the same fact spelled differently.
--
-- The cost is display drift. The grade badge promotes a stored grade to its
-- transitional form during the pre-grade window, so 'P6' renders as 'Pre-F1'
-- while 'P6/G6' has no promotion and renders raw. The same list then shows
-- both spellings for one cohort.
--
-- New submissions are folded on the way in now. This brings the rows that
-- predate that into line. Only recognised P6 spellings are rewritten, so a
-- genuinely odd value stays visible for a human to fix.
--
-- Idempotent: a second run matches nothing, since every row it touches ends
-- up holding exactly 'P6'.

UPDATE primary_prospects
SET grade = 'P6'
WHERE grade IS NOT NULL
  AND grade <> 'P6'
  AND REPLACE(REPLACE(REPLACE(REPLACE(LOWER(TRIM(grade)), ' ', ''), '.', ''), '/', ''), '-', '')
      IN ('p6', 'g6', '6', 'p6g6', 'g6p6', 'primary6', 'grade6', '小六', '六年級', '小學六年級');
