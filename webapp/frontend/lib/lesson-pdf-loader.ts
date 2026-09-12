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
import { parseSummerCoursewarePath, readCoursewareFile } from './summer-courseware-scan';
import { parseParallelPath } from './parallel-path';
import { composeSideBySidePdf } from './pdf-utils';
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
 * Composed parallel previews (`parallel:` paths) resolve both halves and
 * merge them side by side; real paths go straight to the single-PDF chain.
 */
export async function loadExercisePdf(
  pdfName: string,
  onProgress?: (message: string) => void
): Promise<PdfLoadResult | PdfLoadError> {
  const parallel = parseParallelPath(pdfName);
  if (!parallel) {
    return loadSinglePdf(pdfName, onProgress);
  }
  onProgress?.("Loading both language versions…");
  const [left, right] = await Promise.all([
    loadSinglePdf(parallel.left),
    loadSinglePdf(parallel.right),
  ]);
  if ('error' in left) return left;
  if ('error' in right) return right;
  onProgress?.("Composing side by side…");
  try {
    const data = await composeSideBySidePdf(left.data, right.data);
    return { data, source: left.source };
  } catch {
    return { error: 'fetch_failed' };
  }
}

/** Single real path: local File System Access first, Paperless fallback. */
async function loadSinglePdf(
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
        // Validate PDF magic bytes — non-PDF files (e.g. .doc/.docx) fall through to Paperless
        const header = new Uint8Array(data, 0, Math.min(5, data.byteLength));
        const magic = String.fromCharCode(...header);
        if (magic.startsWith('%PDF-')) {
          return { data, source: 'local' };
        }
      } catch {
        // Local read failed, continue to Paperless fallback
      }
    }
  }

  // 1.5. Summer courseware paths can also resolve via the per-year drive
  // handle connected in the Summer Materials panel (the share isn't in
  // Paperless, and the Settings folder alias may not exist on this machine).
  const summer = parseSummerCoursewarePath(pdfName);
  if (summer && isFileSystemAccessSupported()) {
    onProgress?.("Reading from the courseware drive…");
    const data = await readCoursewareFile(summer.year, summer.relPath);
    if (data) {
      const header = new Uint8Array(data, 0, Math.min(5, data.byteLength));
      if (String.fromCharCode(...header).startsWith('%PDF-')) {
        return { data, source: 'local' };
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
        // Validate PDF magic bytes — reject non-PDF responses (e.g. HTML error pages)
        const header = new Uint8Array(data, 0, Math.min(5, data.byteLength));
        const magic = String.fromCharCode(...header);
        if (!magic.startsWith('%PDF-')) {
          console.warn('[lesson-pdf-loader] Non-PDF data received. Content-Type:',
            response.headers.get('content-type'), 'Header:', magic);
          return { error: 'fetch_failed' };
        }
        return { data, source: 'paperless' };
      }
    } catch {
      return { error: 'fetch_failed' };
    }
  }

  return { error: 'file_not_found' };
}

/**
 * Keep a loaded PDF in a lesson view's cache. The cache holds its files in
 * the order they arrived, so once it's over its limit the oldest one goes.
 */
export function rememberPdf(cache: Map<string, ArrayBuffer>, limit: number, pdfName: string, data: ArrayBuffer) {
  cache.set(pdfName, data);
  if (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/** A PDF's bytes from the cache, loading them when they aren't there, or null when the file can't be found. */
export async function cachedPdf(cache: Map<string, ArrayBuffer>, pdfName: string): Promise<ArrayBuffer | null> {
  const cached = cache.get(pdfName);
  if (cached) return cached;
  const result = await loadExercisePdf(pdfName);
  return 'data' in result ? result.data : null;
}

// The files being fetched ahead of time right now. A view that asks for one
// of them again while it's on its way leaves it be, so nothing downloads twice.
const prefetching = new Set<string>();

/**
 * Fetch the files a lesson view is likely to open next into its cache, one
 * at a time. The returned function stops it before the next file starts. A
 * file that has already arrived is kept all the same, because its bytes are
 * good and the view may well open it later.
 */
export function prefetchPdfs(cache: Map<string, ArrayBuffer>, limit: number, pdfNames: string[]): () => void {
  let stopped = false;
  (async () => {
    for (const pdfName of new Set(pdfNames)) {
      if (stopped) break;
      if (cache.has(pdfName) || prefetching.has(pdfName)) continue;
      prefetching.add(pdfName);
      try {
        const result = await loadExercisePdf(pdfName);
        if ('data' in result) rememberPdf(cache, limit, pdfName, result.data);
      } finally {
        prefetching.delete(pdfName);
      }
    }
  })();
  return () => { stopped = true; };
}
