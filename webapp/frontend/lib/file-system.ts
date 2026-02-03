/**
 * File System Access API utilities for browsing local/NAS files.
 * Supports multiple source folders with persistence in IndexedDB.
 * Only works in Chrome/Edge - check isFileSystemAccessSupported() before use.
 */

import { parsePageRange, extractPagesForPrint, extractBulkPagesForPrint, extractBulkPagesForDownload, PrintStampInfo, BulkPrintItem } from './pdf-utils';
import { getPageNumbers, fetchPdfData, BulkPrintExercise, FileSystemUtils } from './bulk-pdf-helpers';
import { searchAnswerFile } from './answer-file-utils';

export type { PrintStampInfo, BulkPrintItem } from './pdf-utils';
export type { BulkPrintExercise } from './bulk-pdf-helpers';

// Create file system utilities object for bulk operations
// This avoids circular imports between file-system.ts and bulk-pdf-helpers.ts
const createFsUtils = (): FileSystemUtils => ({
  isSupported: isFileSystemAccessSupported,
  getFileHandle: getFileHandleFromPath,
  getCachedDocId: getCachedPaperlessDocumentId,
  setCachedDocId: setPaperlessPathCache,
});

// Extend FileSystemDirectoryHandle with methods not in default TypeScript lib.dom.d.ts
declare global {
  interface FileSystemDirectoryHandle {
    queryPermission(options?: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission(options?: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>;
  }
}

const DB_NAME = 'file-system-access';
const DB_VERSION = 3; // Bumped for path mappings
const FOLDERS_STORE = 'folders';
const PATH_MAPPINGS_STORE = 'path-mappings';

/**
 * Saved folder with its handle and metadata.
 */
export interface SavedFolder {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  isShared?: boolean;  // true = from path mapping (shared drive), false/undefined = personal folder
}

/**
 * Path mapping from alias to local drive path.
 * Users configure these to map admin-defined aliases to their local drives.
 */
export interface PathMapping {
  alias: string;      // e.g., "Center" (admin-defined)
  drivePath: string;  // e.g., "Z:" (user's local drive)
}

/**
 * Check if the File System Access API is supported in this browser.
 */
export const isFileSystemAccessSupported = (): boolean =>
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/**
 * Open IndexedDB for storing folder handles.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // Create folders store if it doesn't exist
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        db.createObjectStore(FOLDERS_STORE, { keyPath: 'id' });
      }
      // Create path mappings store if it doesn't exist
      if (!db.objectStoreNames.contains(PATH_MAPPINGS_STORE)) {
        db.createObjectStore(PATH_MAPPINGS_STORE, { keyPath: 'alias' });
      }
      // Clean up old store if exists
      if (db.objectStoreNames.contains('handles')) {
        db.deleteObjectStore('handles');
      }
    };
  });
}

/**
 * Generate a unique ID for a folder.
 */
function generateId(): string {
  return `folder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all saved folders from IndexedDB.
 */
export async function getSavedFolders(): Promise<SavedFolder[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FOLDERS_STORE, 'readonly');
      const store = tx.objectStore(FOLDERS_STORE);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return [];
  }
}

/**
 * Check if we still have permission to access a directory.
 */
export async function verifyPermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'read'
): Promise<boolean> {
  try {
    const options = { mode };
    if ((await handle.queryPermission(options)) === 'granted') {
      return true;
    }
    if ((await handle.requestPermission(options)) === 'granted') {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Prompt user to select a new folder and add it to the saved list.
 */
export async function addFolder(): Promise<SavedFolder | null> {
  if (!isFileSystemAccessSupported()) {
    return null;
  }

  try {
    // @ts-expect-error - showDirectoryPicker exists in Chrome/Edge
    const handle = await window.showDirectoryPicker({
      mode: 'read',
    });

    const folder: SavedFolder = {
      id: generateId(),
      name: handle.name,
      handle,
    };

    // Save to IndexedDB
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FOLDERS_STORE, 'readwrite');
      const store = tx.objectStore(FOLDERS_STORE);
      const request = store.put(folder);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      tx.oncomplete = () => db.close();
    });

    return folder;
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.error('Failed to add folder:', err);
    }
    return null;
  }
}

/**
 * Prompt user to select a folder and add it as a shared drive with a specific name.
 * Used when granting access to path-mapped drives from Settings.
 */
export async function addSharedFolder(name: string): Promise<SavedFolder | null> {
  if (!isFileSystemAccessSupported()) {
    return null;
  }

  try {
    // @ts-expect-error - showDirectoryPicker exists in Chrome/Edge
    const handle = await window.showDirectoryPicker({
      mode: 'read',
    });

    const folder: SavedFolder = {
      id: generateId(),
      name,  // Use the provided canonical name
      handle,
      isShared: true,
    };

    // Save to IndexedDB
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FOLDERS_STORE, 'readwrite');
      const store = tx.objectStore(FOLDERS_STORE);
      const request = store.put(folder);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      tx.oncomplete = () => db.close();
    });

    return folder;
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.error('Failed to add shared folder:', err);
    }
    return null;
  }
}

/**
 * Update a folder's display name.
 */
export async function updateFolderName(id: string, newName: string): Promise<void> {
  try {
    const db = await openDB();
    const folders = await getSavedFolders();
    const folder = folders.find(f => f.id === id);
    if (folder) {
      folder.name = newName;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(FOLDERS_STORE, 'readwrite');
        const store = tx.objectStore(FOLDERS_STORE);
        const request = store.put(folder);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
        tx.oncomplete = () => db.close();
      });
    }
  } catch (err) {
    console.error('Failed to update folder name:', err);
  }
}

/**
 * Check if a folder name looks like a root drive (e.g., "\\" or empty).
 */
export function isRootDriveName(name: string): boolean {
  return !name || name === '\\' || name === '/';
}

/**
 * Remove a folder from the saved list.
 */
export async function removeFolder(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FOLDERS_STORE, 'readwrite');
      const store = tx.objectStore(FOLDERS_STORE);
      const request = store.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.error('Failed to remove folder:', err);
  }
}

/**
 * Recursively find the path from root to a file handle.
 */
async function findPath(
  rootHandle: FileSystemDirectoryHandle,
  targetHandle: FileSystemFileHandle,
  currentPath: string = ''
): Promise<string | null> {
  try {
    for await (const [name, handle] of rootHandle.entries()) {
      if (handle.kind === 'file') {
        if (await handle.isSameEntry(targetHandle)) {
          return currentPath ? `${currentPath}\\${name}` : name;
        }
      } else if (handle.kind === 'directory') {
        const subPath = currentPath ? `${currentPath}\\${name}` : name;
        const found = await findPath(handle as FileSystemDirectoryHandle, targetHandle, subPath);
        if (found) {
          return found;
        }
      }
    }
  } catch {
    // Permission error or other issue
  }
  return null;
}

/**
 * Get the relative path from a directory handle to a file.
 */
async function getRelativePath(
  rootHandle: FileSystemDirectoryHandle,
  fileHandle: FileSystemFileHandle
): Promise<string | null> {
  // First try the native resolve method (Chrome 122+)
  try {
    const pathParts = await rootHandle.resolve(fileHandle);
    if (pathParts) {
      return pathParts.join('\\');
    }
  } catch {
    // Fall back to manual search
  }
  // Manual recursive search
  return findPath(rootHandle, fileHandle);
}

/**
 * Pick a file from a specific folder.
 * Returns the full path including folder name.
 */
export async function pickFileFromFolder(
  folder: SavedFolder
): Promise<{ path: string; name: string; handle: FileSystemFileHandle } | null> {
  if (!isFileSystemAccessSupported()) {
    return null;
  }

  // Verify we still have permission
  const hasPermission = await verifyPermission(folder.handle);
  if (!hasPermission) {
    return null;
  }

  try {
    // Open file picker starting in the selected folder
    // @ts-expect-error - showOpenFilePicker exists in Chrome/Edge
    const [fileHandle] = await window.showOpenFilePicker({
      startIn: folder.handle,
      types: [
        {
          description: 'PDF files',
          accept: { 'application/pdf': ['.pdf'] },
        },
      ],
      multiple: false,
    });

    // Get relative path within the folder
    const relativePath = await getRelativePath(folder.handle, fileHandle);

    if (relativePath) {
      // Include folder name in path
      return {
        path: `${folder.name}\\${relativePath}`,
        name: fileHandle.name,
        handle: fileHandle,
      };
    }

    // File might be outside this folder - just use folder name + filename
    return {
      path: `${folder.name}\\${fileHandle.name}`,
      name: fileHandle.name,
      handle: fileHandle,
    };
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.error('Failed to pick file:', err);
    }
    return null;
  }
}

/**
 * Clear all saved folders.
 */
export async function clearAllFolders(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FOLDERS_STORE, 'readwrite');
      const store = tx.objectStore(FOLDERS_STORE);
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      tx.oncomplete = () => db.close();
    });
  } catch {
    // Ignore errors
  }
}

/**
 * Error type for file operations.
 */
export type FileOperationError = 'not_supported' | 'folder_not_found' | 'file_not_found' | 'permission_denied';

/**
 * Result type for file operations.
 */
export type FileOperationResult =
  | { success: true; handle: FileSystemFileHandle }
  | { success: false; error: FileOperationError };

/**
 * Get a file handle from a saved path string.
 * Path format: "FolderName\relative\path\to\file.pdf" or "[Alias]\relative\path\file.pdf"
 *
 * Supports:
 * - Direct folder name: "MyFolder\path\file.pdf" (looks up saved folder "MyFolder")
 * - Path alias with brackets: "[MSA Staff]\path\file.pdf" (uses path mapping to translate alias)
 * - Path alias without brackets: "MSA Staff\path\file.pdf" (uses path mapping if alias exists)
 */
export async function getFileHandleFromPath(path: string): Promise<FileOperationResult> {
  // Strip surrounding quotes (from Windows "Copy as path")
  path = path.replace(/^["']|["']$/g, '');

  // Strip brackets from Shelv/Paperless paths: [Center]\path → Center\path
  path = path.replace(/^\[([^\]]+)\]/, '$1');

  if (!isFileSystemAccessSupported()) {
    return { success: false, error: 'not_supported' };
  }

  // Split path by backslash
  const parts = path.split('\\');
  if (parts.length < 2) {
    return { success: false, error: 'file_not_found' };
  }

  const potentialAlias = parts[0];
  const relativeParts = parts.slice(1);
  const fileName = relativeParts[relativeParts.length - 1];

  if (!fileName) {
    return { success: false, error: 'file_not_found' };
  }

  const folders = await getSavedFolders();

  // Strategy 1: Check if potentialAlias is a path mapping (e.g., "MSA Staff" → "V:")
  const mapping = await getPathMapping(potentialAlias);
  if (mapping) {
    // Translate alias to drive path: "MSA Staff\scan\file.pdf" → "V:\scan\file.pdf"
    const driveLetter = mapping.drivePath.toUpperCase();

    // Find saved folder that matches the drive (e.g., folder named "V:" or just "V")
    const driveFolder = folders.find(f => {
      const name = f.name.toUpperCase();
      return name === driveLetter || name === driveLetter.replace(':', '') || name === driveLetter + ':';
    });

    if (driveFolder) {
      const hasPermission = await verifyPermission(driveFolder.handle);
      if (!hasPermission) {
        return { success: false, error: 'permission_denied' };
      }

      try {
        // Navigate using the relative path (skip the alias, use rest of path)
        const pathParts = [...relativeParts];
        const file = pathParts.pop()!;
        let currentHandle = driveFolder.handle;

        for (const dirName of pathParts) {
          currentHandle = await currentHandle.getDirectoryHandle(dirName);
        }

        const fileHandle = await currentHandle.getFileHandle(file);
        return { success: true, handle: fileHandle };
      } catch {
        return { success: false, error: 'file_not_found' };
      }
    }
  }

  // Strategy 2: Direct folder name lookup (original behavior)
  const folder = folders.find(f => f.name.toLowerCase() === potentialAlias.toLowerCase());

  if (!folder) {
    return { success: false, error: 'folder_not_found' };
  }

  // Verify permission
  const hasPermission = await verifyPermission(folder.handle);
  if (!hasPermission) {
    return { success: false, error: 'permission_denied' };
  }

  try {
    // Navigate to the file's parent directory
    const pathParts = [...relativeParts];
    const file = pathParts.pop()!;
    let currentHandle = folder.handle;

    for (const dirName of pathParts) {
      currentHandle = await currentHandle.getDirectoryHandle(dirName);
    }

    // Get the file handle
    const fileHandle = await currentHandle.getFileHandle(file);
    return { success: true, handle: fileHandle };
  } catch {
    return { success: false, error: 'file_not_found' };
  }
}

/**
 * Open a file in a new browser tab.
 */
export async function openFileInNewTab(handle: FileSystemFileHandle): Promise<boolean> {
  try {
    const file = await handle.getFile();
    const url = URL.createObjectURL(file);
    window.open(url, '_blank');
    // Clean up the URL after a delay to allow the tab to load
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  } catch (err) {
    console.error('Failed to open file:', err);
    return false;
  }
}

/**
 * Print a file directly using a popup window.
 */
export async function printFile(handle: FileSystemFileHandle): Promise<boolean> {
  try {
    const file = await handle.getFile();
    const url = URL.createObjectURL(file);

    // Open in a popup window (not tab) - this allows us to call print()
    const printWindow = window.open(url, '_blank', 'width=800,height=600');

    if (!printWindow) {
      console.error('Popup blocked');
      URL.revokeObjectURL(url);
      return false;
    }

    // Wait for the window to load, then print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 500); // Give PDF viewer time to render
    };

    // Clean up after printing (user closes dialog or window)
    printWindow.onafterprint = () => {
      printWindow.close();
      URL.revokeObjectURL(url);
    };

    return true;
  } catch (err) {
    console.error('Failed to print file:', err);
    return false;
  }
}

/**
 * Print specific pages from a PDF file using PDF.js extraction.
 * Falls back to printing entire file if page extraction fails.
 *
 * @param handle - File handle to the PDF
 * @param pageStart - Start page (1-indexed)
 * @param pageEnd - End page (1-indexed)
 * @param complexRange - Complex range string like "1,3,5-7"
 * @param stamp - Optional stamp info to display on each page
 */
export async function printFilePages(
  handle: FileSystemFileHandle,
  pageStart?: number,
  pageEnd?: number,
  complexRange?: string,
  stamp?: PrintStampInfo
): Promise<boolean> {
  // If no page specification, print entire file
  if (!pageStart && !pageEnd && !complexRange) {
    return printFile(handle);
  }

  try {
    const file = await handle.getFile();
    const arrayBuffer = await file.arrayBuffer();

    // Determine which pages to extract
    let pageNumbers: number[];

    if (complexRange) {
      // Parse complex range (from pdf-utils)
      pageNumbers = parsePageRange(complexRange);
    } else if (pageStart !== undefined) {
      // Simple range (pageEnd defaults to pageStart if not specified)
      const start = pageStart;
      const end = pageEnd !== undefined ? pageEnd : pageStart;
      pageNumbers = Array.from(
        { length: end - start + 1 },
        (_, i) => start + i
      );
    } else {
      // Shouldn't happen, but fallback
      return printFile(handle);
    }

    if (pageNumbers.length === 0) {
      return printFile(handle);
    }

    // Extract pages using pdf-utils (with optional stamp)
    const extractedBlob = await extractPagesForPrint(arrayBuffer, pageNumbers, stamp);

    // Create URL and print
    const url = URL.createObjectURL(extractedBlob);
    const printWindow = window.open(url, '_blank', 'width=800,height=600');

    if (!printWindow) {
      console.error('[Print] Popup blocked');
      URL.revokeObjectURL(url);
      return false;
    }

    // Wait for the window to load, then print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 500);
    };

    // Clean up after printing
    printWindow.onafterprint = () => {
      printWindow.close();
      URL.revokeObjectURL(url);
    };

    return true;
  } catch (err) {
    console.error('[Print] Failed to extract pages:', err);
    console.error('[Print] Falling back to printing entire file');
    // Fallback to printing entire file
    return printFile(handle);
  }
}

/**
 * Convenience function to open a file from a path string.
 */
export async function openFileFromPath(path: string): Promise<FileOperationError | null> {
  const result = await getFileHandleFromPath(path);
  if (!result.success) {
    return result.error;
  }
  const opened = await openFileInNewTab(result.handle);
  return opened ? null : 'file_not_found';
}

/**
 * Convenience function to print a file from a path string.
 */
export async function printFileFromPath(path: string): Promise<FileOperationError | null> {
  const result = await getFileHandleFromPath(path);
  if (!result.success) {
    return result.error;
  }
  const printed = await printFile(result.handle);
  return printed ? null : 'file_not_found';
}

/**
 * Convenience function to print specific pages from a PDF file using a path string.
 * Uses PDF.js to extract and print only the specified pages.
 *
 * @param path - File path string
 * @param pageStart - Start page (1-indexed)
 * @param pageEnd - End page (1-indexed)
 * @param complexRange - Complex range string like "1,3,5-7"
 * @param stamp - Optional stamp info to display on each page
 */
export async function printFileFromPathWithPages(
  path: string,
  pageStart?: number,
  pageEnd?: number,
  complexRange?: string,
  stamp?: PrintStampInfo
): Promise<FileOperationError | null> {
  const result = await getFileHandleFromPath(path);
  if (!result.success) {
    return result.error;
  }
  const printed = await printFilePages(result.handle, pageStart, pageEnd, complexRange, stamp);
  return printed ? null : 'file_not_found';
}

// ============================================================================
// Path Mapping Functions
// ============================================================================

/**
 * Get all path mappings for the current user.
 */
export async function getPathMappings(): Promise<PathMapping[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PATH_MAPPINGS_STORE, 'readonly');
      const store = tx.objectStore(PATH_MAPPINGS_STORE);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return [];
  }
}

/**
 * Add or update a path mapping.
 */
export async function addPathMapping(mapping: PathMapping): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PATH_MAPPINGS_STORE, 'readwrite');
      const store = tx.objectStore(PATH_MAPPINGS_STORE);
      const request = store.put(mapping);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.error('Failed to add path mapping:', err);
  }
}

/**
 * Remove a path mapping by alias.
 */
export async function removePathMapping(alias: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PATH_MAPPINGS_STORE, 'readwrite');
      const store = tx.objectStore(PATH_MAPPINGS_STORE);
      const request = store.delete(alias);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      tx.oncomplete = () => db.close();
    });
  } catch (err) {
    console.error('Failed to remove path mapping:', err);
  }
}

/**
 * Get a single path mapping by alias.
 */
export async function getPathMapping(alias: string): Promise<PathMapping | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PATH_MAPPINGS_STORE, 'readonly');
      const store = tx.objectStore(PATH_MAPPINGS_STORE);
      const request = store.get(alias);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

/**
 * Convert a full path with drive letter to an alias-based path.
 * E.g., "Z:\Courseware\Math\file.pdf" → "Center\Courseware\Math\file.pdf"
 * Returns original path if no mapping found.
 */
export async function convertToAliasPath(fullPath: string): Promise<string> {
  const mappings = await getPathMappings();

  for (const mapping of mappings) {
    // Check if path starts with this drive letter (case-insensitive)
    const drivePrefix = mapping.drivePath.toUpperCase();
    const pathUpper = fullPath.toUpperCase();

    if (pathUpper.startsWith(drivePrefix + '\\')) {
      // Replace drive with alias
      return mapping.alias + fullPath.slice(drivePrefix.length);
    }
    if (pathUpper.startsWith(drivePrefix) && fullPath.length === drivePrefix.length) {
      // Just the drive letter
      return mapping.alias;
    }
  }

  // No mapping found, return original
  return fullPath;
}

/**
 * Resolve an alias-based path to a full path with drive letter.
 * E.g., "Center\Courseware\Math\file.pdf" → "Z:\Courseware\Math\file.pdf"
 * Returns original path if no mapping found.
 */
export async function resolveAliasPath(aliasPath: string): Promise<string> {
  // Split by backslash to get the first part (potential alias)
  const parts = aliasPath.split('\\');
  if (parts.length === 0) {
    return aliasPath;
  }

  const potentialAlias = parts[0];

  // Look for a mapping with this alias
  const mapping = await getPathMapping(potentialAlias);
  if (mapping) {
    // Replace alias with drive path
    const relativePath = parts.slice(1).join('\\');
    return relativePath ? `${mapping.drivePath}\\${relativePath}` : mapping.drivePath;
  }

  // No mapping found, return original
  return aliasPath;
}

/**
 * Check if a path starts with a known alias.
 */
export async function hasAliasPrefix(path: string): Promise<boolean> {
  const parts = path.split('\\');
  if (parts.length === 0) {
    return false;
  }

  const mapping = await getPathMapping(parts[0]);
  return mapping !== null;
}

/**
 * Extract drive letter from a path (e.g., "Z:\path" → "Z:")
 * Returns null if no drive letter found.
 */
export function extractDriveLetter(path: string): string | null {
  const match = path.match(/^([A-Za-z]:)/);
  return match ? match[1].toUpperCase() : null;
}

// ============================================================================
// Paperless Path Cache (for fallback when local file access fails)
// ============================================================================

const PAPERLESS_PATH_CACHE_KEY = 'paperless-path-cache';
const PAPERLESS_CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

interface PaperlessPathCacheEntry {
  documentId: number;
  timestamp: number;
}

interface PaperlessPathCache {
  [path: string]: PaperlessPathCacheEntry;
}

/**
 * Get the Paperless path cache from localStorage
 */
export function getPaperlessPathCache(): PaperlessPathCache {
  if (typeof window === 'undefined') return {};
  try {
    const cached = localStorage.getItem(PAPERLESS_PATH_CACHE_KEY);
    if (!cached) return {};
    const cache = JSON.parse(cached) as PaperlessPathCache;

    // Clean up expired entries
    const now = Date.now();
    const cleaned: PaperlessPathCache = {};
    for (const [path, entry] of Object.entries(cache)) {
      if (now - entry.timestamp < PAPERLESS_CACHE_MAX_AGE) {
        cleaned[path] = entry;
      }
    }

    return cleaned;
  } catch {
    return {};
  }
}

/**
 * Cache a Paperless document ID for a path
 */
export function setPaperlessPathCache(path: string, documentId: number): void {
  if (typeof window === 'undefined') return;
  try {
    const cache = getPaperlessPathCache();
    cache[path] = { documentId, timestamp: Date.now() };
    localStorage.setItem(PAPERLESS_PATH_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Get cached Paperless document ID for a path
 */
export function getCachedPaperlessDocumentId(path: string): number | null {
  const cache = getPaperlessPathCache();
  return cache[path]?.documentId ?? null;
}

/**
 * Open a file with Paperless fallback when local access fails.
 *
 * @param path - The file path (alias format or folder-relative)
 * @param paperlessSearch - Optional callback to search Paperless by path when cache misses
 * @returns null on success, error string on failure
 */
export async function openFileFromPathWithFallback(
  path: string,
  paperlessSearch?: (searchPath: string) => Promise<number | null>
): Promise<string | null> {
  // 1. Try local file access (with path mapping support)
  const result = await getFileHandleFromPath(path);
  if (result.success) {
    const opened = await openFileInNewTab(result.handle);
    return opened ? null : 'open_failed';
  }

  // 2. Local access failed - try Paperless fallback
  if (!paperlessSearch) {
    return result.error;
  }

  // 2a. Check localStorage cache first
  let documentId = getCachedPaperlessDocumentId(path);

  // 2b. Cache miss - search Paperless by full path
  if (!documentId) {
    try {
      documentId = await paperlessSearch(path);
      if (documentId) {
        setPaperlessPathCache(path, documentId);
      }
    } catch {
      // Search failed, return original error
      return result.error;
    }
  }

  // 2c. Open via Paperless API
  if (documentId) {
    window.open(`/api/paperless/preview/${documentId}`, '_blank');
    return null;
  }

  return 'file_not_found';
}

/**
 * Print a file with Paperless fallback when local access fails.
 *
 * @param path - The file path
 * @param pageStart - Start page (optional)
 * @param pageEnd - End page (optional)
 * @param complexRange - Complex page range string (optional)
 * @param stamp - Stamp info (optional)
 * @param paperlessSearch - Optional callback to search Paperless
 * @returns null on success, error string on failure
 */
export async function printFileFromPathWithFallback(
  path: string,
  pageStart?: number,
  pageEnd?: number,
  complexRange?: string,
  stamp?: PrintStampInfo,
  paperlessSearch?: (searchPath: string) => Promise<number | null>
): Promise<string | null> {
  // 1. Try local file access
  const result = await getFileHandleFromPath(path);
  if (result.success) {
    return printFilePages(result.handle, pageStart, pageEnd, complexRange, stamp);
  }

  // 2. Local access failed - try Paperless fallback
  if (!paperlessSearch) {
    return result.error;
  }

  let documentId = getCachedPaperlessDocumentId(path);

  if (!documentId) {
    try {
      documentId = await paperlessSearch(path);
      if (documentId) {
        setPaperlessPathCache(path, documentId);
      }
    } catch {
      return result.error;
    }
  }

  if (!documentId) {
    return 'file_not_found';
  }

  // 3. Fetch PDF from Paperless and print with page extraction
  try {
    const response = await fetch(`/api/paperless/preview/${documentId}`);
    if (!response.ok) {
      return 'fetch_failed';
    }

    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    // If no page range specified, print entire file
    if (!pageStart && !pageEnd && !complexRange) {
      const printBlob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(printBlob);
      const printWindow = window.open(url, '_blank', 'width=800,height=600');
      if (!printWindow) {
        URL.revokeObjectURL(url);
        return 'popup_blocked';
      }
      printWindow.onload = () => {
        setTimeout(() => printWindow.print(), 500);
      };
      printWindow.onafterprint = () => {
        printWindow.close();
        URL.revokeObjectURL(url);
      };
      return null;
    }

    // Build page numbers array
    let pageNumbers: number[] = [];
    if (complexRange) {
      pageNumbers = parsePageRange(complexRange);
    } else if (pageStart !== undefined) {
      const end = pageEnd ?? pageStart;
      for (let i = pageStart; i <= end; i++) {
        pageNumbers.push(i);
      }
    }

    if (pageNumbers.length === 0) {
      return 'invalid_page_range';
    }

    // Extract pages and print (matching local print behavior)
    const extractedBlob = await extractPagesForPrint(arrayBuffer, pageNumbers, stamp);
    const url = URL.createObjectURL(extractedBlob);
    const printWindow = window.open(url, '_blank', 'width=800,height=600');
    if (!printWindow) {
      URL.revokeObjectURL(url);
      return 'popup_blocked';
    }
    printWindow.onload = () => {
      setTimeout(() => printWindow.print(), 500);
    };
    printWindow.onafterprint = () => {
      printWindow.close();
      URL.revokeObjectURL(url);
    };
    return null;
  } catch (error) {
    console.warn('Paperless print failed:', error);
    return 'print_failed';
  }
}

// ============================================================================
// Bulk Print Functions
// ============================================================================

/**
 * Print multiple PDFs in a single print job.
 * Combines all specified pages from all PDFs into one printable document.
 *
 * @param exercises - Array of exercises with PDF paths and page ranges
 * @param stamp - Optional stamp info to display on each page
 * @param paperlessSearch - Optional callback to search Paperless when local access fails
 * @param title - Optional title for print dialog (displayed as filename)
 * @returns null on success, error string on failure
 */
export async function printBulkFiles(
  exercises: BulkPrintExercise[],
  stamp?: PrintStampInfo,
  paperlessSearch?: (path: string) => Promise<number | null>,
  title?: string
): Promise<'not_supported' | 'no_valid_files' | 'print_failed' | null> {
  const fsSupported = isFileSystemAccessSupported();

  // If no File System API and no Paperless fallback, can't proceed
  if (!fsSupported && !paperlessSearch) {
    return 'not_supported';
  }

  // Filter exercises that have valid PDF paths
  const validExercises = exercises.filter(ex => ex.pdf_name && ex.pdf_name.trim());
  if (validExercises.length === 0) {
    return 'no_valid_files';
  }

  // Fetch all PDFs in parallel using shared helper
  const fsUtils = createFsUtils();
  const results = await Promise.all(
    validExercises.map(ex => fetchPdfData(ex, fsUtils, paperlessSearch, '[BulkPrint]'))
  );

  // Build bulkItems from results using shared helper
  const bulkItems: BulkPrintItem[] = [];
  for (const { exercise, arrayBuffer } of results) {
    if (arrayBuffer) {
      bulkItems.push({
        pdfData: arrayBuffer,
        pageNumbers: getPageNumbers(exercise, '[BulkPrint]'),
        label: exercise.pdf_name,
      });
    } else {
      console.warn('[BulkPrint] Could not get file data for:', exercise.pdf_name);
    }
  }

  if (bulkItems.length === 0) {
    return 'no_valid_files';
  }

  try {
    // Extract and combine all pages
    const combinedBlob = await extractBulkPagesForPrint(bulkItems, stamp);

    // Create URL and print
    const url = URL.createObjectURL(combinedBlob);
    const printWindow = window.open(url, '_blank', 'width=800,height=600');

    if (!printWindow) {
      console.error('[BulkPrint] Popup blocked');
      URL.revokeObjectURL(url);
      return 'print_failed';
    }

    // Wait for the window to load, then print
    printWindow.onload = () => {
      // Set document title for meaningful print dialog filename
      printWindow.document.title = title || 'Combined_Exercises';

      setTimeout(() => {
        printWindow.print();
      }, 500);
    };

    // Clean up after printing
    printWindow.onafterprint = () => {
      printWindow.close();
      URL.revokeObjectURL(url);
    };

    return null;
  } catch (err) {
    console.error('[BulkPrint] Failed to create combined print:', err);
    return 'print_failed';
  }
}

/**
 * Download multiple PDFs combined into a single file.
 * Uses the same page extraction logic as printBulkFiles but triggers download.
 *
 * @param exercises - Array of exercises with PDF paths and page ranges
 * @param filename - The filename to use for the download
 * @param stamp - Optional stamp info to display on each page
 * @param paperlessSearch - Optional callback to search Paperless when local access fails
 * @returns null on success, error string on failure
 */
export async function downloadBulkFiles(
  exercises: BulkPrintExercise[],
  filename: string,
  stamp?: PrintStampInfo,
  paperlessSearch?: (path: string) => Promise<number | null>
): Promise<'not_supported' | 'no_valid_files' | 'download_failed' | null> {
  const fsSupported = isFileSystemAccessSupported();

  // If no File System API and no Paperless fallback, can't proceed
  if (!fsSupported && !paperlessSearch) {
    return 'not_supported';
  }

  // Filter exercises that have valid PDF paths
  const validExercises = exercises.filter(ex => ex.pdf_name && ex.pdf_name.trim());
  if (validExercises.length === 0) {
    return 'no_valid_files';
  }

  // Fetch all PDFs in parallel using shared helper
  const fsUtils = createFsUtils();
  const results = await Promise.all(
    validExercises.map(ex => fetchPdfData(ex, fsUtils, paperlessSearch, '[BulkDownload]'))
  );

  // Build bulkItems from results using shared helper
  const bulkItems: BulkPrintItem[] = [];
  for (const { exercise, arrayBuffer } of results) {
    if (arrayBuffer) {
      bulkItems.push({
        pdfData: arrayBuffer,
        pageNumbers: getPageNumbers(exercise, '[BulkDownload]'),
        label: exercise.pdf_name,
      });
    } else {
      console.warn('[BulkDownload] Could not get file data for:', exercise.pdf_name);
    }
  }

  if (bulkItems.length === 0) {
    return 'no_valid_files';
  }

  try {
    // Extract and combine all pages into actual PDF (not HTML like print)
    const combinedBlob = await extractBulkPagesForDownload(bulkItems, stamp);

    // Trigger download
    const url = URL.createObjectURL(combinedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return null;
  } catch (err) {
    console.error('[BulkDownload] Failed to create combined download:', err);
    return 'download_failed';
  }
}

// ============================================================================
// Answer File Download Functions
// ============================================================================

/**
 * Exercise with answer fields for bulk answer download
 */
export interface AnswerExercise {
  pdf_name: string;  // Original exercise PDF (used to auto-search for answer if answer_pdf_name is empty)
  answer_pdf_name?: string;  // Manually selected answer PDF path
  answer_page_start?: string | number;
  answer_page_end?: string | number;
  answer_complex_pages?: string;  // e.g., "1,3,5-7"
}

/**
 * Download all answer files combined into a single PDF.
 * For each exercise:
 * - If answer_pdf_name is set, use that path
 * - Otherwise, search for answer using searchAnswerFile()
 * - Combine all found answers and download
 *
 * @param exercises - Array of exercises with answer fields
 * @param filename - The filename to use for the download
 * @param stamp - Optional stamp info to display on each page
 * @param paperlessSearch - Optional callback to search Paperless when local access fails
 * @returns Object with result status and count of found/missing answers
 */
export async function downloadAllAnswerFiles(
  exercises: AnswerExercise[],
  filename: string,
  stamp?: PrintStampInfo,
  paperlessSearch?: (path: string) => Promise<number | null>
): Promise<{ status: 'not_supported' | 'no_valid_files' | 'download_failed' | 'success'; found: number; missing: number }> {
  const fsSupported = isFileSystemAccessSupported();

  // If no File System API and no Paperless fallback, can't proceed
  if (!fsSupported && !paperlessSearch) {
    return { status: 'not_supported', found: 0, missing: exercises.length };
  }

  // Filter exercises that have a PDF (needed to search for answer)
  const validExercises = exercises.filter(ex => ex.pdf_name && ex.pdf_name.trim());
  if (validExercises.length === 0) {
    return { status: 'no_valid_files', found: 0, missing: 0 };
  }

  // For each exercise, find the answer file path
  const answerPaths: { path: string; exercise: AnswerExercise; documentId?: number }[] = [];
  let missing = 0;

  for (const exercise of validExercises) {
    let answerPath: string | null = null;
    let documentId: number | undefined;

    // First check if manually selected answer exists
    if (exercise.answer_pdf_name) {
      answerPath = exercise.answer_pdf_name;
    } else {
      // Search for answer file
      const result = await searchAnswerFile(exercise.pdf_name);
      if (result) {
        answerPath = result.path;
        documentId = result.documentId;
      }
    }

    if (answerPath) {
      answerPaths.push({ path: answerPath, exercise, documentId });
    } else {
      console.warn('[AnswerDownload] No answer found for:', exercise.pdf_name);
      missing++;
    }
  }

  if (answerPaths.length === 0) {
    return { status: 'no_valid_files', found: 0, missing };
  }

  // Build BulkPrintExercise array for the answer files
  const answerExercises: BulkPrintExercise[] = answerPaths.map(({ path, exercise }) => ({
    pdf_name: path,
    page_start: exercise.answer_page_start,
    page_end: exercise.answer_page_end,
    complex_pages: exercise.answer_complex_pages,
  }));

  // Fetch all PDFs in parallel using shared helper
  const fsUtils = createFsUtils();
  const results = await Promise.all(
    answerExercises.map(ex => fetchPdfData(ex, fsUtils, paperlessSearch, '[AnswerDownload]'))
  );

  // Build bulkItems from results
  const bulkItems: BulkPrintItem[] = [];
  for (const { exercise, arrayBuffer } of results) {
    if (arrayBuffer) {
      bulkItems.push({
        pdfData: arrayBuffer,
        pageNumbers: getPageNumbers(exercise, '[AnswerDownload]'),
        label: exercise.pdf_name,
      });
    } else {
      console.warn('[AnswerDownload] Could not get file data for:', exercise.pdf_name);
      missing++;
    }
  }

  if (bulkItems.length === 0) {
    return { status: 'no_valid_files', found: 0, missing };
  }

  try {
    // Extract and combine all pages into actual PDF
    const combinedBlob = await extractBulkPagesForDownload(bulkItems, stamp);

    // Trigger download
    const url = URL.createObjectURL(combinedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { status: 'success', found: bulkItems.length, missing };
  } catch (err) {
    console.error('[AnswerDownload] Failed to create combined download:', err);
    return { status: 'download_failed', found: 0, missing };
  }
}
