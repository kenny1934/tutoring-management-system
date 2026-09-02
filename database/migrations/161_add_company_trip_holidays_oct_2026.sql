-- 161: Company Trip closure, 19 to 22 October 2026 (confirmed official 2026-08-13).
-- The centre is closed on these dates, so weekly lessons that land on them are
-- skipped and not billed. Guarded inserts keep the migration idempotent.

INSERT INTO holidays (holiday_date, holiday_name)
SELECT '2026-10-19', 'Company Trip' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM holidays WHERE holiday_date = '2026-10-19');

INSERT INTO holidays (holiday_date, holiday_name)
SELECT '2026-10-20', 'Company Trip' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM holidays WHERE holiday_date = '2026-10-20');

INSERT INTO holidays (holiday_date, holiday_name)
SELECT '2026-10-21', 'Company Trip' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM holidays WHERE holiday_date = '2026-10-21');

INSERT INTO holidays (holiday_date, holiday_name)
SELECT '2026-10-22', 'Company Trip' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM holidays WHERE holiday_date = '2026-10-22');
