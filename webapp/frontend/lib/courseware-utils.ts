/**
 * Utilities for courseware path extraction and handling.
 */

import type { CoursewarePopularity } from "@/types";
import type { PaperlessDocument } from "@/lib/api";

// Re-export for convenience
export type { PaperlessDocument };

/**
 * Extended document type with optional fields from search results.
 * API responses may include additional fields not in the base type.
 */
export interface ExtendedPaperlessDocument extends PaperlessDocument {
  original_file_name?: string;
  correspondent_name?: string;
}

/**
 * Extract the best available path from a Paperless document.
 * Priority: converted_path > original_path > original_file_name > title
 */
export function getDocumentPath(doc: ExtendedPaperlessDocument): string {
  return doc.converted_path || doc.original_path || doc.original_file_name || doc.title;
}

/**
 * Extract the best available path from a CoursewarePopularity item.
 * Uses the first path from normalized_paths, falling back to filename.
 */
export function getTrendingPath(item: CoursewarePopularity): string {
  return item.normalized_paths?.split(", ")[0] || item.filename;
}
