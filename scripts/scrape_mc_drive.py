#!/usr/bin/env python3
"""
MC Drive folder + material scraper.

Walks the MC Drive folder tree (mcdrive.mathconcept.com) and dumps everything
to JSON, suitable for seeding prototype demos with realistic folder structures
+ file names + real S3 paths. Uses Playwright to drive a real browser so we
avoid reimplementing Livewire's wire-protocol or maintaining its server-side
checksums.

How it works (and why the naive approach fails):
    MC Drive is a Filament/Livewire app. On the FIRST page load the folder list
    is inlined into the `wire:snapshot` attribute, but after any navigation that
    attribute is dehydrated to null - so reading the DOM snapshot only ever sees
    the root. Instead we drive the SPA by clicking `wire:click="enterFolder(N)"`
    and capture the `/livewire/update` XHR *response*, which carries the freshly
    hydrated `folders` + `breadcrumbs` (snapshot.data) and the re-rendered file
    table (effects.html). File rows are anchors to the PDF.js viewer whose
    `file=` query param is the full S3 URL, which we decode into an S3 key.

    There is no `goBack` action in MC Drive; we ascend by clicking the parent's
    breadcrumb (`enterFolder(parent_id)`), or `goRoot` from a top-level folder.

Setup (one time):
    pip install playwright
    playwright install chromium

Usage:
    # First run - opens a visible browser; you log in to MC Drive manually,
    # then press Enter in this terminal to save the session.
    python scripts/scrape_mc_drive.py --login

    # Subsequent runs are headless and use the saved session
    python scripts/scrape_mc_drive.py

    # Limit recursion depth (useful for a quick test run)
    python scripts/scrape_mc_drive.py --max-depth 2

    # Start from a specific folder id instead of the root view
    python scripts/scrape_mc_drive.py --start-folder 2

Output: scripts/mc-drive-tree.json   (folders deduped by id, materials by s3_path)
        Saved incrementally during the crawl, so a long run survives interruption.

Run from the repo root.
"""

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
except ImportError:
    print("ERROR: playwright is not installed. Run:\n  pip install playwright\n  playwright install chromium", file=sys.stderr)
    sys.exit(1)

BASE_URL = "https://mcdrive.mathconcept.com"
DRIVE_PATH = "/admin/drive"
S3_URL_TEMPLATE = "https://imms-fms-sg.s3.ap-southeast-1.amazonaws.com/{s3_path}"
VIEWER_URL_TEMPLATE = (
    "https://mcdrive.mathconcept.com/viewer/pdf-js/generic/web/viewer_readonly.html"
    "?file={s3_url_encoded}"
)
HERE = Path(__file__).parent
SESSION_FILE = HERE / ".mc-drive-session.json"
DEFAULT_OUTPUT = HERE / "mc-drive-tree.json"

# A file row in effects.html: an anchor to the PDF.js viewer whose `file=` param
# is the (percent-encoded) S3 URL. Link text is the filename.
MATERIAL_RE = re.compile(
    r'<a\s+[^>]*href="([^"]*viewer_readonly\.html\?file=[^"]*)"[^>]*>(.*?)</a>',
    re.IGNORECASE | re.DOTALL,
)
TAG_RE = re.compile(r"<[^>]+>")


def parse_args():
    p = argparse.ArgumentParser(description="Scrape MC Drive folders + materials to JSON.")
    p.add_argument("--login", action="store_true", help="Interactive login. Saves session for reuse.")
    p.add_argument("--start-folder", type=int, default=None, help="Folder id to enter before scraping (default: root).")
    p.add_argument("--max-depth", type=int, default=99, help="Recursion depth limit. Default 99 (effectively unlimited).")
    p.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    p.add_argument("--headed", action="store_true", help="Show the browser (for debugging).")
    p.add_argument("--save-every", type=int, default=25, help="Flush JSON to disk every N folders visited. Default 25.")
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
        print(f"Session saved to {SESSION_FILE}")


def unwrap_list(maybe_wrapped):
    """Unwrap Filament's [ [ [obj, {s:'arr'}], ... ], {s:'arr'} ] snapshot shape
    into a plain list of dicts."""
    if not isinstance(maybe_wrapped, list) or not maybe_wrapped:
        return []
    items = maybe_wrapped[0]
    if not isinstance(items, list):
        return []
    result = []
    for entry in items:
        if isinstance(entry, list) and entry and isinstance(entry[0], dict):
            result.append(entry[0])
        elif isinstance(entry, dict):
            result.append(entry)
    return result


def s3_path_from_viewer_href(href):
    """viewer_readonly.html?file=<encoded S3 URL>  ->  'MC_Drive/.../file.pdf'."""
    file_param = parse_qs(urlparse(href).query).get("file", [None])[0]
    if not file_param:
        return None, None
    s3_url = file_param  # parse_qs already decoded one layer of percent-encoding
    s3_path = unquote(urlparse(s3_url).path).lstrip("/")
    return s3_path, s3_url


def parse_materials(html, folder_id):
    """Pull file rows out of a folder's rendered HTML."""
    out = []
    for href, raw_name in MATERIAL_RE.findall(html):
        name = TAG_RE.sub("", raw_name).strip()
        s3_path, s3_url = s3_path_from_viewer_href(href)
        if not s3_path:
            continue
        out.append({
            "filename": name or s3_path.rsplit("/", 1)[-1],
            "folder_id": folder_id,
            "s3_path": s3_path,
            "s3_url": s3_url,
            "viewer_url": href,
        })
    return out


