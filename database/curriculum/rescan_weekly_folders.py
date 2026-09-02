"""Re-scan the V: drive and refresh everything School Progress reads from it.

The weekly prep folders on the V: drive are the main evidence for the school
timelines and the whole source of the revision paper archive. The pipeline
scripts read them from a snapshot, private/curriculum_data/drive_trees/
tree_v_secondary.txt, rather than from the drive itself, so the snapshot has
to be retaken as tutors file new work. This script does the whole refresh in
one go, and it is what the Windows scheduled task runs every night:

  1. list every file under V:\\Secondary through PowerShell (the drive is a
     Windows mapping, only reachable from this machine, so the job cannot
     live on Cloud Run),
  2. keep the four roots the snapshot has always covered and drop the rest
     (Archived holds folders that were moved with their old week numbers,
     and 教案 and 講義 are lesson plans, so they would pollute the timelines),
  3. compare the listing with the current snapshot and refuse to continue
     if too many files have vanished, because backfill_rev_papers deletes
     archive rows for files that are no longer in the tree and a half-read
     drive would take the archive down with it,
  4. write the new snapshot, keeping a dated copy of the old one,
  5. run the three backfills that read the tree: the content map, the school
     timelines and the revision paper archive. Each is idempotent and runs
     as its own process, so one failing does not stop the others.

Everything is logged to private/curriculum_data/rescan_logs/, one file per
run plus latest.log, and the exit code tells the scheduler how it went:
0 for success, 2 when the vanished-files guard stopped the run, 1 for any
other failure.

Usage (from the repo root, with the backend venv):
    webapp/backend/venv/bin/python database/curriculum/rescan_weekly_folders.py
        [--dry-run]           scan and check, then run the backfills in their
                              own dry-run mode against the EXISTING snapshot
                              (the new listing is not written)
        [--skip-scan]         skip the drive and just run the backfills on
                              the snapshot already on disk
        [--force]             go ahead even when the vanished-files guard
                              trips, for example after a year-end tidy-up
                              that moved whole folders into Archived
        [--max-vanished N]    guard threshold in files (default 100, or 1%
                              of the old snapshot if that is larger)

The AI passes (ai_map_rev_papers.py, ai_map_exam_scopes.py) are deliberately
not part of this: they need a person to review the mapping file before it is
written, so they stay manual.

Scheduling: rescan_weekly_folders.sh next to this file is the entry point for
Windows Task Scheduler, registered from windows_task_rescan.xml. The task must
run in the logged-on user's session, because a mapped drive letter only
exists inside the session that mapped it.
"""
import argparse
import datetime as dt
import os
import re
import subprocess
import sys
import time
from collections import Counter

from _common import PRIV, REPO_ROOT  # noqa: E402  (sets sys.path + .env)

POWERSHELL = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
DRIVE_ROOT = "V:\\Secondary"
# The subfolders the snapshot covers. Everything else under V:\Secondary is
# left out on purpose (see the module docstring).
ROOTS = ("Finalised", "Summer Course", "題庫", "題庫 (分章節)")
TREE_DIR = os.path.join(PRIV, "drive_trees")
TREE_V = os.path.join(TREE_DIR, "tree_v_secondary.txt")
LOG_DIR = os.path.join(PRIV, "rescan_logs")
LOCK = os.path.join(LOG_DIR, ".rescan.lock")
BACKFILLS = (
    "backfill_courseware.py",
    "backfill_observations.py",
    "backfill_rev_papers.py",
)
KEEP_SNAPSHOTS = 14
KEEP_LOGS = 60
SCAN_TIMEOUT = 20 * 60
BACKFILL_TIMEOUT = 30 * 60
STALE_LOCK_SECONDS = 4 * 3600
WEEK_FOLDER_RE = re.compile(r"\\(\d{4}-\d{4})\\(\d+)周目")


class Log:
    """Print to stdout (Task Scheduler keeps that) and append to the run's log file."""

    def __init__(self, path):
        self.path = path
        self.f = open(path, "a", encoding="utf-8")

    def __call__(self, msg=""):
        stamp = dt.datetime.now().strftime("%H:%M:%S")
        line = f"[{stamp}] {msg}" if msg else ""
        print(line, flush=True)
        self.f.write(line + "\n")
        self.f.flush()

    def raw(self, text):
        """Append a block of subprocess output unchanged."""
        self.f.write(text)
        if text and not text.endswith("\n"):
            self.f.write("\n")
        self.f.flush()

    def close(self):
        self.f.close()


