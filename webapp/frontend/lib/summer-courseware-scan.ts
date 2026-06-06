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

import {
  pickDirectory,
  openFileInNewTab,
  navigateToFile,
  type FileOperationError,
} from "./file-system";

export interface ScannedFile {
  path: string; // relative to the picked root, "/" separated
  mtime_ms?: number;
}

export interface ScanTreeResult {
  rootName: string;
  handle: FileSystemDirectoryHandle;
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
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return true;

  const files: [string, FileSystemFileHandle][] = [];
  const dirs: [string, FileSystemDirectoryHandle][] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === "file") files.push([name, handle as FileSystemFileHandle]);
    else dirs.push([name, handle as FileSystemDirectoryHandle]);
  }

  // On a network share each getFile() is a per-file stat, so do them
  // concurrently — serially this is the slowest step of the whole scan.
  await Promise.all(
    files.map(async ([name, handle]) => {
      if (out.length >= MAX_FILES) return;
      let mtime_ms: number | undefined;
      try {
        mtime_ms = (await handle.getFile()).lastModified;
      } catch {
        // Permission hiccup on one file shouldn't sink the scan.
      }
      out.push({ path: prefix ? `${prefix}/${name}` : name, mtime_ms });
      if (out.length % 50 === 0) onProgress?.(out.length);
    })
  );
  if (out.length >= MAX_FILES) return true;

  const results = await Promise.all(
    dirs.map(([name, handle]) =>
      walk(handle, prefix ? `${prefix}/${name}` : name, depth + 1, out, onProgress)
    )
  );
  return results.some(Boolean);
}

/**
 * Prompt for a directory and walk its full tree.
 * Returns null if the user cancels the picker.
 */
export async function pickAndScanTree(
  onProgress?: (count: number) => void
): Promise<ScanTreeResult | null> {
  const root = await pickDirectory();
  if (!root) return null;

  const files: ScannedFile[] = [];
  const truncated = await walk(root, "", 0, files, onProgress);
  return { rootName: root.name, handle: root, files, truncated };
}

// ============================================================================
// Root handle persistence — lets the index open PDFs straight from the
// mapped drive later (admin panel previews, lesson mode defaults) without
// re-picking the folder. One handle per year per machine.
//
// Deliberately a separate store from file-system.ts's saved folders: those
// feed user-facing folder lists in Settings, and a synthetic per-year entry
// would pollute them.
// ============================================================================

const DB_NAME = "summer-courseware";
const DB_VERSION = 1;
const ROOTS_STORE = "roots";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(ROOTS_STORE)) {
        db.createObjectStore(ROOTS_STORE, { keyPath: "year" });
      }
    };
  });
}

export async function saveRootHandle(
  year: number,
  handle: FileSystemDirectoryHandle
): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ROOTS_STORE, "readwrite");
      const request = tx.objectStore(ROOTS_STORE).put({ year, handle });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      tx.oncomplete = () => db.close();
    });
  } catch {
    // Persistence is best-effort; chips just won't open until reconnected.
  }
}

export async function getRootHandle(
  year: number
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(ROOTS_STORE, "readonly");
      const request = tx.objectStore(ROOTS_STORE).get(year);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result?.handle ?? null);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

/**
 * Pick a folder and store it as the year's courseware root without scanning.
 * For machines other than the one that did the scan. Light sanity check:
 * the Finalised folder should contain F1-F3 subfolders.
 */
export async function connectRootHandle(
  year: number
): Promise<"connected" | "cancelled" | "wrong_folder"> {
  const root = await pickDirectory();
  if (!root) return "cancelled";
  let looksRight = false;
  try {
    for await (const [name, handle] of root.entries()) {
      if (handle.kind === "directory" && /^F[1-6]$/.test(name)) {
        looksRight = true;
        break;
      }
    }
  } catch {
    // Listing failed — treat as wrong folder rather than guessing.
  }
  if (!looksRight) return "wrong_folder";
  await saveRootHandle(year, root);
  return "connected";
}

export type OpenCoursewareError = FileOperationError | "no_handle" | "open_failed";

/**
 * Open an indexed courseware PDF in a new tab, navigating the stored root
 * handle by the file's rel_path (backslash-separated, as stored server-side).
 */
export async function openCoursewareFile(
  year: number,
  relPath: string
): Promise<OpenCoursewareError | null> {
  const root = await getRootHandle(year);
  if (!root) return "no_handle";
  // navigateToFile verifies (and re-requests) permission itself.
  const result = await navigateToFile(root, relPath.split("\\").filter(Boolean));
  if (!result.success) return result.error;
  return (await openFileInNewTab(result.handle)) ? null : "open_failed";
}
