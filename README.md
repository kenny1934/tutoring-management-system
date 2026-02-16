# Tutoring Management System

A full-stack web application for managing tutoring center operations — student enrollment, session scheduling, attendance tracking, messaging, and reporting.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python, FastAPI, SQLAlchemy, Pydantic |
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS 4 |
| **Database** | MySQL (Google Cloud SQL) |
| **Infra** | Google Cloud Run, GitHub Actions CI/CD |
| **Auth** | Google OAuth 2.0 |

## Features

- **Session Management** — view, create, and manage tutoring sessions with curriculum suggestions and exercise tracking
- **Student Enrollment** — enrollment workflow with fee calculation, discounts, and payment tracking
- **Inbox & Messaging** — chat-style threads with rich text (TipTap), math equations (KaTeX/MathLive), geometry diagrams (JSXGraph), code blocks, scheduled send, snooze, @mentions, voice messages, emoji reactions, and link previews
- **Document Builder** — A4 document editor with math, geometry, and table support for creating worksheets and materials
- **Attendance Tracking** — quick-attend mode, overdue payment alerts, unchecked attendance views
- **Calendar Integration** — Google Calendar sync for test/exam dates with revision planning
- **Revenue & Reporting** — revenue dashboards, tutor workload tracking, and financial summaries
- **Courseware** — structured teaching materials organized by subject and topic
- **Parent Communications** — contact management and message history
- **Dark Mode** — system-wide theme support with responsive, mobile-friendly design
- **What's New** — in-app changelog so users see new features after each release

## Development Setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- Access to a MySQL database
- Google OAuth credentials

### Backend

```bash
cd webapp/backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # Edit with your credentials
uvicorn main:app --reload --port 8000 --host 127.0.0.1
```

API docs available at http://localhost:8000/docs

### Frontend

```bash
cd webapp/frontend
npm install
cp .env.local.example .env.local   # Edit with API endpoint
npm run dev
```

App available at http://localhost:3000

### Running Tests

```bash
# Backend
cd webapp/backend && pytest tests/ -v

# Frontend
cd webapp/frontend && npm run test:run
```

## Project Structure

```
webapp/
├── backend/          # FastAPI application
│   ├── routers/      # API route handlers
│   ├── services/     # Business logic
│   ├── models.py     # SQLAlchemy ORM models
│   └── schemas.py    # Pydantic validation schemas
└── frontend/         # Next.js application
    ├── app/          # Pages and layouts
    ├── components/   # React components
    ├── lib/          # Utilities and API client
    └── types/        # TypeScript definitions
database/
└── migrations/       # Numbered SQL migration scripts
docs/                 # Documentation and integration guides
scripts/              # Automation and utility scripts
```

## License

All Rights Reserved. See [LICENSE](LICENSE) for details.
