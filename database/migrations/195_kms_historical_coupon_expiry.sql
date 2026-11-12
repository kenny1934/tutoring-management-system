-- Used KMS receipts may predate individual tracking, with no known expiry.
-- This affects archival redemption evidence only, never available coupons.
ALTER TABLE billing_kms_coupon_redemptions MODIFY COLUMN expires_on DATE NULL;
