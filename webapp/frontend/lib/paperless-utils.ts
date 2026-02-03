/**
 * Utilities for Paperless document operations.
 */

import { api } from "@/lib/api";

/**
 * Search Paperless for a document by path and return its ID.
 * Used as a fallback when local file system access is not available.
 */
export async function searchPaperlessByPath(searchPath: string): Promise<number | null> {
  try {
    const response = await api.paperless.search(searchPath, 1, 'all');
    if (response.results.length > 0) {
      return response.results[0].id;
    }
    return null;
  } catch (error) {
    return null;
  }
}
