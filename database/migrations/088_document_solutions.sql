-- Add solutions column: AI-generated solutions stored as raw text per question index
ALTER TABLE documents ADD COLUMN solutions JSON NULL COMMENT 'AI-generated solutions per question: {index: {text, topic, subtopic, difficulty}}';
