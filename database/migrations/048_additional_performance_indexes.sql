-- =====================================================
-- Additional Performance Indexes Migration
-- Run on Google Cloud SQL (MySQL)
--
-- Adds 3 indexes for commonly filtered columns
-- to improve query performance on sessions and enrollments
-- =====================================================

-- Session date index for date-range queries without location filter
-- Helps: Sessions page date filtering, dashboard queries
CREATE INDEX idx_session_log_date ON session_log(session_date DESC);

-- Payment status index for overdue/payment filtering
-- Helps: Overdue payments page, payment status filters
CREATE INDEX idx_enrollment_payment_status ON enrollments(payment_status);

-- Composite index for location + payment status queries
-- Helps: Location-filtered payment queries (common pattern)
CREATE INDEX idx_enrollment_loc_payment ON enrollments(location, payment_status);
