/**
 * File search utilities for drag-and-drop filename search.
 * Prioritizes Shelv search (fast) with optional local folder search.
 */

import { getSavedFolders, verifyPermission, type SavedFolder } from './file-system';
import { paperlessAPI } from './api';

export interface FileSearchResult {
  path: string;           // Full path in our format: "Alias\path\to\file.pdf"
  source: 'local' | 'shelv';
  match: 'exact' | 'partial';
  folderName?: string;    // For grouping results
}

export interface SearchProgress {
  phase: 'local' | 'shelv' | 'done';
  foldersScanned: number;
  totalFolders: number;
  filesScanned: number;
  currentFolder?: string;
}

export interface SearchOptions {
  /** Whether to search local folders (default: false - Shelv only) */
  searchLocal?: boolean;
  /** Max number of local folders to search (default: 3) */
  localFolderLimit?: number;
  /** Max files to scan per folder (default: 1000) */
  localFileLimit?: number;
}

// Safety limits
const MAX_DEPTH = 10;
const DEFAULT_MAX_FILES_PER_FOLDER = 1000;  // Reduced from 5000 for faster searches
const YIELD_INTERVAL = 100; // Yield to UI every N files

/**
 * Search for a file by filename.
 * Shelv is always searched first (fast). Local folders are optional.
 * Returns results as they're found via callback.
 */
export async function searchForFile(
  filename: string,
  options: SearchOptions = {},
  onProgress?: (progress: SearchProgress) => void,
  onResult?: (result: FileSearchResult) => void
): Promise<FileSearchResult[]> {
  const {
    searchLocal = false,
    localFolderLimit = 3,
    localFileLimit = DEFAULT_MAX_FILES_PER_FOLDER,
  } = options;

  const results: FileSearchResult[] = [];
  const normalizedFilename = filename.toLowerCase();

  // Always search Shelv first (fast)
  const shelvResults = await searchShelv(normalizedFilename, onProgress, onResult);
  results.push(...shelvResults);

  // Only search local folders if requested
  if (searchLocal) {
    const localResults = await searchLocalFolders(
      normalizedFilename,
      onProgress,
      onResult,
      { folderLimit: localFolderLimit, fileLimit: localFileLimit }
    );
    results.push(...localResults);
  }

  onProgress?.({
    phase: 'done',
    foldersScanned: 0,
    totalFolders: 0,
    filesScanned: 0,
  });

  return results;
}

interface LocalSearchLimits {
  folderLimit: number;
  fileLimit: number;
}

/**
 * Search local folders recursively with configurable limits.
 */
async function searchLocalFolders(
  filename: string,
  onProgress?: (progress: SearchProgress) => void,
  onResult?: (result: FileSearchResult) => void,
  limits?: LocalSearchLimits
): Promise<FileSearchResult[]> {
  const { folderLimit = 3, fileLimit = DEFAULT_MAX_FILES_PER_FOLDER } = limits || {};

  const results: FileSearchResult[] = [];
  const allFolders = await getSavedFolders();

  // Apply folder limit
  const folders = allFolders.slice(0, folderLimit);

  let foldersScanned = 0;
  const totalFolders = folders.length;

  for (const folder of folders) {
    // Verify permission first
    const hasPermission = await verifyPermission(folder.handle);
    if (!hasPermission) {
      foldersScanned++;
      continue;
    }

    onProgress?.({
      phase: 'local',
      foldersScanned,
      totalFolders,
      filesScanned: 0,
      currentFolder: folder.name,
    });

    let filesScanned = 0;

    // Recursive search with chunked iteration
    const folderResults = await searchInFolder(
      folder.handle,
      folder.name,
      filename,
      0,
      (count) => {
        filesScanned += count;
        onProgress?.({
          phase: 'local',
          foldersScanned,
          totalFolders,
          filesScanned,
          currentFolder: folder.name,
        });
      },
      fileLimit
    );

    for (const result of folderResults) {
      results.push({ ...result, folderName: folder.name });
      onResult?.(result);
    }

    foldersScanned++;
  }

  return results;
}

/**
 * Recursively search within a folder handle.
 */
