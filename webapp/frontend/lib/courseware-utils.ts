/**
 * Utilities for courseware path extraction and handling.
 */

import { canonicalMaterialPath } from "./materials";
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

/** Legacy path lists use comma separators, but filenames can contain commas.
 * A new path must start at a share, drive or UNC boundary.
 */
export function splitCoursewarePaths(value: string): string[] {
  return value.split(/,\s*(?=(?:[\\/]|[A-Za-z]:[\\/]|\[[^\]]+\][\\/]|(?:Center|Courseware Developer 中學|MSA Staff)[\\/]))/i).map(path => path.trim()).filter(Boolean);
}

/** Prefer a supported complete path when older records also contain rootless copies. */
export function getTrendingPath(item: Pick<CoursewarePopularity, 'normalized_paths' | 'filename'>): string {
  const paths = splitCoursewarePaths(item.normalized_paths || '');
  return paths.find(path => canonicalMaterialPath(path) && /\.(?:pdf|docx?|xlsx?|pptx?|jpg|png)$/i.test(path))
    || paths.find(path => canonicalMaterialPath(path)) || paths[0] || item.filename;
}
