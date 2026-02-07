-- Add reason_category column to termination_records for structured termination reason tracking
ALTER TABLE termination_records ADD COLUMN reason_category VARCHAR(50) NULL;
CREATE INDEX idx_termination_records_reason_category ON termination_records(reason_category);
