#!/usr/bin/env python3
"""
MC Drive folder + material scraper.

Walks the MC Drive folder tree (mcdrive.mathconcept.com) and dumps everything
to JSON, suitable for seeding prototype demos with realistic folder structures
+ file names. Uses Playwright to drive a real browser so we avoid having to
reimplement Livewire's wire-protocol or maintain its server-side checksums.

Setup (one time):
    pip install playwright
    playwright install chromium

Usage:
    # First run - opens a visible browser; you log in to MC Drive manually,
    # then press Enter in this terminal to save the session.
    python scripts/scrape_mc_drive.py --login

    # Subsequent runs are headless and use the saved session
    python scripts/scrape_mc_drive.py

    # Limit recursion depth (useful for first test runs)
    python scripts/scrape_mc_drive.py --max-depth 2

    # Start from a specific folder id instead of the page's initial view
    python scripts/scrape_mc_drive.py --start-folder 1

Output: scripts/mc-drive-tree.json   (folders + materials, deduped by id)

Run from the repo root:
    python scripts/scrape_mc_drive.py --login
"""

import argparse
import json
import sys
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
except ImportError:
    print("ERROR: playwright is not installed. Run:\n  pip install playwright\n  playwright install chromium", file=sys.stderr)
    sys.exit(1)

BASE_URL = "https://mcdrive.mathconcept.com"
DRIVE_PATH = "/admin/drive"
HERE = Path(__file__).parent
SESSION_FILE = HERE / ".mc-drive-session.json"
DEFAULT_OUTPUT = HERE / "mc-drive-tree.json"


def parse_args():
    p = argparse.ArgumentParser(description="Scrape MC Drive folders + materials to JSON.")
    p.add_argument("--login", action="store_true", help="Interactive login. Saves session for reuse.")
    p.add_argument("--start-folder", type=int, default=None, help="Specific folder id to enter before scraping.")
    p.add_argument("--max-depth", type=int, default=10, help="Recursion depth limit. Default 10.")
    p.add_argument("--start-from-root", action="store_true", help="Click 'MC Drive' breadcrumb to go to root before scraping.")
    p.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--headed", action="store_true", help="Show the browser (for debugging).")
    return p.parse_args()


def interactive_login():
    """Open a visible browser so the user can log in. Persist session state."""
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto(f"{BASE_URL}{DRIVE_PATH}")
        print("\n>>> Log in to MC Drive in the browser window.")
        print(">>> Navigate to the drive page so the session is fully established.")
        print(">>> Then press Enter here to save the session and quit.\n")
        input()
        context.storage_state(path=str(SESSION_FILE))
        browser.close()
        print(f"Session saved to {SESSION_FILE.relative_to(Path.cwd())}")


def extract_state(page):
    """
    Pull the current Livewire snapshot off the page and parse out the
    folder/material/breadcrumb data. Filament Livewire snapshots wrap each
    array entry as [value, {s:'arr'}], so we unwrap.
    """
    snapshot_str = page.evaluate("""
        () => {
            const el = document.querySelector('[wire\\\\:snapshot]');
            return el ? el.getAttribute('wire:snapshot') : null;
        }
    """)
    if not snapshot_str:
        raise RuntimeError("Could not find wire:snapshot on /admin/drive page. Are you logged in?")
    snapshot = json.loads(snapshot_str)
    data = snapshot.get("data", {})

    def unwrap_list(maybe_wrapped):
        """Unwrap Filament's [items, {s:'arr'}] shape into a plain list of objects."""
        if not isinstance(maybe_wrapped, list) or len(maybe_wrapped) == 0:
            return []
        items = maybe_wrapped[0]
        if not isinstance(items, list):
            return []
        result = []
        for entry in items:
            if isinstance(entry, list) and len(entry) > 0 and isinstance(entry[0], dict):
                result.append(entry[0])
            elif isinstance(entry, dict):
                result.append(entry)
        return result

    folders = unwrap_list(data.get("folders", []))
    materials = unwrap_list(data.get("materials", []))
    breadcrumbs = unwrap_list(data.get("breadcrumbs", []))

    current_folder = data.get("currentFolder")
    current_folder_id = None
    if isinstance(current_folder, list) and len(current_folder) > 1 and isinstance(current_folder[1], dict):
        current_folder_id = current_folder[1].get("key")

    return {
        "current_folder_id": current_folder_id,
        "folders": folders,
        "materials": materials,
        "breadcrumbs": breadcrumbs,
    }