def parse_response(resp_json, folder_id):
    """Extract (folders, breadcrumbs, materials) from a /livewire/update response."""
    comp = resp_json["components"][0]
    snap = comp.get("snapshot")
    snap = json.loads(snap) if isinstance(snap, str) else (snap or {})
    data = snap.get("data", {})
    folders = unwrap_list(data.get("folders", []))
    breadcrumbs = unwrap_list(data.get("breadcrumbs", []))
    html = comp.get("effects", {}).get("html", "") or ""
    materials = parse_materials(html, folder_id)
    return folders, breadcrumbs, materials


def click_capture(page, wire_click, timeout=30000):
    """Click a wire:click element and return the parsed /livewire/update response.
    Waits for the element first to ride out any in-flight Livewire DOM morph."""
    selector = f'[wire\\:click="{wire_click}"]'
    page.wait_for_selector(selector, timeout=timeout)
    with page.expect_response(lambda r: "/livewire/update" in r.url, timeout=timeout) as ri:
        page.click(selector)
    return ri.value.json()


def read_initial(page):
    """Read the root view from the first-load wire:snapshot (still hydrated) and
    the initial page HTML."""
    attrs = page.eval_on_selector_all(
        "[wire\\:snapshot]", "els => els.map(e => e.getAttribute('wire:snapshot'))"
    )
    data = {}
    for a in attrs:
        try:
            d = json.loads(a).get("data", {})
        except Exception:
            continue
        if "folders" in d:  # the drive component, not the notifications one
            data = d
            break
    if not data:
        raise RuntimeError("Could not find the drive component's wire:snapshot. Are you logged in?")
    folders = unwrap_list(data.get("folders", []))
    breadcrumbs = unwrap_list(data.get("breadcrumbs", []))
    materials = parse_materials(page.content(), None)
    return folders, breadcrumbs, materials


def main():
    args = parse_args()

    if args.login or not SESSION_FILE.exists():
        if not SESSION_FILE.exists() and not args.login:
            print("No saved session - starting login flow.")
        interactive_login()
        if args.login:
            return

    store = {"folders": {}, "materials": {}}
    visited_count = {"n": 0}

    def save():
        output = {
            "_source": "mcdrive.mathconcept.com /admin/drive (scraped via Playwright)",
            "_s3_url_template": S3_URL_TEMPLATE,
            "_viewer_url_template": VIEWER_URL_TEMPLATE,
            "folders": sorted(store["folders"].values(), key=lambda f: f.get("id", 0)),
            "materials": sorted(store["materials"].values(), key=lambda m: m["s3_path"]),
        }
        args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False))

    def record(folders, materials):
        for f in folders:
            if "id" in f:
                store["folders"][f["id"]] = f
        for m in materials:
            store["materials"][m["s3_path"]] = m

    def walk(page, current_id, depth, folders_here, materials_here, path):
        record(folders_here, materials_here)
        visited_count["n"] += 1
        indent = "  " * depth
        print(f"{indent}[{path or '/'}] {len(folders_here)} subfolders, {len(materials_here)} files "
              f"(running totals: {len(store['folders'])} folders, {len(store['materials'])} files)")
        if visited_count["n"] % args.save_every == 0:
            save()
        if depth >= args.max_depth:
            return
        for child in folders_here:
            cid = child.get("id")
            if cid is None:
                continue
            cname = child.get("name", str(cid))
            try:
                f, b, m = parse_response(click_capture(page, f"enterFolder({cid})"), cid)
            except PlaywrightTimeout:
                print(f"{indent}  !! timeout entering {cname} ({cid}); skipping")
                continue
            walk(page, cid, depth + 1, f, m, f"{path}/{cname}" if path else cname)
            # ascend back to current view via breadcrumb (no goBack action exists)
            try:
                if current_id is None:
                    click_capture(page, "goRoot")
                else:
                    click_capture(page, f"enterFolder({current_id})")
            except PlaywrightTimeout:
                print(f"{indent}  !! timeout returning to parent {current_id}; aborting branch")
                return

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not args.headed)
        context = browser.new_context(storage_state=str(SESSION_FILE))
        page = context.new_page()
        page.goto(f"{BASE_URL}{DRIVE_PATH}")
        page.wait_for_load_state("networkidle", timeout=20000)

        if args.start_folder is not None:
            folders, breadcrumbs, materials = parse_response(
                click_capture(page, f"enterFolder({args.start_folder})"), args.start_folder
            )
            start_id = args.start_folder
            start_path = "/".join(b.get("name", "?") for b in breadcrumbs)
        else:
            folders, breadcrumbs, materials = read_initial(page)
            start_id = None
            start_path = ""

        try:
            walk(page, start_id, 0, folders, materials, start_path)
        except KeyboardInterrupt:
            print("\nInterrupted - saving what we have...")
        finally:
            save()
        browser.close()

    print(f"\nWrote {len(store['folders'])} folders, {len(store['materials'])} materials -> {args.output}")


if __name__ == "__main__":
    main()
