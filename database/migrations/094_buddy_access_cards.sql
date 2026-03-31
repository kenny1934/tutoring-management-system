-- 094: RFID access cards for buddy tracker authentication
CREATE TABLE IF NOT EXISTS buddy_access_cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    card_number VARCHAR(20) NOT NULL UNIQUE,
    branch VARCHAR(10) NOT NULL,
    staff_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_card_branch (branch)
);
