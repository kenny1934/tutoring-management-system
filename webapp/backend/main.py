"""
FastAPI main application for tutoring management system.
Provides read-only API endpoints for MVP testing.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="Tutoring Management API",
    description="Read-only API for tutoring management system MVP",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS - use specific origins even in development for better security practice
environment = os.getenv("ENVIRONMENT", "development")
if environment == "development":
    # Development: Allow localhost origins (can be overridden via ALLOWED_ORIGINS env var)
    allow_origins = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"
    ).split(",")
    allow_credentials = True
else:
    # Production: Use specific origins from environment variable (required)
    allowed_origins_str = os.getenv("ALLOWED_ORIGINS")
    if not allowed_origins_str:
        raise ValueError("ALLOWED_ORIGINS environment variable must be set in production")
    allow_origins = allowed_origins_str.split(",")
    allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=allow_credentials,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# Health check endpoint
@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Tutoring Management API",
        "version": "1.0.0",
        "environment": os.getenv("ENVIRONMENT", "development")
    }


@app.get("/health")
async def health_check():
    """Detailed health check with database status"""
    from database import engine
    from sqlalchemy import text
    try:
        # Test database connection
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "status": "healthy" if db_status == "connected" else "unhealthy",
        "database": db_status,
        "environment": os.getenv("ENVIRONMENT", "development")
    }


# Import routers (will be created next)
from routers import students, enrollments, sessions, stats, tutors, revenue, courseware, path_aliases, paperless, holidays, document_processing, parent_communications, terminations

# Register routers
app.include_router(students.router, prefix="/api", tags=["students"])
app.include_router(enrollments.router, prefix="/api", tags=["enrollments"])
app.include_router(sessions.router, prefix="/api", tags=["sessions"])
app.include_router(stats.router, prefix="/api", tags=["stats"])
app.include_router(tutors.router, prefix="/api", tags=["tutors"])
app.include_router(revenue.router, prefix="/api", tags=["revenue"])
app.include_router(courseware.router, prefix="/api", tags=["courseware"])
app.include_router(path_aliases.router, prefix="/api", tags=["path-aliases"])
app.include_router(paperless.router, prefix="/api", tags=["paperless"])
app.include_router(holidays.router, prefix="/api", tags=["holidays"])
app.include_router(document_processing.router, prefix="/api", tags=["document-processing"])
app.include_router(parent_communications.router, prefix="/api", tags=["parent-communications"])
app.include_router(terminations.router, prefix="/api", tags=["terminations"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Auto-reload on code changes (development only)
    )
