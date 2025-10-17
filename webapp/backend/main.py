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

# Configure CORS
origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001,http://localhost:3002").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "OPTIONS"],  # Only allow GET for MVP (read-only)
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
    try:
        # Test database connection
        with engine.connect() as connection:
            connection.execute("SELECT 1")
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "status": "healthy" if db_status == "connected" else "unhealthy",
        "database": db_status,
        "environment": os.getenv("ENVIRONMENT", "development")
    }


# Import routers (will be created next)
from routers import students, enrollments, sessions, stats

# Register routers
app.include_router(students.router, prefix="/api", tags=["students"])
app.include_router(enrollments.router, prefix="/api", tags=["enrollments"])
app.include_router(sessions.router, prefix="/api", tags=["sessions"])
app.include_router(stats.router, prefix="/api", tags=["stats"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Auto-reload on code changes (development only)
    )
