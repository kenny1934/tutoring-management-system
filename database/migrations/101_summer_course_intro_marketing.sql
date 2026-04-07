-- Update the active 2026 summer config's course_intro to the marketing-approved
-- copy: 6 pillars (was 4) and the philosophy paragraph with the marketing's
-- exact wording (adds 因此, 可以, 並). This is the source of truth for both
-- the apply form's pitch block and the new landing page.
UPDATE summer_course_configs
SET course_intro = '{"headline":{"zh":"暑假12個鐘，來年數學好輕鬆","en":"12 Hours This Summer, An Easier Year of Maths Ahead"},"pillars":[{"zh":"熟悉來年重點","en":"Preview key topics"},{"zh":"梳理難點概念","en":"Untangle tricky concepts"},{"zh":"提升解題表現","en":"Sharpen problem-solving"},{"zh":"強化邏輯思維","en":"Build logical thinking"},{"zh":"專業導師輔導","en":"Expert tutor guidance"},{"zh":"建立清晰思路","en":"Clear thinking patterns"}],"philosophy":{"zh":"中學數學課題抽象，題型多元，因此理解比死記更重要，思維比計算更關鍵。暑假12小時讓學生可以有系統地整理所學、強化理解，並以更清晰的思路迎接來年數學內容。","en":"Secondary maths is abstract and varied. Understanding matters more than memorisation. Thinking matters more than calculation. 12 hours this summer lets students systematically consolidate, strengthen comprehension, and approach next year with clearer thinking."}}'
WHERE year = 2026 AND is_active = 1