async function searchInFolder(
  handle: FileSystemDirectoryHandle,
  basePath: string,
  targetFilename: string,
  depth: number,
  onFilesScanned?: (count: number) => void,
  maxFilesPerFolder: number = DEFAULT_MAX_FILES_PER_FOLDER
): Promise<FileSearchResult[]> {
  if (depth > MAX_DEPTH) {
    return [];
  }

  const results: FileSearchResult[] = [];
  let filesProcessed = 0;
  let totalInFolder = 0;

  try {
    const entries: [string, FileSystemHandle][] = [];

    // Collect all entries first (so we can count them)
    for await (const entry of handle.entries()) {
      entries.push(entry);
      if (entries.length > maxFilesPerFolder) {
        break; // Safety limit
      }
    }

    for (const [name, entryHandle] of entries) {
      totalInFolder++;

      if (entryHandle.kind === 'file') {
        // Check for match
        const nameLower = name.toLowerCase();
        const isExact = nameLower === targetFilename;
        const isPartial = !isExact && nameLower.includes(targetFilename.replace(/\.pdf$/i, ''));

        if (isExact || isPartial) {
          results.push({
            path: `${basePath}\\${name}`,
            source: 'local',
            match: isExact ? 'exact' : 'partial',
          });
        }
      } else if (entryHandle.kind === 'directory') {
        // Recurse into subdirectory
        const subResults = await searchInFolder(
          entryHandle as FileSystemDirectoryHandle,
          `${basePath}\\${name}`,
          targetFilename,
          depth + 1,
          onFilesScanned,
          maxFilesPerFolder
        );
        results.push(...subResults);
      }

      filesProcessed++;

      // Yield to UI periodically
      if (filesProcessed % YIELD_INTERVAL === 0) {
        onFilesScanned?.(YIELD_INTERVAL);
        await yieldToUI();
      }
    }

    // Report remaining files
    const remaining = filesProcessed % YIELD_INTERVAL;
    if (remaining > 0) {
      onFilesScanned?.(remaining);
    }
  } catch (err) {
    // Permission or access error - skip this folder
  }

  return results;
}

/**
 * Search Shelv/Paperless for the filename.
 */
async function searchShelv(
  filename: string,
  onProgress?: (progress: SearchProgress) => void,
  onResult?: (result: FileSearchResult) => void
): Promise<FileSearchResult[]> {
  const results: FileSearchResult[] = [];

  onProgress?.({
    phase: 'shelv',
    foldersScanned: 0,
    totalFolders: 0,
    filesScanned: 0,
  });

  try {
    // Search by filename WITH extension - Shelv requires it for accurate results
    const searchQuery = filename;
    const response = await paperlessAPI.search(searchQuery, 50, 'all');

    if (response.results) {
      for (const doc of response.results) {
        // Use converted_path if available (already in alias format), otherwise use original_path
        const path = doc.converted_path || doc.original_path || `Document ${doc.id}`;

        // Determine match type for display badge only (not filtering)
        const docFilename = doc.title?.toLowerCase() || '';
        const searchLower = filename.toLowerCase();
        const isExact = docFilename === searchLower;
        const isPartial = !isExact && docFilename.includes(searchLower.replace(/\.pdf$/i, ''));

        // Show ALL results from API - don't filter client-side
        // Paperless full-text search may match on content/title, not just filename
        const result: FileSearchResult = {
          path,
          source: 'shelv',
          match: isExact ? 'exact' : 'partial',
          folderName: 'Shelv',
        };

        results.push(result);
        onResult?.(result);
      }
    }
  } catch (err) {
    // Error searching Shelv silently
  }

  return results;
}

/**
 * Yield to the UI thread to prevent freezing.
 */
function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Format a file search result for display.
 */
export function formatSearchResultPath(result: FileSearchResult): string {
  // Extract just the filename for display
  const parts = result.path.split('\\');
  return parts[parts.length - 1] || result.path;
}

/**
 * Get the containing folder from a search result path.
 */
export function getContainingFolder(result: FileSearchResult): string {
  const parts = result.path.split('\\');
  if (parts.length >= 2) {
    // Return everything except the filename
    return parts.slice(0, -1).join('\\');
  }
  return result.folderName || 'Unknown';
}
