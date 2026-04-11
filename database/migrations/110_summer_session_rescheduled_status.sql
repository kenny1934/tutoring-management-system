-- Add 'Rescheduled - Pending Make-up' to summer session status enum
ALTER TABLE summer_sessions
  MODIFY COLUMN session_status ENUM('Tentative','Confirmed','Cancelled','Rescheduled - Pending Make-up')
  NOT NULL DEFAULT 'Tentative';
