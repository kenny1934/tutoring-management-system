-- Fix timestamps stored in UTC instead of HK time (UTC+8)
-- Python datetime.now()/datetime.utcnow() returned UTC on Cloud Run,
-- but DB convention is HK time per CONVERT_TZ defaults.
--
-- wecom tables are webapp-only, safe to fix unconditionally.
-- session_log, enrollments, extension_requests have mixed AppSheet + webapp data.
-- Add appropriate WHERE clauses to target only webapp-written records.

-- wecom_message_log: send_timestamp (webapp-only table)
UPDATE wecom_message_log
SET send_timestamp = DATE_ADD(send_timestamp, INTERVAL 8 HOUR)
WHERE send_timestamp IS NOT NULL;

-- wecom_webhooks: last_used_at (webapp-only table)
UPDATE wecom_webhooks
SET last_used_at = DATE_ADD(last_used_at, INTERVAL 8 HOUR)
WHERE last_used_at IS NOT NULL;

-- session_log, enrollments, extension_requests:
-- These tables have mixed AppSheet + webapp data.
-- Uncomment and customize WHERE clauses as needed:
--
-- UPDATE session_log
-- SET last_modified_time = DATE_ADD(last_modified_time, INTERVAL 8 HOUR)
-- WHERE last_modified_time IS NOT NULL
--   AND <condition to identify webapp-written records>;
--
-- UPDATE session_log
-- SET attendance_mark_time = DATE_ADD(attendance_mark_time, INTERVAL 8 HOUR)
-- WHERE attendance_mark_time IS NOT NULL
--   AND <condition to identify webapp-written records>;
--
-- UPDATE enrollments
-- SET last_modified_time = DATE_ADD(last_modified_time, INTERVAL 8 HOUR)
-- WHERE last_modified_time IS NOT NULL
--   AND <condition to identify webapp-written records>;
--
-- UPDATE extension_requests
-- SET reviewed_at = DATE_ADD(reviewed_at, INTERVAL 8 HOUR)
-- WHERE reviewed_at IS NOT NULL
--   AND <condition to identify webapp-written records>;
