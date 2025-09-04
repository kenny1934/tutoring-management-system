# Database Migrations

This folder contains database migrations for the tutoring management system.

## Migration Order

1. **001_initial_schema** - Base tables (in init.sql)
2. **002_teaching_playbook_schema.sql** - Enhanced curriculum + exercise tracking system
3. **003_curriculum_live_view.sql** - Live curriculum view with real-time updates

## Current Architecture

### Core Tables
- `curriculum_entries` - Tracks what topics are taught
- `exercise_materials` - Tracks which materials/exercises are used
- `curriculum_contributions` - Records tutor confirmations and ratings

### Views
- `session_curriculum_suggestions` - Shows 3-week curriculum references (historical only)
- `session_curriculum_suggestions_live` - Shows real-time + historical curriculum data
- `teaching_playbook` - Complete playbook with topics + materials + statistics

## To Apply Migrations

```sql
-- Apply teaching playbook schema
SOURCE database/migrations/002_teaching_playbook_schema.sql;

-- Apply live curriculum view
SOURCE database/migrations/003_curriculum_live_view.sql;
```

## Status
- ✅ Historical curriculum data (2024-2025) imported
- ✅ Basic curriculum reference working in AppSheet
- 🚧 Teaching Playbook schema designed
- ⏳ Web service for real-time updates pending