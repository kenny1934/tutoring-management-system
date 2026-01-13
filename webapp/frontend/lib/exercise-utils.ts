/**
 * Shared utilities for exercise parsing and formatting.
 * Used by ExerciseModal and BulkExerciseModal.
 */

/**
 * Parse DB remarks field into separate complex_pages and remarks.
 * The DB stores complex pages encoded as "Pages: 1,3,5-7" prefix in remarks field.
 * Format: "Pages: <range> || <actual remarks>"
 *
 * @param dbRemarks - The raw remarks string from the database
 * @returns Object with complexPages and remarks separated
 */
export function parseExerciseRemarks(dbRemarks: string | null | undefined): {
  complexPages: string;
  remarks: string;
} {
  if (!dbRemarks) return { complexPages: '', remarks: '' };

  if (dbRemarks.startsWith('Pages: ')) {
    const delimiterIdx = dbRemarks.indexOf(' || ');
    if (delimiterIdx > 0) {
      return {
        complexPages: dbRemarks.substring(7, delimiterIdx),
        remarks: dbRemarks.substring(delimiterIdx + 4)
      };
    }
    return { complexPages: dbRemarks.substring(7), remarks: '' };
  }

  return { complexPages: '', remarks: dbRemarks };
}

/**
 * Detect which page mode should be active based on field values.
 *
 * @param pageStart - The page_start field value
 * @param pageEnd - The page_end field value
 * @param complexPages - The parsed complex_pages value
 * @returns 'simple' or 'custom'
 */
export function detectPageMode(
  pageStart: string | number | null | undefined,
  pageEnd: string | number | null | undefined,
  complexPages: string
): 'simple' | 'custom' {
  if (complexPages && complexPages.trim()) return 'custom';
  if ((pageStart && String(pageStart).trim()) || (pageEnd && String(pageEnd).trim())) return 'simple';
  return 'simple';
}

/**
 * Combine complex_pages and remarks for DB storage.
 * Format: "Pages: <range> || <actual remarks>" or just "<range>" or just "<remarks>"
 *
 * @param complexPages - The custom page range (e.g., "1,3,5-7")
 * @param remarks - The actual remarks text
 * @returns Combined string for DB storage
 */
export function combineExerciseRemarks(complexPages: string, remarks: string): string {
  const parts: string[] = [];
  if (complexPages.trim()) parts.push(`Pages: ${complexPages.trim()}`);
  if (remarks.trim()) parts.push(remarks.trim());
  return parts.join(' || ');
}
