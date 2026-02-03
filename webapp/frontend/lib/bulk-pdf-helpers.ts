/**
 * Shared helpers for bulk PDF operations (print/download).
 * Extracts common logic from file-system.ts to reduce duplication.
 *
 * Note: This module is imported by file-system.ts, so we must avoid
 * circular imports by not importing from file-system.ts. Instead,
 * file system utilities are passed as parameters.
 */

import { parsePageRange } from './pdf-utils';

/**
 * Exercise info for bulk PDF operations
 */
export interface BulkPrintExercise {
  pdf_name: string;
  page_start?: string | number;
  page_end?: string | number;
  complex_pages?: string;  // e.g., "1,3,5-7"
  remarks?: string;  // For reference only, not used for page parsing
}

/**
 * File operation result from getFileHandleFromPath
 */
export type FileOperationResult =
  | { success: true; handle: FileSystemFileHandle }
  | { success: false; error: string };

/**
 * File system utilities passed to fetchPdfData to avoid circular imports
 */
export interface FileSystemUtils {
  isSupported: () => boolean;
  getFileHandle: (path: string) => Promise<FileOperationResult>;
  getCachedDocId: (path: string) => number | null;
  setCachedDocId: (path: string, id: number) => void;
}

/**
 * Determine page numbers from exercise page range fields.
 * Handles both simple range (page_start/page_end) and complex range (complex_pages).
 *
 * @param exercise - Exercise with page range info
 * @param logPrefix - Log prefix for debugging (e.g., '[BulkPrint]')
 * @returns Array of page numbers, or empty array for "all pages"
 */
export function getPageNumbers(exercise: BulkPrintExercise, logPrefix: string = '[Bulk]'): number[] {
  const complexRange = exercise.complex_pages?.trim();

  if (complexRange) {
    const pageNumbers = parsePageRange(complexRange);
    return pageNumbers;
  }

  const pageStart = exercise.page_start
    ? (typeof exercise.page_start === 'string' ? parseInt(exercise.page_start, 10) : exercise.page_start)
    : undefined;
  const pageEnd = exercise.page_end
    ? (typeof exercise.page_end === 'string' ? parseInt(exercise.page_end, 10) : exercise.page_end)
    : undefined;

  if (pageStart !== undefined && !isNaN(pageStart)) {
    const end = pageEnd !== undefined && !isNaN(pageEnd) ? pageEnd : pageStart;
    const pageNumbers = Array.from({ length: end - pageStart + 1 }, (_, i) => pageStart + i);
    return pageNumbers;
  }

  // No page range specified - will use all pages
  return [];
}

/**
 * Fetch PDF data from local file system or Paperless fallback.
 *
 * @param exercise - Exercise with PDF path
 * @param fsUtils - File system utilities (to avoid circular imports)
 * @param paperlessSearch - Optional callback to search Paperless when local access fails
 * @param logPrefix - Log prefix for debugging (e.g., '[BulkPrint]')
 * @returns Object with exercise and arrayBuffer (null if fetch failed)
 */
export async function fetchPdfData(
  exercise: BulkPrintExercise,
  fsUtils: FileSystemUtils,
  paperlessSearch?: (path: string) => Promise<number | null>,
  logPrefix: string = '[Bulk]'
): Promise<{ exercise: BulkPrintExercise; arrayBuffer: ArrayBuffer | null }> {
  let arrayBuffer: ArrayBuffer | null = null;

  // Try local file access first (if supported)
  if (fsUtils.isSupported()) {
    const result = await fsUtils.getFileHandle(exercise.pdf_name);
    if (result.success) {
      try {
        const file = await result.handle.getFile();
        arrayBuffer = await file.arrayBuffer();
      } catch (err) {
        console.warn(`${logPrefix} Failed to read local file:`, exercise.pdf_name, err);
      }
    }
  }

  // Try Paperless fallback if local failed and callback provided
  if (!arrayBuffer && paperlessSearch) {
    try {
      // Check cache first
      let documentId = fsUtils.getCachedDocId(exercise.pdf_name);

      // If not cached, search Paperless
      if (!documentId) {
        documentId = await paperlessSearch(exercise.pdf_name);
        if (documentId) {
          fsUtils.setCachedDocId(exercise.pdf_name, documentId);
        }
      }

      if (documentId) {
        const response = await fetch(`/api/paperless/preview/${documentId}`);
        if (response.ok) {
          const blob = await response.blob();
          arrayBuffer = await blob.arrayBuffer();
        }
      }
    } catch (err) {
      console.warn(`${logPrefix} Paperless fallback failed for:`, exercise.pdf_name, err);
    }
  }

  return { exercise, arrayBuffer };
}
