/**
 * Shared constants used across the application
 */

// Marginal monthly bonus schedule by session revenue. Each band is paid at its
// own rate. Source of truth: calculate_monthly_bonus() in
// backend/routers/revenue.py. Keep in sync.
export const BONUS_TIERS: [string, string][] = [
  ["Up to 50,000", "0%"],
  ["50,000 to 80,000", "5%"],
  ["80,000 to 90,000", "10%"],
  ["90,000 to 120,000", "25%"],
  ["Above 120,000", "30%"],
];

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
  "P6C": "#fdd8a3",
  "P6E": "#a8d8b9",
  "F1C": "#c2dfce",
  "F1E": "#cedaf5",
  "F2C": "#fbf2d0",
  "F2E": "#f0a19e",
  "F3C": "#e2b1cc",
  "F3E": "#ebb26e",
  "F4C": "#7dc347",
  "F4E": "#a590e6",
  "Graduated": "#cbd5e1",
  "GraduatedC": "#cbd5e1",
  "GraduatedE": "#cbd5e1",
};

// Default color when grade/stream not found
export const DEFAULT_GRADE_COLOR = "#e5e7eb";

// Discounts (coupons, staff referral, trial conversion) only apply to
// enrollments of at least this many lessons. Mirrors the backend constant.
export const MIN_LESSONS_FOR_DISCOUNT = 6;

// Promo discount type whose value scales per 2 lessons (e.g. $100 off every
// 2 extra lessons) and which is exempt from MIN_LESSONS_FOR_DISCOUNT.
// Mirrors the backend constant. Stored on Discount.discount_type.
export const PER_TWO_LESSONS_DISCOUNT_TYPE = "per_2_lessons";

// Minimum lesson count a given discount needs to apply. Per-2-lessons promos
// start from the first pair; all other discounts require the standard floor.
export function minLessonsForDiscount(
  discount?: { discount_type?: string } | null
): number {
  return discount?.discount_type === PER_TWO_LESSONS_DISCOUNT_TYPE
    ? 2
    : MIN_LESSONS_FOR_DISCOUNT;
}

// Grade levels (regular). P6 is admin-only (summer create-student flow);
// Graduated is the auto-promotion target for F6 students.
export const GRADES = ["F1", "F2", "F3", "F4", "F5", "F6", "Graduated"] as const;

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
