-- Add emoji column to message_likes for multi-emoji reactions
ALTER TABLE message_likes ADD COLUMN emoji VARCHAR(10) DEFAULT '❤️';
CREATE INDEX idx_like_msg_tutor_emoji ON message_likes(message_id, tutor_id, emoji);
