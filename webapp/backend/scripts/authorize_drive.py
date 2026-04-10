#!/usr/bin/env python3
"""
One-time script to authorize Drive metadata access and get a refresh token.

Usage:
    cd webapp/backend
    python scripts/authorize_drive.py

After running, add the printed GOOGLE_DRIVE_REFRESH_TOKEN to your .env file.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
except ImportError:
    print("Error: google-auth-oauthlib not installed.")
    print("Run: pip install google-auth-oauthlib")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")

if not CLIENT_ID:
    CLIENT_ID = input("Enter GOOGLE_CLIENT_ID: ").strip()
if not CLIENT_SECRET:
    CLIENT_SECRET = input("Enter GOOGLE_CLIENT_SECRET: ").strip()

if not CLIENT_ID or not CLIENT_SECRET:
    print("Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.")
    sys.exit(1)

SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly']

print("\n" + "="*60)
print("Google Drive Metadata Authorization")
print("="*60)
print("\nThis grants read-only access to file metadata (names only).")

try:
    from google_auth_oauthlib.flow import InstalledAppFlow

    flow = InstalledAppFlow.from_client_config(
        {
            "installed": {
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": ["http://localhost:8080/"]
            }
        },
        scopes=SCOPES
    )

    auth_url, _ = flow.authorization_url(
        access_type='offline',
        prompt='consent'
    )

    print("\n1. Open this URL in your browser:\n")
    print(auth_url)
    print("\n2. Sign in and authorize the app")
    print("3. The browser will redirect to localhost:8080 — the server below will catch it")
    print("\nStarting local server on port 8080...")
    print("(Waiting for authorization callback...)\n")

    creds = flow.run_local_server(
        port=8080,
        open_browser=False,
        success_message="Authorization successful! You can close this tab."
    )

    print("\n" + "="*60)
    print("SUCCESS! Add this to your .env file:")
    print("="*60)
    print(f"\nGOOGLE_DRIVE_REFRESH_TOKEN={creds.refresh_token}")
    print("\n" + "="*60)

except Exception as e:
    print(f"\nError during authorization: {e}")
    sys.exit(1)
