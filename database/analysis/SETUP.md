# Setup Instructions

## Initial Setup

1. **Clone the repository**
   ```bash
   git clone [repository-url]
   cd tutoring-management-system/database/analysis
   ```

2. **Copy config template**
   ```bash
   cp config.template.json config.json
   ```

3. **Edit config.json with your actual values**
   - Replace `REPLACE_WITH_ACTUAL_HOST` with your database IP
   - Replace `REPLACE_WITH_DB_NAME` with your database name
   - ⚠️ **DO NOT commit config.json with real values** - it's gitignored for security

4. **Install dependencies**
   ```bash
   pip install mysql-connector-python pandas openpyxl pathlib
   ```

## Running Reports

### For Development (with database access)

Contact the database administrator for:
- Database host IP address
- Database name
- Connection credentials
- Google Cloud project ID and instance name

Then follow the CONNECTION_GUIDE.md for connection steps.

### For Cached Operation (recommended)
```bash
# Use cached data (no database connection needed)
python interactive_report.py --cache

# Check cache status
python interactive_report.py --cache-info
```

### For Fresh Data
```bash
# Force refresh from database (requires connection)
python interactive_report.py --refresh
```

## File Structure

```
database/analysis/
├── interactive_report.py        # Main report generator
├── cache_manager.py            # Cache system
├── config.json                 # Configuration (gitignored)
├── config.template.json        # Safe template
├── load_summer_data.py         # Data loader utility
├── summer_conversion_analysis.sql  # SQL documentation
├── setup_gcloud.sh             # Google Cloud setup
├── CONNECTION_GUIDE.md         # Connection instructions
├── SETUP.md                    # This file
├── cache/                      # Cache directory (gitignored)
├── reports/                    # Generated reports (gitignored)
└── conversion_results.csv      # Analysis data
```

## Security Notes

- `config.json` contains sensitive data and is gitignored
- All generated reports are privacy-safe (no PII)
- Cache files may contain student data and are gitignored
- Only commit sanitized template and documentation files

## For GitHub Pages (Public Viewing)

The generated HTML reports are automatically sanitized and contain no sensitive data, making them safe for public hosting.

Access the public dashboard at: `[your-github-pages-url]/summer-conversion-report.html`

## Troubleshooting

### Database Connection Issues
1. Ensure IP is allowlisted via `gcloud sql connect` command
2. Check that SSL is disabled in connection settings
3. Verify credentials and connection timeout settings

### Permission Issues
- Ensure you have read/write access to the cache and reports directories
- Check that Python has necessary permissions to create files

### Missing Dependencies
```bash
pip install --upgrade mysql-connector-python pandas openpyxl
```

## Support

For database access or technical issues, contact the system administrator.