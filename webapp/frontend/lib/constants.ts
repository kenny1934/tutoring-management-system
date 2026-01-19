/**
 * Shared constants used across the application
 */

// Day names for calendar views
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

// Map day names to day index (Sunday = 0)
export const DAY_NAME_TO_INDEX: Record<string, number> = {
  'Sun': 0, 'Sunday': 0,
  'Mon': 1, 'Monday': 1,
  'Tue': 2, 'Tuesday': 2,
  'Wed': 3, 'Wednesday': 3,
  'Thu': 4, 'Thursday': 4,
  'Fri': 5, 'Friday': 5,
  'Sat': 6, 'Saturday': 6,
};

// Grade + language stream color mapping
// Keys are grade + lang_stream combinations (e.g., "F1C" = Form 1 Chinese stream)
export const GRADE_COLORS: Record<string, string> = {
  "F1C": "#c2dfce",
  "F1E": "#cedaf5",
  "F2C": "#fbf2d0",
  "F2E": "#f0a19e",
  "F3C": "#e2b1cc",
  "F3E": "#ebb26e",
  "F4C": "#7dc347",
  "F4E": "#a590e6",
};

// Default color when grade/stream not found
export const DEFAULT_GRADE_COLOR = "#e5e7eb";

/**
 * Get the color for a grade + language stream combination
 */
export function getGradeColor(grade: string | undefined, langStream: string | undefined): string {
  const key = `${grade || ""}${langStream || ""}`;
  return GRADE_COLORS[key] || DEFAULT_GRADE_COLOR;
}


// Floating-UI middleware configuration for popovers
export const FLOATING_UI_MIDDLEWARE_CONFIG = {
  offset: 8,
  flipPadding: 10,
  shiftPadding: 10,
} as const;

// Current user constant (will be replaced with OAuth)
export const CURRENT_USER_TUTOR = "Mr Kenny Chiu";
