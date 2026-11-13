-- Global materials pricing for future reviewed enrollments.
-- Existing confirmed payments retain their saved materials amounts.
CREATE TABLE billing_global_settings (
    id INT NOT NULL PRIMARY KEY,
    materials_fee INT NOT NULL DEFAULT 100,
    version INT NOT NULL DEFAULT 1,
    updated_by INT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_billing_settings_singleton CHECK (id = 1),
    CONSTRAINT chk_billing_materials_amount CHECK (materials_fee BETWEEN 0 AND 10000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO billing_global_settings (id, materials_fee, version) VALUES (1, 100, 1);

CREATE TABLE billing_settings_operations (
    idempotency_key VARCHAR(64) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
    actor_id INT NOT NULL,
    actor_name VARCHAR(100) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    result JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
