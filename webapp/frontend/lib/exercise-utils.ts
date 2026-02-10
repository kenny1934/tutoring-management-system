/**
 * Shared utilities for exercise parsing and formatting.
 * Used by ExerciseModal and BulkExerciseModal.
 */

import type { PageSelection } from '@/types';

// ============================================================================
// Exercise Creation Utilities
// ============================================================================

/**
 * Base interface for exercise form items.
 * Both ExerciseModal and BulkExerciseModal extend this with optional `id`.
 */
export interface ExerciseFormItemBase {
  clientId: string;
  exercise_type: "CW" | "HW";
  pdf_name: string;
  page_mode: 'simple' | 'custom';
  page_start: string;
  page_end: string;
  complex_pages: string;
  remarks: string;
  // Answer file fields (for manual answer selection)
  answer_pdf_name: string;
  answer_page_mode: 'simple' | 'custom';
  answer_page_start: string;
  answer_page_end: string;
  answer_complex_pages: string;
}

/**
 * Generate unique client ID for exercise rows.
 * Used for stable state tracking (fileActionState, etc.) that survives row reordering.
 */
let clientIdCounter = 0;
export function generateClientId(): string {
  return `ex-${Date.now()}-${++clientIdCounter}`;
}

/**
 * Create a new empty exercise.
 * Used when adding a new row or for drag-drop with just a path.
 */
export function createExercise(
  exerciseType: "CW" | "HW",
  pdfName: string = ""
): ExerciseFormItemBase {
  return {
    clientId: generateClientId(),
    exercise_type: exerciseType,
    pdf_name: pdfName,
    page_mode: 'simple',
    page_start: "",
    page_end: "",
    complex_pages: "",
    remarks: "",
    // Answer fields default empty
    answer_pdf_name: "",
    answer_page_mode: 'simple',
    answer_page_start: "",
    answer_page_end: "",
    answer_complex_pages: "",
  };
}

/**
 * Create exercise from a file selection with optional page info.
 * Used for Paperless selections and folder picker results.
 */
export function createExerciseFromSelection(
  exerciseType: "CW" | "HW",
  path: string,
  pageSelection?: PageSelection | null
): ExerciseFormItemBase {
  if (pageSelection?.complexRange) {
    return {
      clientId: generateClientId(),
      exercise_type: exerciseType,
      pdf_name: path,
      page_mode: 'custom',
      page_start: "",
      page_end: "",
      complex_pages: pageSelection.complexRange,
      remarks: "",
      answer_pdf_name: "",
      answer_page_mode: 'simple',
      answer_page_start: "",
      answer_page_end: "",
      answer_complex_pages: "",
    };
  }

  return {
    clientId: generateClientId(),
    exercise_type: exerciseType,
    pdf_name: path,
    page_mode: 'simple',
    page_start: pageSelection?.pageStart?.toString() || "",
    page_end: pageSelection?.pageEnd?.toString() || "",
    complex_pages: "",
    remarks: "",
    answer_pdf_name: "",
    answer_page_mode: 'simple',
    answer_page_start: "",
    answer_page_end: "",
    answer_complex_pages: "",
  };
}

/**
 * Get page field values from a PageSelection.
 * Used to apply page selection to an existing exercise row.
 * Returns null if no page info is present.
 */
export function getPageFieldsFromSelection(pageSelection?: PageSelection | null): {
  page_mode: 'simple' | 'custom';
  page_start: string;
  page_end: string;
  complex_pages: string;
} | null {
  if (!pageSelection) return null;

  if (pageSelection.complexRange) {
    return {
      page_mode: 'custom',
      page_start: '',
      page_end: '',
      complex_pages: pageSelection.complexRange,
    };
  }

  if (pageSelection.pageStart !== undefined || pageSelection.pageEnd !== undefined) {
    return {
      page_mode: 'simple',
      page_start: pageSelection.pageStart?.toString() || '',
      page_end: pageSelection.pageEnd?.toString() || '',
      complex_pages: '',
    };
  }

  return null;
}

/**
 * Insert new exercises after a given index in the array.
 * Used for multi-select handlers where first item fills current row,
 * and remaining items are inserted after.
 */
export function insertExercisesAfterIndex<T>(
  exercises: T[],
  insertAfterIndex: number,
  newItems: T[]
): T[] {
  const before = exercises.slice(0, insertAfterIndex + 1);
  const after = exercises.slice(insertAfterIndex + 1);
  return [...before, ...newItems, ...after];
}

// ============================================================================
// Page Parsing Utilities
// ============================================================================

/**
 * Parse page input string into PageSelection.
 * Accepts: "5", "1-5", "1~5", "1,3,5-7"
 *
 * @param input - User input string for page range
 * @returns PageSelection object or undefined if empty
 */
export function parsePageInput(input: string): PageSelection | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  // Normalize common "to" separators: - ~ – — −
  const normalized = trimmed.replace(/[~–—−]/g, '-');

  // Simple range pattern: "5" or "1-5"
  const match = normalized.match(/^(\d+)(?:-(\d+))?$/);
  if (match) {
    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : start;
    return { pageStart: start, pageEnd: end };
  }

  // Everything else → complex mode (pass normalized string)
  return { complexRange: normalized };
}

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

/**
 * Exercise validation error
 */
export interface ExerciseValidationError {
  index: number;
  field: 'page_start' | 'page_end' | 'complex_pages' | 'pdf_name';
  message: string;
}

/**
 * Validate an exercise's page range fields.
 *
 * @param exercise - Exercise with page fields to validate
 * @param index - Index of the exercise (for error reporting)
 * @returns Array of validation errors (empty if valid)
 */
