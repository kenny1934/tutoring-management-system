-- Migration 041: Make-up Proposal System
-- Allows tutors to propose make-up slots for confirmation by other tutors

-- Main proposals table
CREATE TABLE IF NOT EXISTS makeup_proposals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    original_session_id INT NOT NULL COMMENT 'Session with Pending Make-up status',
    proposed_by_tutor_id INT NOT NULL COMMENT 'Tutor who created the proposal',

    -- Proposal type: specific_slots (1-3 options) or needs_input (ask main tutor)
    proposal_type ENUM('specific_slots', 'needs_input') NOT NULL,

    -- For needs_input: single target tutor (main tutor from enrollment)
    needs_input_tutor_id INT NULL,

    -- Metadata
    notes TEXT NULL COMMENT 'Message from proposer to target tutors',
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT (CONVERT_TZ(NOW(), '+00:00', '+08:00')),
    resolved_at TIMESTAMP NULL,

    -- Link to auto-created message for discussion
    message_id INT NULL,

    FOREIGN KEY (original_session_id) REFERENCES session_log(id),
    FOREIGN KEY (proposed_by_tutor_id) REFERENCES tutors(id),
    FOREIGN KEY (needs_input_tutor_id) REFERENCES tutors(id),
    FOREIGN KEY (message_id) REFERENCES tutor_messages(id),

    INDEX idx_original_session (original_session_id),
    INDEX idx_status (status),
    INDEX idx_proposed_by (proposed_by_tutor_id),
    INDEX idx_needs_input_tutor (needs_input_tutor_id, status)
) COMMENT 'Tracks make-up proposals awaiting confirmation from other tutors';

-- Proposal slots table (for specific_slots proposals, 1-3 slot options)
CREATE TABLE IF NOT EXISTS makeup_proposal_slots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proposal_id INT NOT NULL,
    slot_order INT NOT NULL DEFAULT 1 COMMENT '1, 2, or 3 for ordering options',

    -- Slot details
    proposed_date DATE NOT NULL,
    proposed_time_slot VARCHAR(100) NOT NULL,
    proposed_tutor_id INT NOT NULL COMMENT 'Target tutor for this slot',
    proposed_location VARCHAR(100) NOT NULL,

    -- Slot-level status
    slot_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    resolved_at TIMESTAMP NULL,
    resolved_by_tutor_id INT NULL,
    rejection_reason TEXT NULL,

    FOREIGN KEY (proposal_id) REFERENCES makeup_proposals(id) ON DELETE CASCADE,
    FOREIGN KEY (proposed_tutor_id) REFERENCES tutors(id),
    FOREIGN KEY (resolved_by_tutor_id) REFERENCES tutors(id),

    INDEX idx_proposal_id (proposal_id),
    INDEX idx_tutor_pending (proposed_tutor_id, slot_status),
    INDEX idx_date_time_location (proposed_date, proposed_time_slot, proposed_location)
) COMMENT 'Individual slot options within a make-up proposal';

-- Ensure only one active proposal per pending session
-- Using a nullable column approach: set to 1 when pending, NULL when resolved
-- This allows unique constraint to work (NULL values don't conflict)
ALTER TABLE makeup_proposals ADD COLUMN active_flag TINYINT(1) DEFAULT 1 COMMENT 'Set to 1 when pending, NULL when resolved';
CREATE UNIQUE INDEX idx_one_active_proposal_per_session ON makeup_proposals (original_session_id, active_flag);
