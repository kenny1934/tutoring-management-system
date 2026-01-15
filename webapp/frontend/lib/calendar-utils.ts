import type { Session } from "@/types";

/**
 * Get the start and end dates of the week containing the given date
 */
export function getWeekBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  const day = start.getDay();
  const diff = start.getDate() - day; // Sunday as first day
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Get an array of 7 dates for the week containing the given date
 */
export function getWeekDates(date: Date): Date[] {
  const { start } = getWeekBounds(date);
  const dates: Date[] = [];

  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    dates.push(day);
  }

  return dates;
}

/**
 * Get the start and end dates of the month containing the given date
 */
export function getMonthBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

/**
 * Get an array of dates for the calendar month view (including padding days)
 */
export function getMonthCalendarDates(date: Date): Date[] {
  const { start, end } = getMonthBounds(date);
  const dates: Date[] = [];

  // Add padding days from previous month
  const startDay = start.getDay();
  for (let i = startDay - 1; i >= 0; i--) {
    const paddingDate = new Date(start);
    paddingDate.setDate(start.getDate() - i - 1);
    dates.push(paddingDate);
  }

  // Add all days in the month
  const daysInMonth = end.getDate();
  for (let i = 1; i <= daysInMonth; i++) {
    const day = new Date(date.getFullYear(), date.getMonth(), i);
    dates.push(day);
  }

  // Add padding days from next month to complete the grid
  const endDay = end.getDay();
  const paddingDaysNeeded = 6 - endDay;
  for (let i = 1; i <= paddingDaysNeeded; i++) {
    const paddingDate = new Date(end);
    paddingDate.setDate(end.getDate() + i);
    dates.push(paddingDate);
  }

  return dates;
}

/**
 * Parse time from time slot string (e.g., "09:00 - 10:00" -> { start: "09:00", end: "10:00" })
 * Handles various formats:
 * - "09:00 - 10:00" (with spaces)
 * - "09:00-10:00" (no spaces)
 * - "9:30 - 10:30" (single-digit hours)
 * - "9:30-10:30" (single-digit, no spaces)
 */
export function parseTimeSlot(timeSlot: string): { start: string; end: string } | null {
  if (!timeSlot || timeSlot === "Unscheduled") {
    return null;
  }

  // Match H:MM or HH:MM with optional spaces around dash
  // Handles: "9:30-10:30", "09:00 - 10:00", "9:30 - 10:30"
  const match = timeSlot.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!match) {
    return null;
  }

  // Normalize to HH:MM format (add leading zero if needed)
  const normalizeTime = (time: string): string => {
    const [hours, minutes] = time.split(':');
    return `${hours.padStart(2, '0')}:${minutes}`;
  };

  return {
    start: normalizeTime(match[1]),
    end: normalizeTime(match[2])
  };
}

/**
 * Convert time string to minutes since midnight (e.g., "09:30" -> 570)
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

/**
 * Generate all time slots for a day (every 30 minutes from 08:00 to 22:00)
 * Returns simple time strings for grid rows: ["08:00", "08:30", "09:00", ...]
 */
export function generateTimeSlots(): string[] {
  const slots: string[] = [];
  const startHour = 8;
  const endHour = 22;

  for (let hour = startHour; hour < endHour; hour++) {
    for (const minute of [0, 30]) {
      const time = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
      slots.push(time);
    }
  }

  return slots;
}

/**
 * Group sessions by date
 */
export function groupSessionsByDate(sessions: Session[]): Map<string, Session[]> {
  const grouped = new Map<string, Session[]>();

  sessions.forEach((session) => {
    const dateKey = session.session_date;
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey)!.push(session);
  });

  return grouped;
}

/**
 * Group sessions by time slot
 */
export function groupSessionsByTimeSlot(sessions: Session[]): Map<string, Session[]> {
  const grouped = new Map<string, Session[]>();

  sessions.forEach((session) => {
    const timeSlot = session.time_slot || "Unscheduled";
    if (!grouped.has(timeSlot)) {
      grouped.set(timeSlot, []);
    }
    grouped.get(timeSlot)!.push(session);
  });

  return grouped;
}

/**
 * Find the nearest 30-minute time slot for a given time
 * E.g., "14:30" -> "14:30", "14:45" -> "14:30", "15:00" -> "15:00"
 */
export function findNearestTimeSlot(time: string): string {
  const minutes = timeToMinutes(time);
  // Round down to nearest 30 minutes
  const roundedMinutes = Math.floor(minutes / 30) * 30;
  const hours = Math.floor(roundedMinutes / 60);
  const mins = roundedMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Group sessions by both date and start time (rounded to 30-min slots)
 * This allows sessions with any time_slot format to be positioned correctly
 */
export function groupSessionsByDateTime(sessions: Session[]): Map<string, Map<string, Session[]>> {
  const grouped = new Map<string, Map<string, Session[]>>();

  sessions.forEach((session) => {
    const dateKey = session.session_date;

    // Parse the time slot to get start time
    const parsed = parseTimeSlot(session.time_slot);
    let timeKey: string;

    if (parsed) {
      // Round start time to nearest 30-minute slot for grid positioning
      timeKey = findNearestTimeSlot(parsed.start);
    } else {
      timeKey = "Unscheduled";
    }

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, new Map());
    }

    const dateGroup = grouped.get(dateKey)!;
    if (!dateGroup.has(timeKey)) {
      dateGroup.set(timeKey, []);
    }

    dateGroup.get(timeKey)!.push(session);
  });

  return grouped;
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Format date to ISO string (YYYY-MM-DD) in local timezone
 */
