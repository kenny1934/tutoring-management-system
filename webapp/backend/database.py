"""
Database connection supporting both development and production environments.
- Development: Direct TCP to Cloud SQL public IP
- Production (Cloud Run): Unix socket via Cloud SQL Connector
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database configuration
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
INSTANCE_CONNECTION_NAME = os.getenv("INSTANCE_CONNECTION_NAME")

# Create database URL based on environment
if ENVIRONMENT == "production" and INSTANCE_CONNECTION_NAME:
    # Cloud Run: use Unix socket for secure connection to Cloud SQL
    # PyMySQL requires host to be specified even with unix_socket
    DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@localhost/{DB_NAME}"
    connect_args = {
        "charset": "utf8mb4",
        "unix_socket": f"/cloudsql/{INSTANCE_CONNECTION_NAME}"
    }
else:
    # Development: direct TCP connection to public IP
    DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    connect_args = {
        "charset": "utf8mb4",  # Full Unicode support including emojis
        "connect_timeout": 10,  # 10 second connection timeout
        "read_timeout": 60,  # 60 second read timeout for complex queries
        "write_timeout": 30,
    }

# Create database engine with connection pooling
engine = create_engine(
    DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=3600,
    pool_pre_ping=True,  # Re-enabled for connection health checks
    echo=False,  # Set to True for SQL debugging
    connect_args=connect_args
)

# Create SessionLocal class for database sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for SQLAlchemy models
Base = declarative_base()


def get_db():
    """
    Dependency function to get database session.
    Use this in FastAPI endpoints with Depends(get_db).

    Example:
        @app.get("/students")
        def get_students(db: Session = Depends(get_db)):
            return db.query(Student).all()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