def current_school_year(today=None):
    today = today or dt.date.today()
    start = today.year if today.month >= 9 else today.year - 1
    return f"{start}-{start + 1}"


def acquire_lock():
    """One run at a time. A lock older than a few hours is a crashed run, not a live one."""
    os.makedirs(LOG_DIR, exist_ok=True)
    if os.path.exists(LOCK) and time.time() - os.path.getmtime(LOCK) > STALE_LOCK_SECONDS:
        os.remove(LOCK)
    try:
        fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        return False
    with os.fdopen(fd, "w") as f:
        f.write(f"{os.getpid()} {dt.datetime.now().isoformat()}\n")
    return True


def release_lock():
    try:
        os.remove(LOCK)
    except FileNotFoundError:
        pass


def scan_drive(log):
    """Full file listing of the drive root, as the snapshot has always taken it."""
    cmd = (
        "[Console]::OutputEncoding=[Text.Encoding]::UTF8; "
        f"Get-ChildItem '{DRIVE_ROOT}' -Recurse -File | Select-Object -ExpandProperty FullName"
    )
    log(f"Scanning {DRIVE_ROOT} through PowerShell...")
    t0 = time.time()
    try:
        proc = subprocess.run(
            [POWERSHELL, "-NoProfile", "-Command", cmd],
            capture_output=True,
            timeout=SCAN_TIMEOUT,
        )
    except FileNotFoundError:
        log(f"ERROR PowerShell not found at {POWERSHELL}. This has to run inside WSL on the machine that maps the drive.")
        return None
    except subprocess.TimeoutExpired:
        log(f"ERROR the scan did not finish within {SCAN_TIMEOUT // 60} minutes.")
        return None
    lines = [
        l.rstrip("\r").strip()
        for l in proc.stdout.decode("utf-8-sig", errors="replace").split("\n")
    ]
    lines = [l for l in lines if l]
    err = proc.stderr.decode("utf-8", errors="replace").strip()
    log(f"Scan finished in {time.time() - t0:.0f}s with {len(lines)} files (exit {proc.returncode}).")
    if err:
        log("PowerShell reported:")
        log.raw(err[:2000])
    if proc.returncode != 0 or not lines:
        log("ERROR the drive listing is empty or the scan failed. Is the V: drive mapped and reachable?")
        return None
    return lines


def filter_roots(lines):
    prefixes = tuple(f"{DRIVE_ROOT}\\{r}\\" for r in ROOTS)
    kept = [l for l in lines if l.startswith(prefixes)]
    per_root = Counter()
    for l in kept:
        for r in ROOTS:
            if l.startswith(f"{DRIVE_ROOT}\\{r}\\"):
                per_root[r] += 1
                break
    return kept, per_root


