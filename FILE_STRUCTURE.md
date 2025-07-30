# Project File Structure

This document outlines the organized structure of the CSM Tutoring Management System repository.

## 📁 Directory Organization

```
tutoring-management-system/
├── README.md                    # Main project overview and setup guide
├── TODO.md                      # Current development task list
├── FILE_STRUCTURE.md           # This file - structure documentation
│
├── 📂 database/                 # Database schema and data files
│   ├── init.sql                # Complete database schema with tables, functions, views
│   └── holidays.csv            # Holiday data for session scheduling
│
├── 📂 docs/                     # Project documentation
│   ├── DESIGN_NOTES.md         # Technical architecture and design decisions
│   └── 📂 features/            # Feature-specific documentation
│       ├── assignments_fee_message_system.md    # Google Sheets fee message formulas
│       ├── fee_message_system.md                # AppSheet fee message virtual columns
│       ├── overdue_payment_complete_system.md   # Payment management workflow
│       └── renewal_reminder_system.md           # Automated renewal reminder bot
│
├── 📂 scripts/                  # Automation and utility scripts
│   ├── Code.gs                 # Google Apps Script for session generation
│   └── import_students_script.sh               # Student data import utility
│
└── 📂 templates/               # Message templates and examples
    └── Fee_Message_Template.txt                # Chinese fee message examples
```

## 📋 File Categories

### Core Project Files (Root)
- **README.md** - Project overview, technology stack, and phase status
- **TODO.md** - Current development priorities and task tracking
- **FILE_STRUCTURE.md** - This organizational guide

### Database Layer (`/database/`)
- **init.sql** - Complete MySQL schema including tables, functions, and views
- **holidays.csv** - Holiday calendar data for session scheduling logic

### Documentation (`/docs/`)
- **DESIGN_NOTES.md** - Technical architecture, design decisions, and system rationale
- **features/** - Detailed implementation guides for each major system component

### Automation (`/scripts/`)
- **Code.gs** - Google Apps Script for automated session generation (deployed to Google environment)
- **import_students_script.sh** - Utility for student data synchronization

### Resources (`/templates/`)
- **Fee_Message_Template.txt** - Reference templates for fee communication

## 🔄 Development Workflow

1. **Planning**: Check `TODO.md` for current priorities
2. **Architecture**: Refer to `docs/DESIGN_NOTES.md` for system design
3. **Features**: Use `docs/features/` for implementation details
4. **Database**: Deploy `database/init.sql` for schema updates
5. **Automation**: Deploy `scripts/Code.gs` to Google Apps Script environment

## 📝 Documentation Standards

- **Feature docs** should include implementation steps, testing procedures, and troubleshooting
- **Code examples** should be complete and copy-pasteable
- **File references** should use relative paths from project root
- **Updates** should maintain backward compatibility where possible