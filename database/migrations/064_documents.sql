-- Migration 064: Create documents table for courseware document builder
-- Stores worksheets, exams, and lesson plans with TipTap JSON content

CREATE TABLE documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL DEFAULT 'Untitled Document',
  doc_type VARCHAR(20) NOT NULL COMMENT 'worksheet or lesson_plan',
  content JSON COMMENT 'TipTap JSON document',
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (created_by) REFERENCES tutors(id),
  INDEX idx_documents_created_by (created_by),
  INDEX idx_documents_doc_type (doc_type),
  INDEX idx_documents_updated_at (updated_at)
);
