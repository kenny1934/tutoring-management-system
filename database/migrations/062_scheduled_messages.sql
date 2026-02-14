-- Add scheduled_at column for delayed message sending
ALTER TABLE tutor_messages ADD COLUMN scheduled_at DATETIME NULL DEFAULT NULL;
CREATE INDEX idx_message_scheduled ON tutor_messages(scheduled_at);
