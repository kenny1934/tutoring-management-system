# Tutoring Management System (CSM)

A comprehensive management system for tutoring operations, handling student enrollment, session scheduling, attendance tracking, and reporting.

## Current Status

This project consists of two parallel systems:

1. **Legacy AppSheet System (Production)** - Currently in active use for daily operations
2. **Modern Web Application (Development)** - Next-generation FastAPI + Next.js platform under development

## Technology Stack

### Modern Web Application (In Development)

**Backend:**
- FastAPI 0.109.0 - High-performance Python web framework
- SQLAlchemy 2.0.25 - SQL toolkit and ORM
- Pydantic 2.5.3 - Data validation using Python type annotations
- Google Cloud SQL Connector - Secure database connections
- Google Calendar API - Test/exam tracking integration

**Frontend:**
- Next.js 15.5.5 - React framework with Turbopack
- React 19.1.0 - UI library
- Tailwind CSS 4.x - Utility-first CSS framework
- TypeScript 5.x - Type-safe JavaScript
- Framer Motion - Animation library
- Recharts - Data visualization
- next-themes - Dark mode support

**Database:**
- Google Cloud SQL (MySQL) - Production database
- Shared with legacy AppSheet system

### Legacy AppSheet System (Production)

**Technology:**
- AppSheet - No-code platform for business apps
- Google Cloud SQL - Backend database
- Google Sheets - Data staging and reporting
- Google Apps Script - Advanced automation

## Project Structure

```
tutoring-management-system/
├── webapp/                    # Modern web application
│   ├── backend/              # FastAPI backend
│   │   ├── main.py          # FastAPI application entry point
│   │   ├── database.py      # Database connection and session management
│   │   ├── models.py        # SQLAlchemy ORM models
│   │   ├── schemas.py       # Pydantic validation schemas
│   │   ├── routers/         # API route handlers
│   │   └── services/        # Business logic and external services
│   └── frontend/            # Next.js frontend
│       ├── app/             # Next.js app directory (pages and layouts)
│       ├── components/      # React components
│       ├── lib/             # Utility functions and API client
│       └── types/           # TypeScript type definitions
├── database/                 # Database migrations and schema
│   └── migrations/          # SQL migration scripts
├── docs/                    # Project documentation
│   ├── general/            # Design notes and implementation guides
│   ├── integrations/       # Integration documentation (WeChat, coupons)
│   └── archived/           # Legacy documentation
├── backend/                 # Legacy Python scripts
├── scripts/                 # Automation scripts (Apps Script, etc.)
├── tests/                   # Playwright tests
└── private/                 # Private data (not committed)
```

## Web Application Features

### Current Features
- **Session Management**: View and manage tutoring sessions with curriculum suggestions
- **Calendar Integration**: Sync test/exam dates from Google Calendar
- **Student Dashboard**: Track student information and session history
- **Exercise Tracking**: Record classwork and homework assignments
- **Homework Completion**: Monitor homework submission and completion status
- **Dark Mode**: System-wide theme support
- **Responsive Design**: Mobile-friendly interface

### Planned Features
- Student enrollment management
- Tutor scheduling and workload tracking
- Payment and financial management
- Attendance tracking and reminders
- Comprehensive reporting dashboards
- User authentication and role-based access

## Development Setup

### Prerequisites
- Python 3.11+
- Node.js 20+
- Access to Google Cloud SQL instance
- Google OAuth credentials
- Google Calendar API key

### Backend Setup

1. Navigate to backend directory:
```bash
cd webapp/backend
```

2. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your credentials
```

5. Run development server:
```bash
uvicorn main:app --reload --port 8000 --host 127.0.0.1
```

API documentation available at: http://localhost:8000/docs

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd webapp/frontend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.local.example .env.local
# Edit .env.local with API endpoint
```

4. Run development server:
```bash
npm run dev
```

Application available at: http://localhost:3000

## Legacy AppSheet System

The AppSheet system handles:
- Student enrollment workflow
- Session generation and scheduling
- Payment tracking and renewals
- Attendance reminders
- Tutor workload management

See `docs/general/` for detailed AppSheet implementation documentation.

## Database

### Schema Overview
- `students` - Student information and contact details
- `tutors` - Tutor profiles and assignments
- `enrollments` - Student enrollment blocks with payment tracking
- `session_log` - Individual tutoring sessions
- `session_exercises` - Classwork and homework assignments
- `homework_completion` - Homework tracking and grading
- `holidays` - Non-working days for scheduling
- `discounts` - Discount codes and amounts
- `calendar_events` - Test/exam dates from Google Calendar

### Migrations
Database migrations are located in `database/migrations/` numbered sequentially.

## Documentation

- **General Documentation**: `docs/general/` - Design notes, terminology, future improvements
- **Integration Guides**: `docs/integrations/` - WeChat, coupon tracking, revenue tracking
- **Archived Docs**: `docs/archived/` - Legacy implementation documentation
- **API Documentation**: http://localhost:8000/docs (when backend is running)

## Security

This is a private repository. Security considerations:
- Environment variables for sensitive credentials
- Google Cloud SQL with IP-based access restrictions
- CORS configured for specific origins only
- Input validation using Pydantic schemas
- Security audit report available (not committed to git)

See `webapp/backend/.env.example` for required security configurations.

## Development Workflow

1. All database changes must include migration scripts in `database/migrations/`
2. Backend changes require Pydantic schema updates in `schemas.py`
3. Frontend changes should follow the existing component structure
4. Test changes using Playwright (tests in `tests/`)

## Project Roadmap

### Phase 1: Foundation ✅
- Database schema design and deployment
- AppSheet application with core workflows
- Google Sheets integration for hybrid workflow

### Phase 2: Web Application (Current)
- FastAPI backend with read/write API endpoints
- Next.js frontend with core features
- Session management and curriculum suggestions
- Calendar integration

### Phase 3: Feature Parity
- Migrate all AppSheet features to web application
- User authentication and authorization
- Financial management and reporting
- Advanced scheduling and automation

### Phase 4: Production Migration
- Complete transition from AppSheet to web application
- User training and documentation
- Performance optimization
- Production deployment

## Related Repositories

- **GitHub Pages Dashboard**: [tutoring-dashboard](https://github.com/kenny1934/tutoring-dashboard) - Public-facing analytics dashboard

## License

Private - All Rights Reserved