def read_snapshot(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        return [l.rstrip("\r\n").strip() for l in f if l.strip()]


def second_level(path):
    m = re.match(r"^[A-Z]:\\[^\\]+\\([^\\]+)\\([^\\]+)", path)
    return f"{m.group(1)}\\{m.group(2)}" if m else path


def write_snapshot(new_lines, log):
    """Back the old snapshot up by date, then replace it atomically."""
    os.makedirs(TREE_DIR, exist_ok=True)
    if os.path.exists(TREE_V):
        backup = os.path.join(TREE_DIR, f"tree_v_secondary.{dt.date.today().isoformat()}.txt")
        os.replace(TREE_V, backup)
        log(f"Previous snapshot kept as {os.path.basename(backup)}.")
    tmp = TREE_V + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write("\r\n".join(new_lines) + "\r\n")
    os.replace(tmp, TREE_V)
    log(f"Snapshot written: {len(new_lines)} files.")
    prune(TREE_DIR, r"^tree_v_secondary\.\d{4}-\d{2}-\d{2}\.txt$", KEEP_SNAPSHOTS)


def prune(folder, pattern, keep):
    rx = re.compile(pattern)
    names = sorted(n for n in os.listdir(folder) if rx.match(n))
    for n in names[:-keep] if len(names) > keep else []:
        os.remove(os.path.join(folder, n))


def run_backfill(name, dry_run, log):
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), name)
    args = [sys.executable, script] + (["--dry-run"] if dry_run else [])
    log(f"--- {name}{' (dry run)' if dry_run else ''}")
    t0 = time.time()
    try:
        proc = subprocess.run(
            args, cwd=REPO_ROOT, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=BACKFILL_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        log(f"FAILED {name}: no result within {BACKFILL_TIMEOUT // 60} minutes.")
        return False
    log.raw(proc.stdout)
    if proc.stderr.strip():
        log.raw(proc.stderr)
    ok = proc.returncode == 0
    log(f"{'OK    ' if ok else 'FAILED'} {name} in {time.time() - t0:.0f}s (exit {proc.returncode}).")
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--skip-scan", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--max-vanished", type=int, default=100)
    args = ap.parse_args()

    os.makedirs(LOG_DIR, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y-%m-%d-%H%M")
    log = Log(os.path.join(LOG_DIR, f"rescan-{stamp}.log"))
    log(f"School Progress re-scan starting ({'dry run' if args.dry_run else 'live'}).")

    if not acquire_lock():
        log("Another re-scan is still running (lock present). Leaving.")
        return 1
    started = time.time()
    exit_code = 0
    try:
        if not args.skip_scan:
            raw = scan_drive(log)
            if raw is None:
                return 1
            new, per_root = filter_roots(raw)
            log("Kept per root: " + ", ".join(f"{r} {per_root[r]}" for r in ROOTS))
            missing = [r for r in ROOTS if per_root[r] == 0]
            if missing and not args.force:
                log(f"ERROR nothing found under {', '.join(missing)}. The drive looks only partly readable, so the snapshot is left untouched.")
                return 2

            old = read_snapshot(TREE_V)
            old_set, new_set = set(old), set(new)
            added, vanished = sorted(new_set - old_set), sorted(old_set - new_set)
            log(f"Compared with the snapshot: {len(old)} before, {len(new)} now, {len(added)} added, {len(vanished)} vanished.")
            if added:
                for folder, n in Counter(second_level(l) for l in added).most_common(8):
                    log(f"  added    {n:5d}  {folder}")
            if vanished:
                for folder, n in Counter(second_level(l) for l in vanished).most_common(8):
                    log(f"  vanished {n:5d}  {folder}")
            threshold = max(args.max_vanished, len(old) // 100)
            if old and len(vanished) > threshold and not args.force:
                log(f"STOPPED {len(vanished)} files vanished, above the guard of {threshold}. "
                    "If folders were really moved or deleted, run again with --force. "
                    "The snapshot and the database were left untouched.")
                return 2

            year = current_school_year()
            weeks = sorted(
                {int(m.group(2)) for l in new for m in [WEEK_FOLDER_RE.search(l)] if m and m.group(1) == year}
            )
            this_year = sum(1 for l in new if f"\\{year}\\" in l)
            log(f"This school year ({year}): {this_year} files, weekly folders seen: "
                + (", ".join(str(w) for w in weeks) if weeks else "none yet") + ".")

            if args.dry_run:
                log("Dry run: the new listing is not written, so the backfills below read the existing snapshot.")
            else:
                write_snapshot(new, log)
        else:
            log("Scan skipped; using the snapshot already on disk.")

        results = {name: run_backfill(name, args.dry_run, log) for name in BACKFILLS}
        failed = [n for n, ok in results.items() if not ok]
        if failed:
            log(f"Finished with failures: {', '.join(failed)}.")
            exit_code = 1
        else:
            log("All backfills finished.")
    finally:
        release_lock()
        log(f"Done in {(time.time() - started) / 60:.1f} min, exit {exit_code}.")
        log.close()
        latest = os.path.join(LOG_DIR, "latest.log")
        try:
            if os.path.lexists(latest):
                os.remove(latest)
            os.symlink(os.path.basename(log.path), latest)
        except OSError:
            pass
        prune(LOG_DIR, r"^rescan-\d{4}-\d{2}-\d{2}-\d{4}\.log$", KEEP_LOGS)
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
