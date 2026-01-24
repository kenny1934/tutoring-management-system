#!/usr/bin/env python3
"""
One-time script to authorize calendar access and get a refresh token.

This uses your existing OAuth credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
to get a refresh token specifically for calendar access.

Usage:
    cd webapp/backend
    pip install google-auth-oauthlib  # if not already installed
    python scripts/authorize_calendar.py

After running, add the printed GOOGLE_CALENDAR_REFRESH_TOKEN to your .env file.
"""

import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
except ImportError:
    print("Error: google-auth-oauthlib not installed.")
    print("Run: pip install google-auth-oauthlib")
    sys.exit(1)

# Try to load from .env file
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv not required if env vars are set

# Get OAuth credentials (same ones used for sign-in)
CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")

if not CLIENT_ID:
    CLIENT_ID = input("Enter GOOGLE_CLIENT_ID: ").strip()
if not CLIENT_SECRET:
    CLIENT_SECRET = input("Enter GOOGLE_CLIENT_SECRET: ").strip()

if not CLIENT_ID or not CLIENT_SECRET:
    print("Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.")
    sys.exit(1)

# Build client config from existing credentials
client_config = {
    "installed": {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": ["http://localhost:8080/"]
    }
}

# Request only calendar events scope
SCOPES = ['https://www.googleapis.com/auth/calendar.events']

print("\n" + "="*60)
print("Google Calendar Authorization")
print("="*60)
print(f"\nCalendar ID (from env): {os.getenv('GOOGLE_CALENDAR_ID', 'Not set - will use default')}")

try:
    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)

    # Generate auth URL
    auth_url, _ = flow.authorization_url(
        access_type='offline',
        prompt='consent'
    )

    print("\n1. Copy and open this URL in your Windows browser:\n")
    print(auth_url)
    print("\n2. Sign in and authorize the app")
    print("3. The browser will redirect to localhost - the server below will catch it")
    print("\nStarting local server on port 8080...")
    print("(Waiting for authorization callback...)\n")

    # This runs a local server that catches the OAuth callback
    creds = flow.run_local_server(
        port=8080,
        open_browser=False,  # Don't try to open browser automatically
        success_message="Authorization successful! You can close this tab."
    )

    print("\n" + "="*60)
    print("SUCCESS! Add this to your .env file:")
    print("="*60)
    print(f"\nGOOGLE_CALENDAR_REFRESH_TOKEN={creds.refresh_token}")
    print("\n" + "="*60)
    print("\nAfter adding to .env, restart your backend server.")
    print("All users will then be able to create/edit/delete calendar events.")

except Exception as e:
    print(f"\nError during authorization: {e}")
    sys.exit(1)
