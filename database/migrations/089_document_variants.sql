-- Add variants column: AI-generated variant questions stored as raw text per question index
ALTER TABLE documents ADD COLUMN variants JSON NULL COMMENT 'AI-generated variant questions per question: {index: {text, solution_text}}';
