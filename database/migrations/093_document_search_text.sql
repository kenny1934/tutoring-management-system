-- Add search_text column for full-text content search
ALTER TABLE documents ADD COLUMN search_text TEXT NULL;
UPDATE documents SET search_text = '' WHERE search_text IS NULL;
ALTER TABLE documents ADD FULLTEXT INDEX ft_search_text (search_text);
