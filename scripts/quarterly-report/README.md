# Quarterly Termination Report

Generates quarterly reports showing terminated students and tutor enrollment statistics per location, with optional export to Google Sheets.

## What It Does

1. **Terminated Students List** → "Reasons" tab in Google Sheets
   - ID#, Student, Grade, Instructor, Schedule, LastLesson

2. **Tutor Enrollment Stats** → "Term Rate" tab in Google Sheets
   - Instructor, Opening, Closing (formulas in sheet calculate the rest)

## Prerequisites

1. **Python Virtual Environment**
   ```bash
   # The venv is at:
   webapp/backend/venv/bin/python3
   ```

2. **Google OAuth Setup** (one-time)
   - `client_secrets.json` should be in this folder
   - First run will prompt for browser authentication
   - Token saved to `sheets_token.json` for future runs

## Configuration

Add to `webapp/backend/.env`:

```bash
# Path to OAuth credentials
GOOGLE_SHEETS_CLIENT_SECRETS=scripts/quarterly-report/client_secrets.json

# Google Sheet IDs (from URL: docs.google.com/spreadsheets/d/<ID>/edit)
GOOGLE_SHEET_MSA=your_msa_spreadsheet_id
GOOGLE_SHEET_MSB=your_msb_spreadsheet_id
```

## Usage

Run from project root:

```bash
# Generate CSV reports (queries database)
webapp/backend/venv/bin/python3 scripts/quarterly-report/quarterly_report.py --year 2025 --quarter Q4

# Generate CSV + export to Google Sheets
webapp/backend/venv/bin/python3 scripts/quarterly-report/quarterly_report.py --year 2025 --quarter Q4 --export-sheets

# Export existing CSVs to Google Sheets (no database query)
webapp/backend/venv/bin/python3 scripts/quarterly-report/quarterly_report.py --year 2025 --quarter Q4 --from-csv --export-sheets
```

### Command Options

| Flag | Description |
|------|-------------|
| `--year YYYY` | Year (default: 2025) |
| `--quarter Q1/Q2/Q3/Q4` | Quarter (default: Q4) |
| `--export-sheets` | Also export to Google Sheets |
| `--from-csv` | Load from existing CSV files instead of querying database |

## Adding a New Location

1. Create a new Google Sheet for the location
2. Add tabs named exactly: `Reasons` and `Term Rate`
3. Add the spreadsheet ID to `.env`:
   ```bash
   GOOGLE_SHEET_MSC=new_spreadsheet_id
   ```
4. Run the script - it will auto-detect the new location from the database

## Quarter Definitions

| Quarter | Months | Opening Week | Closing Date |
|---------|--------|--------------|--------------|
| Q1 | Jan-Mar | Jan 1-7 | Mar 31 |
| Q2 | Apr-Jun | Apr 1-7 | Jun 30 |
| Q3 | Jul-Sep | Jul 1-7 | Sep 30 |
| Q4 | Oct-Dec | Oct 1-7 | Dec 31 |

## Google Sheets Column Mapping

### "Reasons" Tab (writes to A:F)
| A | B | C | D | E | F |
|---|---|---|---|---|---|
| ID# | Student | Grade | Instructor | Schedule | LastLesson |

### "Term Rate" Tab (writes to A, B, E only)
| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Instructor | Opening | (formula) | (formula) | Closing | (formula) |

## Troubleshooting

### "Google API libraries not installed"
```bash
webapp/backend/venv/bin/pip install google-auth google-auth-oauthlib google-api-python-client
```

### "OAuth client secrets file not found"
Make sure `GOOGLE_SHEETS_CLIENT_SECRETS` in `.env` points to the correct path.

### Re-authenticate with Google
Delete `sheets_token.json` and run the script again - it will prompt for login.

### Token expired
The script auto-refreshes tokens. If it fails, delete `sheets_token.json` and re-authenticate.

## Files

| File | Purpose |
|------|---------|
| `quarterly_report.py` | Main script |
| `client_secrets.json` | Google OAuth credentials (don't commit to git) |
| `sheets_token.json` | Saved auth token (auto-generated) |
| `quarterly_report_YYYY_QN_LOC.csv` | Generated CSV reports |
