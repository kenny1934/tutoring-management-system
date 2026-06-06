/**
 * Client-side scanner for the summer courseware net-drive tree.
 *
 * The courseware share isn't indexed anywhere server-reachable, so the scan
 * happens in the browser: an admin on a centre PC (with the drive mapped)
 * picks the year's Finalised folder and we walk it via the File System
 * Access API, collecting relative paths + mtimes. Classification stays
 * server-side (services/summer_courseware_parser.py).
 *
 * Chrome/Edge only — callers should check isFileSystemAccessSupported()
 * from lib/file-system first.
 */

export interface ScannedFile {
  path: string; // relative to the picked root, "/" separated
  mtime_ms?: number;
}

export interface ScanTreeResult {
  rootName: string;
  files: ScannedFile[];
  truncated: boolean;
}

// Safety rails: the Finalised tree is ~450 files / 4 levels deep. These caps
// only bite when someone picks a far-too-broad folder (e.g. the drive root).
const MAX_FILES = 20_000;
const MAX_DEPTH = 10;

async function walk(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  depth: number,
  out: ScannedFile[],
  onProgress?: (count: number) => void
): Promise<boolean> {
  if (depth > MAX_DEPTH) return false;
  let truncated = false;
  for await (const [name, handle] of dir.entries()) {
    if (out.length >= MAX_FILES) return true;
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "file") {
      let mtime_ms: number | undefined;
      try {
        mtime_ms = (await (handle as FileSystemFileHandle).getFile()).lastModified;
      } catch {
        // Permission hiccup on one file shouldn't sink the scan.
      }
      out.push({ path, mtime_ms });
      if (out.length % 50 === 0) onProgress?.(out.length);
    } else {
      truncated =
        (await walk(handle as FileSystemDirectoryHandle, path, depth + 1, out, onProgress)) ||
        truncated;
    }
  }
  return truncated;
}

/**
 * Prompt for a directory and walk its full tree.
 * Returns null if the user cancels the picker.
 */
export async function pickAndScanTree(
  onProgress?: (count: number) => void
): Promise<ScanTreeResult | null> {
  let root: FileSystemDirectoryHandle;
  try {
    // @ts-expect-error - showDirectoryPicker exists in Chrome/Edge
    root = await window.showDirectoryPicker({ mode: "read" });
  } catch {
    return null; // user cancelled
  }

  const files: ScannedFile[] = [];
  const truncated = await walk(root, "", 0, files, onProgress);
  return { rootName: root.name, files, truncated };
}
