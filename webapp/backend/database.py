"""
Simple database connection using direct TCP (no Cloud SQL Connector).
More reliable for development when IP is whitelisted.
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
DB_HOST = os.getenv("DB_HOST", "34.92.182.103")  # Cloud SQL public IP (configurable via .env)
DB_PORT = int(os.getenv("DB_PORT", "3306"))

# Create database URL
DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Create database engine with connection pooling
engine = create_engine(
    DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=3600,
    pool_pre_ping=False,  # Disabled to avoid timeout issues
    echo=False,  # Set to True for SQL debugging
    connect_args={
        "connect_timeout": 10,  # 10 second connection timeout
        "read_timeout": 60,  # 60 second read timeout for complex queries
        "write_timeout": 30,
    }
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
