"""
Migration: Create push_subscriptions table for Web Push notifications.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from database import engine
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tutor_id INT NOT NULL,
                endpoint TEXT NOT NULL,
                p256dh VARCHAR(255) NOT NULL,
                auth VARCHAR(255) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_push_sub_tutor FOREIGN KEY (tutor_id) REFERENCES tutors(id),
                UNIQUE KEY uq_push_endpoint (endpoint(500)),
                INDEX idx_push_sub_tutor (tutor_id)
            )
        """))
        conn.commit()
        print("Created 'push_subscriptions' table.")

if __name__ == "__main__":
    migrate()
