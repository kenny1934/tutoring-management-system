# Tutoring Management Web App

A modern web application built with FastAPI (backend) and Next.js (frontend) as an alternative to AppSheet, providing faster sync and more control over features.

## Tech Stack

### Backend
- **Python 3.11+** with FastAPI
- **SQLAlchemy** ORM for database operations
- **Google Cloud SQL** for MySQL database
- **Google OAuth 2.0** for authentication
- **Deployed on:** Google Cloud Run

### Frontend
- **Next.js 14** (React framework)
- **Shadcn UI** + Tailwind CSS for components
- **TypeScript** for type safety
- **Deployed on:** Vercel

## Project Structure

```
webapp/
├── backend/                 # FastAPI backend
│   ├── main.py             # Application entry point
│   ├── database.py         # Database connection setup
│   ├── models.py           # SQLAlchemy models
│   ├── routers/            # API route handlers
│   │   ├── students.py
│   │   ├── enrollments.py
│   │   ├── sessions.py
│   │   └── stats.py
│   ├── auth.py             # Google OAuth middleware
│   ├── requirements.txt    # Python dependencies
│   └── .env.example        # Environment variables template
├── frontend/               # Next.js frontend
│   ├── app/               # Next.js 14 app router
│   │   ├── page.tsx       # Dashboard
│   │   ├── students/      # Students pages
│   │   └── sessions/      # Sessions pages
│   ├── components/        # Shadcn UI components
│   ├── lib/               # Utilities
│   ├── package.json
│   └── .env.local.example
└── README.md              # This file
```

## Setup Instructions

### Backend Setup

1. **Create virtual environment:**
   ```bash
   cd webapp/backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your Cloud SQL credentials
   ```

4. **Run development server:**
   ```bash
   uvicorn main:app --reload
   ```

   API will be available at http://localhost:8000
   Auto-generated docs at http://localhost:8000/docs

### Frontend Setup

1. **Install dependencies:**
   ```bash
   cd webapp/frontend
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with backend API URL
   ```

3. **Run development server:**
   ```bash
   npm run dev
   ```

   App will be available at http://localhost:3000

## API Endpoints

### Students
- `GET /api/students` - List all students with optional search
- `GET /api/students/{id}` - Get student details with enrollment history

### Enrollments
- `GET /api/enrollments` - List enrollments with filters (status, location, date range)

### Sessions
- `GET /api/sessions` - List session log with date range filter

### Stats
- `GET /api/stats` - Dashboard summary statistics

## Development

### Backend Development
- FastAPI provides auto-generated interactive API docs at `/docs`
- Use SQLAlchemy models for type-safe database queries
- All endpoints are read-only for MVP

### Frontend Development
- Use Shadcn UI components from `components/ui/`
- Follow Next.js 14 app router conventions
- TypeScript ensures type safety across the app

## Deployment

### Backend (Google Cloud Run)
```bash
cd webapp/backend
gcloud run deploy tutoring-api \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated
```

### Frontend (Vercel)
```bash
cd webapp/frontend
vercel deploy
```

## Why This Stack?

- **FastAPI**: Fastest Python framework, auto-documentation, type safety
- **Next.js**: Industry standard React framework, Meta-backed
- **Shadcn UI**: Modern, accessible, customizable components
- **Cloud Run**: Scales to zero, pay-per-use (~$0-5/month for MVP)
- **No vendor lock-in**: Full control over code and infrastructure

## Next Steps

1. ✅ Setup project structure
2. ⏳ Build backend API endpoints
3. ⏳ Build frontend pages
4. ⏳ Deploy to Cloud Run + Vercel
5. ⏳ Compare performance with AppSheet
6. ⏳ Gradually add write operations
7. ⏳ Add smart features (AI suggestions, scheduling)
