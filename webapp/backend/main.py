"""
FastAPI main application for tutoring management system.
Provides read-only API endpoints for MVP testing.
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Check if this is a paperless preview/thumbnail endpoint that needs iframe embedding
        is_iframe_allowed = (
            request.url.path.startswith("/api/paperless/preview/") or
            request.url.path.startswith("/api/paperless/thumbnail/")
        )

        # Prevent clickjacking (except for iframe-allowed routes)
        # For iframe-allowed routes, we skip X-Frame-Options and rely on CSP frame-ancestors
        # (X-Frame-Options doesn't support cross-origin allowlisting)
        if not is_iframe_allowed:
            response.headers["X-Frame-Options"] = "DENY"

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # XSS Protection (legacy but still useful)
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Referrer Policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Content Security Policy - adjust as needed for your app
        # Allow iframe embedding only for paperless preview/thumbnail routes
        if is_iframe_allowed:
            # Get allowed origins for frame-ancestors (frontend URLs that can embed these)
            frontend_origins = os.getenv(
                "ALLOWED_ORIGINS",
                "http://localhost:3000 http://127.0.0.1:3000 http://localhost:3001 http://127.0.0.1:3001"
            ).replace(",", " ")  # CSP uses space-separated, env uses comma-separated
            csp_directives = [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data: https: blob:",
                "font-src 'self' data:",
                "connect-src 'self' https://lh3.googleusercontent.com https://accounts.google.com",
                f"frame-ancestors 'self' {frontend_origins}",  # Allow frontend to embed
            ]
        else:
            csp_directives = [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  # Needed for Next.js
                "style-src 'self' 'unsafe-inline'",  # Needed for inline styles
                "img-src 'self' data: https: blob:",
                "font-src 'self' data:",
                "connect-src 'self' https://lh3.googleusercontent.com https://accounts.google.com",
                "frame-ancestors 'none'",
            ]
        response.headers["Content-Security-Policy"] = "; ".join(csp_directives)

        # HSTS - only in production with HTTPS
        environment = os.getenv("ENVIRONMENT", "development")
        if environment == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        return response

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

# Add security headers middleware first
app.add_middleware(SecurityHeadersMiddleware)

# Configure CORS with specific allowed headers (not wildcard)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=allow_credentials,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=[
        "Accept",
        "Accept-Language",
        "Content-Type",
        "Content-Language",
        "Authorization",
        "X-Requested-With",
        "X-Effective-Role",  # Custom header for role switching
    ],
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
from routers import students, enrollments, sessions, stats, tutors, revenue, courseware, path_aliases, paperless, holidays, document_processing, parent_communications, terminations, messages, makeup_proposals, exam_revision, extension_requests, auth, debug_admin, discounts, wecom, tutor_memos

# Register routers
app.include_router(auth.router, prefix="/api", tags=["auth"])
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
app.include_router(messages.router, prefix="/api", tags=["messages"])
app.include_router(makeup_proposals.router, prefix="/api", tags=["makeup-proposals"])
app.include_router(exam_revision.router, prefix="/api", tags=["exam-revision"])
app.include_router(extension_requests.router, prefix="/api", tags=["extension-requests"])
app.include_router(debug_admin.router, prefix="/api", tags=["debug-admin"])
app.include_router(discounts.router, prefix="/api", tags=["discounts"])
app.include_router(wecom.router, prefix="/api", tags=["wecom"])
app.include_router(tutor_memos.router, prefix="/api", tags=["tutor-memos"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Auto-reload on code changes (development only)
    )
