/**
 * Utilities for Paperless document operations.
 */

import { api } from "@/lib/api";
import type { PaperlessDocument } from "@/types";

/**
 * Parse a PDF path to extract alias, directory components, and filename.
 * Handles paths like: [Center]\Courseware (Eng)\IB\abc.pdf
 */
function parsePdfPath(path: string): {
  alias: string | null;
  directoryParts: string[];
  filename: string;
  filenameWithoutExt: string;
} {
  let cleaned = path.replace(/^["']|["']$/g, '');

  const aliasMatch = cleaned.match(/^\[([^\]]+)\]\\(.+)$/);

  let alias: string | null = null;
  let restOfPath: string;

  if (aliasMatch) {
    alias = aliasMatch[1];
    restOfPath = aliasMatch[2];
  } else {
    const parts = cleaned.split('\\');
    if (parts.length >= 2) {
      alias = parts[0];
      restOfPath = parts.slice(1).join('\\');
    } else {
      restOfPath = cleaned;
    }
  }

  const pathParts = restOfPath.split('\\');
  const filename = pathParts[pathParts.length - 1];
  const directoryParts = pathParts.slice(0, -1);

  const extMatch = filename.match(/^(.+)\.pdf$/i);
  const filenameWithoutExt = extMatch ? extMatch[1] : filename;

  return { alias, directoryParts, filename, filenameWithoutExt };
}

/**
 * Validate that a Paperless result corresponds to the file we're searching for.
 * In strict mode, also requires a directory segment from the original path to
 * appear in the document's path (prevents false positives on broad queries).
 */
function validateMatch(
  doc: PaperlessDocument,
  filenameWithoutExt: string,
  directoryParts: string[],
  strict: boolean
): boolean {
  const titleLower = (doc.title || '').toLowerCase();
  const pathLower = (doc.converted_path || doc.original_path || '').toLowerCase();
  const filenameLower = filenameWithoutExt.toLowerCase();

  const hasFilename = titleLower.includes(filenameLower) || pathLower.includes(filenameLower);
  if (!hasFilename) return false;

  if (strict && directoryParts.length > 0) {
    // Require at least one distinctive directory segment (>2 chars) in the document's path
    const distinctiveParts = directoryParts.filter(p => p.length > 2);
    if (distinctiveParts.length > 0) {
      return distinctiveParts.some(part => pathLower.includes(part.toLowerCase()));
    }
  }

  return true;
}

/**
 * Strip brackets, backslashes, and parentheses from a path to produce
 * a cleaner Whoosh-friendly query.
 * [Center]\Courseware (Eng)\IB\abc.pdf -> Center Courseware Eng IB abc.pdf
 */
function buildNormalizedQuery(searchPath: string): string {
  return searchPath
    .replace(/[\[\]]/g, '')
    .replace(/\\/g, ' ')
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Search Paperless for a document by path and return its ID.
 * Uses a multi-step fallback cascade with progressively simpler queries:
 *   1. Full path as-is (backward-compatible)
 *   2. Filename with extension, full-text search
 *   3. Filename without extension, full-text with strict validation
 *   4. Normalized path (brackets/backslashes stripped), full-text search
 * Stops at the first match. Callers cache the result in localStorage.
 */
export async function searchPaperlessByPath(searchPath: string): Promise<number | null> {
  const { filename, filenameWithoutExt, directoryParts } = parsePdfPath(searchPath);

  // Step 1: Full path as-is (current behavior)
  try {
    const response = await api.paperless.search(searchPath, 1, 'all');
    if (response.results.length > 0) {
      return response.results[0].id;
    }
  } catch {
    // Continue to next strategy
  }

  // Step 2: Filename with extension, full-text search
  try {
    const response = await api.paperless.search(filename, 5, 'all');
    if (response.results.length > 0) {
      // Prefer exact title match
      const exactMatch = response.results.find(
        doc => doc.title.toLowerCase() === filename.toLowerCase()
          || doc.title.toLowerCase() === filenameWithoutExt.toLowerCase()
      );
      if (exactMatch) return exactMatch.id;

      // Accept first result that passes validation
      const partialMatch = response.results.find(doc =>
        validateMatch(doc, filenameWithoutExt, directoryParts, false)
      );
      if (partialMatch) return partialMatch.id;
    }
  } catch {
    // Continue to next strategy
  }

  // Step 3: Filename without extension (broader — strict validation)
  if (filenameWithoutExt !== filename) {
    try {
      const response = await api.paperless.search(filenameWithoutExt, 10, 'all');
      if (response.results.length > 0) {
        const validMatch = response.results.find(doc =>
          validateMatch(doc, filenameWithoutExt, directoryParts, true)
        );
        if (validMatch) return validMatch.id;
      }
    } catch {
      // Continue to next strategy
    }
  }

  // Step 4: Normalized path as full-text query (last resort)
  const normalizedQuery = buildNormalizedQuery(searchPath);
  if (normalizedQuery && normalizedQuery !== searchPath) {
    try {
      const response = await api.paperless.search(normalizedQuery, 5, 'all');
      if (response.results.length > 0) {
        const validMatch = response.results.find(doc =>
          validateMatch(doc, filenameWithoutExt, directoryParts, false)
        );
        if (validMatch) return validMatch.id;
      }
    } catch {
      // All strategies exhausted
    }
  }

  return null;
}
