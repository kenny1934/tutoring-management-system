import { describe, it, expect } from 'vitest';
import {
  getWeekBounds,
  getWeekDates,
  getMonthBounds,
  parseTimeSlot,
  timeToMinutes,
  isTimeRangeValid,
  generateTimeSlots,
  findNearestTimeSlot,
  isSameDay,
  toDateString,
  getDayName,
  getMonthName,
  getPreviousWeek,
  getNextWeek,
  getPreviousMonth,
  getNextMonth,
  getSchoolYearWeek,
  calculateSessionPosition,
  calculateSessionHeight,
  getWeekStartStr,
  getWeekEndStr,
  getWeekDateStrings,
} from './calendar-utils';

// ============================================================================
// getWeekBounds
// ============================================================================

describe('getWeekBounds', () => {
  it('returns Sunday to Saturday', () => {
    // 2026-03-11 is a Wednesday
    const { start, end } = getWeekBounds(new Date('2026-03-11T12:00:00'));
    expect(start.getDay()).toBe(0); // Sunday
    expect(end.getDay()).toBe(6);   // Saturday
  });

  it('start is before or equal to input date', () => {
    const date = new Date('2026-03-11T12:00:00');
    const { start } = getWeekBounds(date);
    expect(start.getTime()).toBeLessThanOrEqual(date.getTime());
  });
});

// ============================================================================
// getWeekDates
// ============================================================================

describe('getWeekDates', () => {
  it('returns 7 dates', () => {
    const dates = getWeekDates(new Date('2026-03-11T00:00:00'));
    expect(dates).toHaveLength(7);
  });

  it('first date is Sunday', () => {
    const dates = getWeekDates(new Date('2026-03-11T00:00:00'));
    expect(dates[0].getDay()).toBe(0);
  });

  it('last date is Saturday', () => {
    const dates = getWeekDates(new Date('2026-03-11T00:00:00'));
    expect(dates[6].getDay()).toBe(6);
  });
});

// ============================================================================
// getMonthBounds
// ============================================================================

describe('getMonthBounds', () => {
  it('returns first and last day of month', () => {
    const { start, end } = getMonthBounds(new Date('2026-03-15T00:00:00'));
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(31); // March has 31 days
  });

  it('handles February in non-leap year', () => {
    const { end } = getMonthBounds(new Date('2026-02-15T00:00:00'));
    expect(end.getDate()).toBe(28);
  });
});

// ============================================================================
// parseTimeSlot
// ============================================================================

describe('parseTimeSlot', () => {
  it('parses standard format', () => {
    expect(parseTimeSlot('09:00 - 10:00')).toEqual({ start: '09:00', end: '10:00' });
  });

  it('parses compact format', () => {
    expect(parseTimeSlot('09:00-10:00')).toEqual({ start: '09:00', end: '10:00' });
  });

  it('normalizes single-digit hours', () => {
    expect(parseTimeSlot('9:30 - 10:30')).toEqual({ start: '09:30', end: '10:30' });
  });

  it('returns null for empty', () => {
    expect(parseTimeSlot('')).toBeNull();
  });

  it('returns null for Unscheduled', () => {
    expect(parseTimeSlot('Unscheduled')).toBeNull();
  });

  it('returns null for invalid format', () => {
    expect(parseTimeSlot('invalid')).toBeNull();
  });
});

// ============================================================================
// timeToMinutes
// ============================================================================

describe('timeToMinutes', () => {
  it('converts hours and minutes', () => {
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('handles noon', () => {
    expect(timeToMinutes('12:00')).toBe(720);
  });
});

// ============================================================================
// isTimeRangeValid
// ============================================================================

describe('isTimeRangeValid', () => {
  it('returns true when end > start', () => {
    expect(isTimeRangeValid('09:00', '10:00')).toBe(true);
  });

  it('returns false when end <= start', () => {
    expect(isTimeRangeValid('10:00', '09:00')).toBe(false);
    expect(isTimeRangeValid('10:00', '10:00')).toBe(false);
  });
});

// ============================================================================
// generateTimeSlots
// ============================================================================

describe('generateTimeSlots', () => {
  it('starts at 08:00', () => {
    const slots = generateTimeSlots();
    expect(slots[0]).toBe('08:00');
  });

  it('ends at 21:30', () => {
    const slots = generateTimeSlots();
    expect(slots[slots.length - 1]).toBe('21:30');
  });

  it('has 30-minute intervals', () => {
    const slots = generateTimeSlots();
    // 14 hours * 2 slots per hour = 28
    expect(slots).toHaveLength(28);
  });
});

// ============================================================================
// findNearestTimeSlot
// ============================================================================

describe('findNearestTimeSlot', () => {
  it('returns exact match', () => {
    expect(findNearestTimeSlot('14:30')).toBe('14:30');
  });

  it('rounds down to nearest 30', () => {
    expect(findNearestTimeSlot('14:45')).toBe('14:30');
  });

  it('rounds down from :29', () => {
    expect(findNearestTimeSlot('14:29')).toBe('14:00');
  });
});

// ============================================================================
// isSameDay
// ============================================================================

describe('isSameDay', () => {
  it('returns true for same day', () => {
    expect(isSameDay(
      new Date('2026-03-11T10:00:00'),
      new Date('2026-03-11T22:00:00')
    )).toBe(true);
  });

  it('returns false for different days', () => {
    expect(isSameDay(
      new Date('2026-03-11T00:00:00'),
      new Date('2026-03-12T00:00:00')
    )).toBe(false);
  });
});

// ============================================================================
// toDateString
// ============================================================================

describe('toDateString', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(toDateString(new Date('2026-03-11T00:00:00'))).toBe('2026-03-11');
  });

  it('pads single-digit months and days', () => {
    expect(toDateString(new Date('2026-01-05T00:00:00'))).toBe('2026-01-05');
  });
});