export function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get day name (Sun, Mon, Tue, etc.)
 */
export function getDayName(date: Date, short: boolean = true): string {
  return date.toLocaleDateString("en-US", {
    weekday: short ? "short" : "long",
  });
}

/**
 * Get month name
 */
export function getMonthName(date: Date, short: boolean = false): string {
  return date.toLocaleDateString("en-US", {
    month: short ? "short" : "long",
  });
}

/**
 * Navigate to previous week
 */
export function getPreviousWeek(date: Date): Date {
  const prev = new Date(date);
  prev.setDate(prev.getDate() - 7);
  return prev;
}

/**
 * Navigate to next week
 */
export function getNextWeek(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 7);
  return next;
}

/**
 * Navigate to previous month
 */
export function getPreviousMonth(date: Date): Date {
  const prev = new Date(date);
  prev.setMonth(prev.getMonth() - 1);
  return prev;
}

/**
 * Navigate to next month
 */
export function getNextMonth(date: Date): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Get today's date with time set to 00:00:00
 */
export function getToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Get the school year week number (Week 1 = first week of September)
 * School year starts on September 1st
 */
export function getSchoolYearWeek(date: Date): number {
  // Determine the school year start date
  // If we're before September, school year started previous year
  const year = date.getMonth() < 8 ? date.getFullYear() - 1 : date.getFullYear();
  const schoolYearStart = new Date(year, 8, 1); // September 1st
  schoolYearStart.setHours(0, 0, 0, 0);

  // Get the start of the week containing Sept 1st
  const startOfSchoolWeek = new Date(schoolYearStart);
  const dayOfWeek = startOfSchoolWeek.getDay();
  startOfSchoolWeek.setDate(startOfSchoolWeek.getDate() - dayOfWeek);

  // Get the start of the current week
  const currentWeekStart = new Date(date);
  const currentDayOfWeek = currentWeekStart.getDay();
  currentWeekStart.setDate(currentWeekStart.getDate() - currentDayOfWeek);
  currentWeekStart.setHours(0, 0, 0, 0);

  // Calculate the difference in weeks
  const diffTime = currentWeekStart.getTime() - startOfSchoolWeek.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(diffDays / 7) + 1;

  return weekNumber;
}

/**
 * Calculate the top position for a session based on its start time
 * Returns pixels from the start of the day (10:00 AM = 0px)
 */
export function calculateSessionPosition(timeSlot: string, pixelsPerMinute: number = 1): number {
  const parsed = parseTimeSlot(timeSlot);
  if (!parsed) return 0;

  const startMinutes = timeToMinutes(parsed.start);
  const dayStartMinutes = 10 * 60; // 10:00 AM

  return (startMinutes - dayStartMinutes) * pixelsPerMinute;
}

/**
 * Calculate the height of a session based on its duration
 * Returns pixels representing the duration
 */
export function calculateSessionHeight(timeSlot: string, pixelsPerMinute: number = 1): number {
  const parsed = parseTimeSlot(timeSlot);
  if (!parsed) return 60; // Default 60px for unscheduled

  const startMinutes = timeToMinutes(parsed.start);
  const endMinutes = timeToMinutes(parsed.end);
  const duration = endMinutes - startMinutes;

  return duration * pixelsPerMinute;
}

/**
 * Detect overlapping sessions and calculate layout positions
 * Returns sessions with layout metadata (left offset, width)
 */
export function calculateSessionLayouts(sessions: Session[]): Array<Session & { layoutLeft: number; layoutWidth: number }> {
  if (sessions.length === 0) return [];

  // Sort by start time
  const sorted = [...sessions].sort((a, b) => {
    const aTime = parseTimeSlot(a.time_slot);
    const bTime = parseTimeSlot(b.time_slot);
    if (!aTime || !bTime) return 0;
    return timeToMinutes(aTime.start) - timeToMinutes(bTime.start);
  });

  const result: Array<Session & { layoutLeft: number; layoutWidth: number }> = [];
  const columns: Array<{ start: number; end: number }> = [];

  for (const session of sorted) {
    const parsed = parseTimeSlot(session.time_slot);
    if (!parsed) {
      result.push({ ...session, layoutLeft: 0, layoutWidth: 100 });
      continue;
    }

    const start = timeToMinutes(parsed.start);
    const end = timeToMinutes(parsed.end);

    // Find the first available column that doesn't overlap
    let columnIndex = 0;
    while (columnIndex < columns.length && columns[columnIndex].end > start) {
      columnIndex++;
    }

    // Place in this column
    if (columnIndex >= columns.length) {
      columns.push({ start, end });
    } else {
      columns[columnIndex] = { start, end };
    }

    // Calculate layout based on total columns needed at this time
    const overlappingColumns = columns.filter(col => col.end > start && col.start < end).length;
    const width = 100 / Math.max(overlappingColumns, 1);
    const left = columnIndex * width;

    result.push({ ...session, layoutLeft: left, layoutWidth: width });
  }

  return result;
}

/**
 * Get the number of days until a date (negative if in the past)
 */
export function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
