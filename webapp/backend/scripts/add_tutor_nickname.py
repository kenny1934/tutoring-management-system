"""
Migration: Add nickname column to tutors table.
Short display name for parent messages (e.g. David Sir, Miss Bella).
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from database import engine
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE tutors ADD COLUMN nickname VARCHAR(100) NULL AFTER tutor_name"))
        conn.commit()
        print("Added 'nickname' column to tutors table.")

if __name__ == "__main__":
    migrate()