// ============================================================================
// getDayName / getMonthName
// ============================================================================

describe('getDayName', () => {
  it('returns short name by default', () => {
    // 2026-03-11 is Wednesday
    expect(getDayName(new Date('2026-03-11T00:00:00'))).toBe('Wed');
  });

  it('returns long name', () => {
    expect(getDayName(new Date('2026-03-11T00:00:00'), false)).toBe('Wednesday');
  });
});

describe('getMonthName', () => {
  it('returns long name by default', () => {
    expect(getMonthName(new Date('2026-03-11T00:00:00'))).toBe('March');
  });

  it('returns short name', () => {
    expect(getMonthName(new Date('2026-03-11T00:00:00'), true)).toBe('Mar');
  });
});

// ============================================================================
// Week/Month navigation
// ============================================================================

describe('week/month navigation', () => {
  it('getPreviousWeek subtracts 7 days', () => {
    const date = new Date('2026-03-11T00:00:00');
    expect(toDateString(getPreviousWeek(date))).toBe('2026-03-04');
  });

  it('getNextWeek adds 7 days', () => {
    const date = new Date('2026-03-11T00:00:00');
    expect(toDateString(getNextWeek(date))).toBe('2026-03-18');
  });

  it('getPreviousMonth goes back one month', () => {
    const date = new Date('2026-03-11T00:00:00');
    const prev = getPreviousMonth(date);
    expect(prev.getMonth()).toBe(1); // February
  });

  it('getNextMonth goes forward one month', () => {
    const date = new Date('2026-03-11T00:00:00');
    const next = getNextMonth(date);
    expect(next.getMonth()).toBe(3); // April
  });
});

// ============================================================================
// getSchoolYearWeek
// ============================================================================

describe('getSchoolYearWeek', () => {
  it('returns week 1 for first week of September', () => {
    // Sept 1, 2025 is a Monday → week containing it starts Sun Aug 31
    const week = getSchoolYearWeek(new Date('2025-09-01T00:00:00'));
    expect(week).toBe(1);
  });

  it('returns correct week mid-year', () => {
    // About 27 weeks after Sept 1, 2025 → around early March 2026
    const week = getSchoolYearWeek(new Date('2026-03-11T00:00:00'));
    expect(week).toBeGreaterThan(20);
  });

  it('handles dates before September (previous school year)', () => {
    // August 2026 → still school year starting Sept 2025
    const week = getSchoolYearWeek(new Date('2026-08-01T00:00:00'));
    expect(week).toBeGreaterThan(40);
  });
});

// ============================================================================
// calculateSessionPosition / calculateSessionHeight
// ============================================================================

describe('calculateSessionPosition', () => {
  it('calculates position from 10:00 AM baseline', () => {
    // 11:00 is 60 minutes after 10:00
    expect(calculateSessionPosition('11:00 - 12:00', 1)).toBe(60);
  });

  it('returns 0 for invalid slot', () => {
    expect(calculateSessionPosition('invalid')).toBe(0);
  });
});

describe('calculateSessionHeight', () => {
  it('calculates height from duration', () => {
    // 90 minute session
    expect(calculateSessionHeight('09:00 - 10:30', 1)).toBe(90);
  });

  it('returns 60 for invalid slot', () => {
    expect(calculateSessionHeight('invalid')).toBe(60);
  });
});

// ============================================================================
// String-based week helpers
// ============================================================================

describe('string-based week helpers', () => {
  it('getWeekStartStr returns Sunday date string', () => {
    // 2026-03-11 is Wednesday, week starts Sunday 2026-03-08
    expect(getWeekStartStr('2026-03-11')).toBe('2026-03-08');
  });

  it('getWeekEndStr returns Saturday date string', () => {
    expect(getWeekEndStr('2026-03-11')).toBe('2026-03-14');
  });

  it('getWeekDateStrings returns 7 strings', () => {
    const dates = getWeekDateStrings('2026-03-08');
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe('2026-03-08');
    expect(dates[6]).toBe('2026-03-14');
  });
});