export function validateExercisePageRange(
  exercise: {
    page_mode: 'simple' | 'custom';
    page_start: string;
    page_end: string;
    complex_pages: string;
    pdf_name: string;
  },
  index: number
): ExerciseValidationError[] {
  const errors: ExerciseValidationError[] = [];

  if (exercise.page_mode === 'simple') {
    const start = exercise.page_start.trim();
    const end = exercise.page_end.trim();

    if (start) {
      const startNum = parseInt(start, 10);
      if (isNaN(startNum) || startNum < 1) {
        errors.push({ index, field: 'page_start', message: 'Start page must be a positive number' });
      } else if (end) {
        const endNum = parseInt(end, 10);
        if (isNaN(endNum) || endNum < 1) {
          errors.push({ index, field: 'page_end', message: 'End page must be a positive number' });
        } else if (endNum < startNum) {
          errors.push({ index, field: 'page_end', message: 'End page must be ≥ start page' });
        }
      }
    } else if (end) {
      // Has end but no start - that's unusual but valid, treat as single page
      const endNum = parseInt(end, 10);
      if (isNaN(endNum) || endNum < 1) {
        errors.push({ index, field: 'page_end', message: 'Page must be a positive number' });
      }
    }
  } else if (exercise.page_mode === 'custom') {
    const range = exercise.complex_pages.trim();
    if (range) {
      // Check for at least one valid page number pattern
      const hasValidNumber = /\d+/.test(range);
      if (!hasValidNumber) {
        errors.push({ index, field: 'complex_pages', message: 'Invalid page range format' });
      }
    }
  }

  return errors;
}

// ============================================================================
// Display Utilities
// ============================================================================

/**
 * Extract display name from PDF path.
 * Removes directory path and file extension.
 * "V:\abc\def\ghi.pdf" → "ghi"
 * "jkl.docx" → "jkl"
 */
export function getDisplayName(pdfName: string): string {
  const filename = pdfName.split(/[/\\]/).pop() || pdfName;
  return filename.replace(/\.[^.]+$/, '');
}

// ============================================================================
// Clipboard Utilities
// ============================================================================

const CLIPBOARD_KEY = 'csm_exercise_clipboard';
const CLIPBOARD_EVENT = 'exercise-clipboard-changed';

export interface ExerciseClipboardItem {
  pdf_name: string;
  page_mode: 'simple' | 'custom';
  page_start: string;
  page_end: string;
  complex_pages: string;
  remarks: string;
  answer_pdf_name: string;
  answer_page_mode: 'simple' | 'custom';
  answer_page_start: string;
  answer_page_end: string;
  answer_complex_pages: string;
}

export interface ExerciseClipboardData {
  exercises: ExerciseClipboardItem[];
  sourceSessionId: number;
  sourceStudentName: string;
  copiedAt: string;
}

function dispatchClipboardEvent() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CLIPBOARD_EVENT));
  }
}

/**
 * Copy exercises to sessionStorage clipboard.
 * Strips clientId, id, and exercise_type — those are regenerated on paste.
 */
export function copyExercisesToClipboard(
  exercises: ExerciseFormItemBase[],
  sourceSessionId: number,
  sourceStudentName: string
): number {
  if (typeof window === 'undefined') return 0;

  const items: ExerciseClipboardItem[] = exercises.map(ex => ({
    pdf_name: ex.pdf_name,
    page_mode: ex.page_mode,
    page_start: ex.page_start,
    page_end: ex.page_end,
    complex_pages: ex.complex_pages,
    remarks: ex.remarks,
    answer_pdf_name: ex.answer_pdf_name,
    answer_page_mode: ex.answer_page_mode,
    answer_page_start: ex.answer_page_start,
    answer_page_end: ex.answer_page_end,
    answer_complex_pages: ex.answer_complex_pages,
  }));

  const data: ExerciseClipboardData = {
    exercises: items,
    sourceSessionId,
    sourceStudentName,
    copiedAt: new Date().toISOString(),
  };

  sessionStorage.setItem(CLIPBOARD_KEY, JSON.stringify(data));
  dispatchClipboardEvent();
  return items.length;
}

/**
 * Read clipboard data from sessionStorage.
 * Returns null if clipboard is empty or corrupted.
 */
export function getExerciseClipboard(): ExerciseClipboardData | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem(CLIPBOARD_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as ExerciseClipboardData;
    if (!data.exercises || !Array.isArray(data.exercises) || data.exercises.length === 0) {
      return null;
    }
    return data;
  } catch {
    try { sessionStorage.removeItem(CLIPBOARD_KEY); } catch { /* ignore */ }
    return null;
  }
}

/**
 * Clear the exercise clipboard.
 */
export function clearExerciseClipboard(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(CLIPBOARD_KEY);
  dispatchClipboardEvent();
}

/**
 * Create ExerciseFormItemBase array from clipboard items.
 * Generates fresh clientIds and sets the target exercise_type.
 */
export function createExercisesFromClipboard(
  items: ExerciseClipboardItem[],
  exerciseType: "CW" | "HW"
): ExerciseFormItemBase[] {
  return items.map(item => ({
    clientId: generateClientId(),
    exercise_type: exerciseType,
    pdf_name: item.pdf_name,
    page_mode: item.page_mode,
    page_start: item.page_start,
    page_end: item.page_end,
    complex_pages: item.complex_pages,
    remarks: item.remarks,
    answer_pdf_name: item.answer_pdf_name,
    answer_page_mode: item.answer_page_mode,
    answer_page_start: item.answer_page_start,
    answer_page_end: item.answer_page_end,
    answer_complex_pages: item.answer_complex_pages,
  }));
}

/** Event name for clipboard change listeners */
export { CLIPBOARD_EVENT };
