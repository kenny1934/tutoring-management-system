# Database Connection Guide

## Successful Connection Method (Direct Connection with IP Allowlisting)

### Prerequisites
1. Google Cloud CLI installed and authenticated
2. MySQL client installed
3. Access to the database project

### Steps to Connect

1. **Allowlist your IP (Required every time)**
   ```bash
   gcloud sql connect [INSTANCE_NAME] --user=[USERNAME] --project=[PROJECT_ID]
   ```
   Wait for: "Allowlisting your IP for incoming connection for 5 minutes...done"

2. **Run the report within 5 minutes**
   ```bash
   python interactive_report.py --refresh
   ```
   - Enter credentials when prompted
   - The script uses direct connection

### Configuration
The actual connection details should be stored in a local `.env` file (NOT committed to git):
```
DB_HOST=xxx.xxx.xxx.xxx
DB_PORT=3306
DB_NAME=database_name
DB_PROJECT=project-id
DB_INSTANCE=instance-name
```

### Why This Works
- Uses direct IP connection (not proxy)
- SSL disabled to avoid wrap_socket errors
- IP allowlisting provides security
- 5-minute window is sufficient for data loading

### Troubleshooting
- If connection fails, ensure IP is allowlisted (step 1)
- Use `--cache` flag to avoid database connection when possible
- Cache expires after 24 hours

### Connection Settings Used
```python
connection = mysql.connector.connect(
    host=config['database']['host'],           # From config.json
    port=config['database']['port'],           # Default: 3306
    user=user,                                # Entered at runtime
    password=password,                        # Entered at runtime
    database=config['database']['database'],  # From config.json
    connection_timeout=30,
    autocommit=True,
    raise_on_warnings=False,
    ssl_disabled=True,                        # Critical for avoiding SSL errors
    auth_plugin='mysql_native_password'       # Ensures compatibility
)
```

### Security Notes
- Never commit actual connection details to the repository
- Use IP allowlisting rather than public access
- Connection window is limited to 5 minutes for security
- All sensitive data is excluded from generated reports