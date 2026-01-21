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

// Time slot constants for scheduling
export const WEEKDAY_TIME_SLOTS = ["16:45 - 18:15", "18:25 - 19:55"] as const;
export const WEEKEND_TIME_SLOTS = ["10:00 - 11:30", "11:45 - 13:15", "14:30 - 16:00", "16:15 - 17:45", "18:00 - 19:30"] as const;
export const ALL_TIME_SLOTS = [...WEEKEND_TIME_SLOTS.slice(0, 4), WEEKDAY_TIME_SLOTS[0], WEEKEND_TIME_SLOTS[4], WEEKDAY_TIME_SLOTS[1]] as const;

/**
 * Get appropriate time slots for a given day
 */
export function getTimeSlotsForDay(dayIndex: number): readonly string[] {
  return dayIndex === 0 || dayIndex === 6 ? WEEKEND_TIME_SLOTS : WEEKDAY_TIME_SLOTS;
}

/**
 * Check if a date string represents a weekend
 */
export function isWeekend(dateStr: string): boolean {
  const day = new Date(dateStr).getDay();
  return day === 0 || day === 6;
}
