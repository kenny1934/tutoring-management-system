"""Run pending SQL migrations safely against the database."""
import os
import sys
import pymysql
from dotenv import load_dotenv

# Load .env from backend directory
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "webapp", "backend", ".env"))

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

MIGRATIONS = [
    "080_saved_reports.sql",
    "073_summer_course_tables.sql",
]

def main():
    migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")

    print(f"Connecting to {DB_HOST}:{DB_PORT}/{DB_NAME} as {DB_USER}...")
    conn = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        connect_timeout=10,
    )

    try:
        for filename in MIGRATIONS:
            filepath = os.path.join(migrations_dir, filename)
            if not os.path.exists(filepath):
                print(f"  SKIP {filename} — file not found")
                continue

            with open(filepath, "r") as f:
                sql_content = f.read().strip()

            # Split on semicolons, strip comment-only lines from each fragment
            raw_parts = sql_content.split(";")
            statements = []
            for part in raw_parts:
                # Remove comment-only lines, keep lines with actual SQL
                lines = [l for l in part.strip().splitlines() if l.strip() and not l.strip().startswith("--")]
                sql = "\n".join(lines).strip()
                if sql:
                    statements.append(sql)

            print(f"  Running {filename} ({len(statements)} statement(s))...")
            cursor = conn.cursor()
            try:
                for stmt in statements:
                    cursor.execute(stmt)
                conn.commit()
                print(f"  OK     {filename}")
            except Exception as e:
                conn.rollback()
                print(f"  FAIL   {filename}: {e}")
                sys.exit(1)
            finally:
                cursor.close()

        print("\nAll migrations applied successfully.")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
"""Run pending SQL migrations safely against the database."""
import os
import sys
import pymysql
from dotenv import load_dotenv

# Load .env from backend directory
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "webapp", "backend", ".env"))

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

MIGRATIONS = [
    "074_summer_config_text_content.sql",
]

def main():
    migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")

    print(f"Connecting to {DB_HOST}:{DB_PORT}/{DB_NAME} as {DB_USER}...")
    conn = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        connect_timeout=10,
    )

    try:
        for filename in MIGRATIONS:
            filepath = os.path.join(migrations_dir, filename)
            if not os.path.exists(filepath):
                print(f"  SKIP {filename} — file not found")
                continue

            with open(filepath, "r") as f:
                sql_content = f.read().strip()

            # Split on semicolons, strip comment-only lines from each fragment
            raw_parts = sql_content.split(";")
            statements = []
            for part in raw_parts:
                # Remove comment-only lines, keep lines with actual SQL
                lines = [l for l in part.strip().splitlines() if l.strip() and not l.strip().startswith("--")]
                sql = "\n".join(lines).strip()
                if sql:
                    statements.append(sql)

            print(f"  Running {filename} ({len(statements)} statement(s))...")
            cursor = conn.cursor()
            try:
                for stmt in statements:
                    cursor.execute(stmt)
                conn.commit()
                print(f"  OK     {filename}")
            except Exception as e:
                conn.rollback()
                print(f"  FAIL   {filename}: {e}")
                sys.exit(1)
            finally:
                cursor.close()

        print("\nAll migrations applied successfully.")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
"""Run pending SQL migrations safely against the database."""
import os
import sys
import pymysql
from dotenv import load_dotenv

# Load .env from backend directory
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "webapp", "backend", ".env"))

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

MIGRATIONS = [
    "075_drop_slot_unique_constraint.sql",
]

def main():
    migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")

    print(f"Connecting to {DB_HOST}:{DB_PORT}/{DB_NAME} as {DB_USER}...")
    conn = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        connect_timeout=10,
    )

    try:
        for filename in MIGRATIONS:
            filepath = os.path.join(migrations_dir, filename)
            if not os.path.exists(filepath):
                print(f"  SKIP {filename} — file not found")
                continue

            with open(filepath, "r") as f:
                sql_content = f.read().strip()

            # Split on semicolons, strip comment-only lines from each fragment
            raw_parts = sql_content.split(";")
            statements = []
            for part in raw_parts:
                # Remove comment-only lines, keep lines with actual SQL
                lines = [l for l in part.strip().splitlines() if l.strip() and not l.strip().startswith("--")]
                sql = "\n".join(lines).strip()
                if sql:
                    statements.append(sql)

            print(f"  Running {filename} ({len(statements)} statement(s))...")
            cursor = conn.cursor()
            try:
                for stmt in statements:
                    cursor.execute(stmt)
                conn.commit()
                print(f"  OK     {filename}")
            except Exception as e:
                conn.rollback()
                print(f"  FAIL   {filename}: {e}")
                sys.exit(1)
            finally:
                cursor.close()

        print("\nAll migrations applied successfully.")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
"""Run pending SQL migrations safely against the database."""
import os
import sys
import pymysql
from dotenv import load_dotenv

# Load .env from backend directory
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "webapp", "backend", ".env"))

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

MIGRATIONS = [
    "076_summer_tutor_duties.sql",
]

