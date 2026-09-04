#!/usr/bin/env bash
# Entry point for the Windows scheduled task that refreshes School Progress
# from the V: drive every night. Task Scheduler starts it through
#   wsl.exe -d Ubuntu-24.04 -- /path/to/this/rescan_weekly_folders.sh
# and everything else lives in rescan_weekly_folders.py next to it. The repo
# root and the backend venv are found relative to this file, so moving the
# checkout only means re-pointing the task at the new path.
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
exec "$REPO/webapp/backend/venv/bin/python" "$DIR/rescan_weekly_folders.py" "$@"
