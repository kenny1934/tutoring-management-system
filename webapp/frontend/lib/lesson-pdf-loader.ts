/**
 * PDF loader for Lesson Mode.
 * Resolves exercise PDF paths to ArrayBuffers for canvas rendering.
 * Reuses existing file-system + Paperless infrastructure.
 */

import {
  isFileSystemAccessSupported,
  getFileHandleFromPath,
  getCachedPaperlessDocumentId,
  setPaperlessPathCache,
} from './file-system';
import { searchPaperlessByPath } from './paperless-utils';

export interface PdfLoadResult {
  data: ArrayBuffer;
  source: 'local' | 'paperless';
}

export interface PdfLoadError {
  error: 'no_file' | 'file_not_found' | 'fetch_failed';
}

/**
 * Load a PDF as ArrayBuffer from an exercise's pdf_name.
 * Tries local File System Access API first, falls back to Paperless.
 */
export async function loadExercisePdf(
  pdfName: string,
  onProgress?: (message: string) => void
): Promise<PdfLoadResult | PdfLoadError> {
  if (!pdfName || !pdfName.trim()) {
    return { error: 'no_file' };
  }

  // 1. Try local file access
  onProgress?.("Trying local file access\u2026");
  if (isFileSystemAccessSupported()) {
    const result = await getFileHandleFromPath(pdfName);
    if (result.success) {
      try {
        const file = await result.handle.getFile();
        const data = await file.arrayBuffer();
        return { data, source: 'local' };
      } catch {
        // Local read failed, continue to Paperless fallback
      }
    }
  }

  // 2. Try Paperless: check cache first
  onProgress?.("Checking Paperless cache\u2026");
  let documentId = getCachedPaperlessDocumentId(pdfName);

  // 3. Cache miss — search Paperless
  if (!documentId) {
    documentId = await searchPaperlessByPath(pdfName, onProgress);
    if (documentId) {
      setPaperlessPathCache(pdfName, documentId);
    }
  }

  // 4. Fetch from Paperless proxy
  onProgress?.("Downloading PDF\u2026");
  if (documentId) {
    try {
      const response = await fetch(`/api/paperless/preview/${documentId}`);
      if (response.ok) {
        const blob = await response.blob();
        const data = await blob.arrayBuffer();
        return { data, source: 'paperless' };
      }
    } catch {
      return { error: 'fetch_failed' };
    }
  }

  return { error: 'file_not_found' };
}
