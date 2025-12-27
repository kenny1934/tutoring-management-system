/**
 * File System Access API utilities for browsing local/NAS files.
 * Supports multiple source folders with persistence in IndexedDB.
 * Only works in Chrome/Edge - check isFileSystemAccessSupported() before use.
 */

import { parsePageRange, extractPagesForPrint, extractBulkPagesForPrint, PrintStampInfo, BulkPrintItem } from './pdf-utils';

export type { PrintStampInfo, BulkPrintItem } from './pdf-utils';

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
 * Path format: "FolderName\relative\path\to\file.pdf"
 */
export async function getFileHandleFromPath(path: string): Promise<FileOperationResult> {
  if (!isFileSystemAccessSupported()) {
    return { success: false, error: 'not_supported' };
  }

  // Split path by backslash
  const parts = path.split('\\');
  if (parts.length < 2) {
    return { success: false, error: 'file_not_found' };
  }

  const folderName = parts[0];
  const relativeParts = parts.slice(1);
  const fileName = relativeParts.pop();

  if (!fileName) {
    return { success: false, error: 'file_not_found' };
  }

  // Find the folder by name
  const folders = await getSavedFolders();
  const folder = folders.find(f => f.name === folderName);

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
    let currentHandle = folder.handle;
    for (const dirName of relativeParts) {
      currentHandle = await currentHandle.getDirectoryHandle(dirName);
    }

    // Get the file handle
    const fileHandle = await currentHandle.getFileHandle(fileName);
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
    console.log('[Print] No page range specified, printing entire file');
    return printFile(handle);
  }

  console.log('[Print] Page range requested:', { pageStart, pageEnd, complexRange });

  try {
    const file = await handle.getFile();
    const arrayBuffer = await file.arrayBuffer();

    // Determine which pages to extract
    let pageNumbers: number[];

    if (complexRange) {
      // Parse complex range (from pdf-utils)
      pageNumbers = parsePageRange(complexRange);
      console.log('[Print] Complex range parsed:', pageNumbers);
    } else if (pageStart !== undefined) {
      // Simple range (pageEnd defaults to pageStart if not specified)
      const start = pageStart;
      const end = pageEnd !== undefined ? pageEnd : pageStart;
      pageNumbers = Array.from(
        { length: end - start + 1 },
        (_, i) => start + i
      );
      console.log('[Print] Simple range:', pageNumbers);
    } else {
      // Shouldn't happen, but fallback
      console.log('[Print] Unexpected state, printing entire file');
      return printFile(handle);
    }

    if (pageNumbers.length === 0) {
      console.log('[Print] No pages to extract, printing entire file');
      return printFile(handle);
    }

    console.log('[Print] Extracting pages:', pageNumbers);

    // Extract pages using pdf-utils (with optional stamp)
    const extractedBlob = await extractPagesForPrint(arrayBuffer, pageNumbers, stamp);
    console.log('[Print] Extraction successful, blob size:', extractedBlob.size);

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
// Bulk Print Functions
// ============================================================================

/**
 * Exercise info for bulk printing
 */
export interface BulkPrintExercise {
  pdf_name: string;
  page_start?: string | number;
  page_end?: string | number;
  complex_pages?: string;  // e.g., "1,3,5-7"
  remarks?: string;  // For reference only, not used for page parsing
}

/**
 * Print multiple PDFs in a single print job.
 * Combines all specified pages from all PDFs into one printable document.
 *
 * @param exercises - Array of exercises with PDF paths and page ranges
 * @param stamp - Optional stamp info to display on each page
 * @returns null on success, error string on failure
 */
export async function printBulkFiles(
  exercises: BulkPrintExercise[],
  stamp?: PrintStampInfo
): Promise<'not_supported' | 'no_valid_files' | 'print_failed' | null> {
  if (!isFileSystemAccessSupported()) {
    return 'not_supported';
  }

  // Filter exercises that have valid PDF paths
  const validExercises = exercises.filter(ex => ex.pdf_name && ex.pdf_name.trim());
  if (validExercises.length === 0) {
    return 'no_valid_files';
  }

  console.log('[BulkPrint] Processing', validExercises.length, 'exercises');

  const bulkItems: BulkPrintItem[] = [];

  for (const exercise of validExercises) {
    // Get file handle
    const result = await getFileHandleFromPath(exercise.pdf_name);
    if (!result.success) {
      console.warn('[BulkPrint] Failed to get file handle for:', exercise.pdf_name, result.error);
      continue;
    }

    try {
      const file = await result.handle.getFile();
      const arrayBuffer = await file.arrayBuffer();

      // Determine which pages to extract
      let pageNumbers: number[];

      // Use complex_pages directly (no more parsing from remarks)
      const complexRange = exercise.complex_pages?.trim();

      if (complexRange) {
        pageNumbers = parsePageRange(complexRange);
        console.log('[BulkPrint] Complex range for', exercise.pdf_name, ':', pageNumbers);
      } else {
        const pageStart = exercise.page_start
          ? (typeof exercise.page_start === 'string' ? parseInt(exercise.page_start, 10) : exercise.page_start)
          : undefined;
        const pageEnd = exercise.page_end
          ? (typeof exercise.page_end === 'string' ? parseInt(exercise.page_end, 10) : exercise.page_end)
          : undefined;

        if (pageStart !== undefined && !isNaN(pageStart)) {
          const end = pageEnd !== undefined && !isNaN(pageEnd) ? pageEnd : pageStart;
          pageNumbers = Array.from({ length: end - pageStart + 1 }, (_, i) => pageStart + i);
          console.log('[BulkPrint] Simple range for', exercise.pdf_name, ':', pageNumbers);
        } else {
          // No page range specified - will use all pages
          // We pass an empty array and let extractBulkPagesForPrint handle getting all pages
          pageNumbers = [];
          console.log('[BulkPrint] All pages (to be determined) for', exercise.pdf_name);
        }
      }

      // pageNumbers.length === 0 means "all pages" - let extractBulkPagesForPrint handle it
      bulkItems.push({
        pdfData: arrayBuffer,
        pageNumbers,
        label: exercise.pdf_name,
      });
    } catch (err) {
      console.warn('[BulkPrint] Failed to process file:', exercise.pdf_name, err);
    }
  }

  if (bulkItems.length === 0) {
    return 'no_valid_files';
  }

  console.log('[BulkPrint] Extracting pages from', bulkItems.length, 'PDFs');

  try {
    // Extract and combine all pages
    const combinedBlob = await extractBulkPagesForPrint(bulkItems, stamp);
    console.log('[BulkPrint] Combined blob size:', combinedBlob.size);

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