def wait_for_livewire(page, timeout_ms=10_000):
    """After a wire:click, the DOM re-renders. networkidle is a reasonable proxy."""
    try:
        page.wait_for_load_state("networkidle", timeout=timeout_ms)
    except PlaywrightTimeout:
        # Sometimes networkidle never settles; give it a beat and continue
        page.wait_for_timeout(500)


def click_folder(page, folder_id):
    selector = f'[wire\\:click="enterFolder({folder_id})"]'
    page.click(selector)
    wait_for_livewire(page)


def click_back(page):
    """goBack returns to parent folder. May not exist if at root."""
    selector = '[wire\\:click="goBack"]'
    if page.locator(selector).count() > 0:
        page.click(selector)
        wait_for_livewire(page)


def click_root(page):
    """goRoot jumps to the topmost folder."""
    selector = '[wire\\:click="goRoot"]'
    if page.locator(selector).count() > 0:
        page.click(selector)
        wait_for_livewire(page)


def scrape(page, max_depth):
    all_folders = {}
    all_materials = {}

    def record_state(state):
        for f in state["folders"]:
            if "id" in f:
                all_folders[f["id"]] = f
        cf_id = state["current_folder_id"]
        for m in state["materials"]:
            mid = m.get("id")
            if mid is None:
                continue
            if "folder_id" not in m:
                m["folder_id"] = cf_id
            all_materials[mid] = m

    def recurse(depth):
        state = extract_state(page)
        record_state(state)
        path = " / ".join(b.get("name", "?") for b in state["breadcrumbs"])
        print(f"{'  '*depth}[{path or '/'}] {len(state['folders'])} subfolders, {len(state['materials'])} files")
        if depth >= max_depth:
            return
        for sub in state["folders"]:
            sub_id = sub.get("id")
            if sub_id is None:
                continue
            click_folder(page, sub_id)
            recurse(depth + 1)
            click_back(page)

    recurse(0)
    return all_folders, all_materials


def main():
    args = parse_args()

    if args.login or not SESSION_FILE.exists():
        if not SESSION_FILE.exists() and not args.login:
            print("No saved session — starting login flow.")
        interactive_login()
        if args.login:
            return

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not args.headed)
        context = browser.new_context(storage_state=str(SESSION_FILE))
        page = context.new_page()
        page.goto(f"{BASE_URL}{DRIVE_PATH}")
        wait_for_livewire(page)

        if args.start_from_root:
            click_root(page)
        if args.start_folder is not None:
            click_folder(page, args.start_folder)

        folders, materials = scrape(page, args.max_depth)
        browser.close()

    output = {
        "_source": "mcdrive.mathconcept.com /admin/drive (scraped via Playwright)",
        "_s3_url_template": "https://imms-fms-sg.s3.ap-southeast-1.amazonaws.com/{s3_path}",
        "_viewer_url_template": "https://mcdrive.mathconcept.com/viewer/pdf-js/generic/web/viewer_readonly.html?file={s3_url_encoded}",
        "folders": sorted(folders.values(), key=lambda f: f["id"]),
        "materials": sorted(materials.values(), key=lambda m: m.get("id", 0)),
    }
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False))
    print(f"\nWrote {len(folders)} folders, {len(materials)} materials → {args.output.relative_to(Path.cwd())}")


if __name__ == "__main__":
    main()
