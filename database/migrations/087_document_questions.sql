-- 087: Store extracted question metadata on documents (boundaries, topics, difficulty)
ALTER TABLE documents ADD COLUMN questions JSON NULL
  COMMENT 'Extracted question metadata: boundaries, topics, difficulty';