def main():
    migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")

    print(f"Connecting to {DB_HOST}:{DB_PORT}/{DB_NAME} as {DB_USER}...")
    conn = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        connect_timeout=10,
    )

    try:
        for filename in MIGRATIONS:
            filepath = os.path.join(migrations_dir, filename)
            if not os.path.exists(filepath):
                print(f"  SKIP {filename} — file not found")
                continue

            with open(filepath, "r") as f:
                sql_content = f.read().strip()

            # Split on semicolons, strip comment-only lines from each fragment
            raw_parts = sql_content.split(";")
            statements = []
            for part in raw_parts:
                # Remove comment-only lines, keep lines with actual SQL
                lines = [l for l in part.strip().splitlines() if l.strip() and not l.strip().startswith("--")]
                sql = "\n".join(lines).strip()
                if sql:
                    statements.append(sql)

            print(f"  Running {filename} ({len(statements)} statement(s))...")
            cursor = conn.cursor()
            try:
                for stmt in statements:
                    cursor.execute(stmt)
                conn.commit()
                print(f"  OK     {filename}")
            except Exception as e:
                conn.rollback()
                print(f"  FAIL   {filename}: {e}")
                sys.exit(1)
            finally:
                cursor.close()

        print("\nAll migrations applied successfully.")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
"""Run pending SQL migrations safely against the database."""
import os
import sys
import pymysql
from dotenv import load_dotenv

# Load .env from backend directory
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "webapp", "backend", ".env"))

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

MIGRATIONS = [
    "079_summer_sessions.sql",
]

def main():
    migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")

    print(f"Connecting to {DB_HOST}:{DB_PORT}/{DB_NAME} as {DB_USER}...")
    conn = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        connect_timeout=10,
    )

    try:
        for filename in MIGRATIONS:
            filepath = os.path.join(migrations_dir, filename)
            if not os.path.exists(filepath):
                print(f"  SKIP {filename} — file not found")
                continue

            with open(filepath, "r") as f:
                sql_content = f.read().strip()

            # Split on semicolons, strip comment-only lines from each fragment
            raw_parts = sql_content.split(";")
            statements = []
            for part in raw_parts:
                # Remove comment-only lines, keep lines with actual SQL
                lines = [l for l in part.strip().splitlines() if l.strip() and not l.strip().startswith("--")]
                sql = "\n".join(lines).strip()
                if sql:
                    statements.append(sql)

            print(f"  Running {filename} ({len(statements)} statement(s))...")
            cursor = conn.cursor()
            try:
                for stmt in statements:
                    cursor.execute(stmt)
                conn.commit()
                print(f"  OK     {filename}")
            except Exception as e:
                conn.rollback()
                print(f"  FAIL   {filename}: {e}")
                sys.exit(1)
            finally:
                cursor.close()

        print("\nAll migrations applied successfully.")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
"""Run pending SQL migrations safely against the database."""
import os
import sys
import pymysql
from dotenv import load_dotenv

# Load .env from backend directory
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "webapp", "backend", ".env"))

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

MIGRATIONS = [
    "082_rename_lesson_columns.sql",
]

def main():
    migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")

    print(f"Connecting to {DB_HOST}:{DB_PORT}/{DB_NAME} as {DB_USER}...")
    conn = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        connect_timeout=10,
    )

    try:
        for filename in MIGRATIONS:
            filepath = os.path.join(migrations_dir, filename)
            if not os.path.exists(filepath):
                print(f"  SKIP {filename} — file not found")
                continue

            with open(filepath, "r") as f:
                sql_content = f.read().strip()

            # Split on semicolons, strip comment-only lines from each fragment
            raw_parts = sql_content.split(";")
            statements = []
            for part in raw_parts:
                # Remove comment-only lines, keep lines with actual SQL
                lines = [l for l in part.strip().splitlines() if l.strip() and not l.strip().startswith("--")]
                sql = "\n".join(lines).strip()
                if sql:
                    statements.append(sql)

            print(f"  Running {filename} ({len(statements)} statement(s))...")
            cursor = conn.cursor()
            try:
                for stmt in statements:
                    cursor.execute(stmt)
                conn.commit()
                print(f"  OK     {filename}")
            except Exception as e:
                conn.rollback()
                print(f"  FAIL   {filename}: {e}")
                sys.exit(1)
            finally:
                cursor.close()

        print("\nAll migrations applied successfully.")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
"""Run pending SQL migrations safely against the database."""
import os
import sys
import pymysql
from dotenv import load_dotenv

# Load .env from backend directory
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "webapp", "backend", ".env"))

DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))

MIGRATIONS = [
    "083_drop_session_unique_constraint.sql",
]

def main():
    migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")

    print(f"Connecting to {DB_HOST}:{DB_PORT}/{DB_NAME} as {DB_USER}...")
    conn = pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        connect_timeout=10,
    )

    try:
        for filename in MIGRATIONS:
            filepath = os.path.join(migrations_dir, filename)
            if not os.path.exists(filepath):
                print(f"  SKIP {filename} — file not found")
                continue

            with open(filepath, "r") as f:
                sql_content = f.read().strip()

            # Split on semicolons, strip comment-only lines from each fragment
            raw_parts = sql_content.split(";")
            statements = []
            for part in raw_parts:
                # Remove comment-only lines, keep lines with actual SQL
                lines = [l for l in part.strip().splitlines() if l.strip() and not l.strip().startswith("--")]
                sql = "\n".join(lines).strip()
                if sql:
                    statements.append(sql)

            print(f"  Running {filename} ({len(statements)} statement(s))...")
            cursor = conn.cursor()
            try:
                for stmt in statements:
                    cursor.execute(stmt)
                conn.commit()
                print(f"  OK     {filename}")
            except Exception as e:
                conn.rollback()
                print(f"  FAIL   {filename}: {e}")
                sys.exit(1)
            finally:
                cursor.close()

        print("\nAll migrations applied successfully.")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
