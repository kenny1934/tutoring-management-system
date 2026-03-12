import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatStudentDisplay,
  formatStudentHeader,
  formatSessionDateTime,
  formatDateWithDay,
  formatShortDate,
  formatDaysAgo,
  ratingToEmoji,
  formatCompactDateTimeSlot,
  formatProposalDate,
  formatActivityDate,
  formatDateCompact,
} from './formatters';

// ============================================================================
// formatStudentDisplay
// ============================================================================

describe('formatStudentDisplay', () => {
  it('formats all fields', () => {
    expect(formatStudentDisplay({
      location: 'MSA',
      school_student_id: '1968',
      student_name: 'Adalia Lee',
      grade: 'F1',
      lang_stream: 'E',
      school: 'SRL-E',
    })).toBe('MSA 1968 Adalia Lee F1E SRL-E');
  });

  it('handles missing optional fields', () => {
    expect(formatStudentDisplay({
      student_name: 'John',
    })).toBe('John');
  });

  it('returns N/A for empty data', () => {
    expect(formatStudentDisplay({})).toBe('N/A');
  });

  it('combines grade and lang_stream without space', () => {
    expect(formatStudentDisplay({ grade: 'F4', lang_stream: 'C' })).toBe('F4C');
  });
});

// ============================================================================
// formatStudentHeader
// ============================================================================

describe('formatStudentHeader', () => {
  it('formats location-id and name', () => {
    expect(formatStudentHeader({
      location: 'MSA',
      school_student_id: '1968',
      student_name: 'Adalia Lee',
    })).toBe('MSA-1968 Adalia Lee');
  });

  it('handles missing location', () => {
    expect(formatStudentHeader({
      school_student_id: '1968',
      student_name: 'John',
    })).toBe('1968 John');
  });

  it('returns N/A for empty', () => {
    expect(formatStudentHeader({})).toBe('N/A');
  });
});

// ============================================================================
// formatSessionDateTime
// ============================================================================

describe('formatSessionDateTime', () => {
  it('formats full session datetime', () => {
    const result = formatSessionDateTime({
      session_date: '2026-03-11',
      time_slot: '16:45 - 18:15',
      tutor_name: 'Ms Bella Chang',
    });
    expect(result).toContain('2026-03-11');
    expect(result).toContain('Wed');
    expect(result).toContain('16:45 - 18:15');
    expect(result).toContain('Tutor: Ms Bella Chang');
  });

  it('returns N/A for missing date', () => {
    expect(formatSessionDateTime({})).toBe('N/A');
  });

  it('omits time slot when not provided', () => {
    const result = formatSessionDateTime({ session_date: '2026-03-11' });
    expect(result).not.toContain('●');
  });
});

// ============================================================================
// formatDateWithDay
// ============================================================================

describe('formatDateWithDay', () => {
  it('appends day of week', () => {
    // 2026-03-11 is a Wednesday
    expect(formatDateWithDay('2026-03-11')).toBe('2026-03-11 (Wed)');
  });

  it('handles Sunday', () => {
    // 2026-03-15 is a Sunday
    expect(formatDateWithDay('2026-03-15')).toBe('2026-03-15 (Sun)');
  });
});

// ============================================================================
// formatShortDate
// ============================================================================

describe('formatShortDate', () => {
  it('returns dash for null/undefined', () => {
    expect(formatShortDate(null)).toBe('-');
    expect(formatShortDate(undefined)).toBe('-');
  });

  it('formats date string', () => {
    const result = formatShortDate('2025-01-15');
    expect(result).toContain('Jan');
    expect(result).toContain('15');
    expect(result).toContain('2025');
  });
});

// ============================================================================
// formatDaysAgo
// ============================================================================

describe('formatDaysAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns Today for current date', () => {
    expect(formatDaysAgo('2026-03-12')).toBe('Today');
  });

  it('returns Yesterday', () => {
    expect(formatDaysAgo('2026-03-11')).toBe('Yesterday');
  });

  it('returns days ago within a week', () => {
    expect(formatDaysAgo('2026-03-09')).toBe('3d ago');
  });

  it('returns formatted date for older dates', () => {
    const result = formatDaysAgo('2026-02-15');
    expect(result).toContain('Feb');
    expect(result).toContain('15');
  });
});

// ============================================================================
// ratingToEmoji
// ============================================================================

describe('ratingToEmoji', () => {
  it('returns correct number of stars', () => {
    expect(ratingToEmoji(3)).toBe('⭐⭐⭐');
    expect(ratingToEmoji(1)).toBe('⭐');
    expect(ratingToEmoji(0)).toBe('');
  });
});

// ============================================================================
// formatCompactDateTimeSlot
// ============================================================================

describe('formatCompactDateTimeSlot', () => {
  it('formats as d/m (Day) HH:MM-HH:MM', () => {
    const date = new Date('2026-03-11T00:00:00');
    const result = formatCompactDateTimeSlot(date, '09:00 - 10:00');
    expect(result).toBe('11/3 (Wed) 09:00-10:00');
  });
});

// ============================================================================
// formatProposalDate
// ============================================================================

describe('formatProposalDate', () => {
  it('formats with weekday', () => {
    const result = formatProposalDate('2026-01-18');
    expect(result).toContain('Sun');
    expect(result).toContain('Jan');
    expect(result).toContain('18');
    expect(result).toContain('2026');
  });
});

// ============================================================================
// formatActivityDate
// ============================================================================

describe('formatActivityDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns Today for current date', () => {
    expect(formatActivityDate(new Date('2026-03-12T10:00:00'))).toBe('Today');
  });

  it('returns Yesterday', () => {
    expect(formatActivityDate(new Date('2026-03-11T10:00:00'))).toBe('Yesterday');
  });

  it('returns formatted date for older', () => {
    const result = formatActivityDate(new Date('2026-03-09T10:00:00'));
    expect(result).toContain('Mon');
    expect(result).toContain('Mar');
  });
});

// ============================================================================
// formatDateCompact
// ============================================================================

describe('formatDateCompact', () => {
  it('formats without year', () => {
    const result = formatDateCompact('2026-03-11');
    expect(result).toContain('Wed');
    expect(result).toContain('Mar');
    expect(result).toContain('11');
    expect(result).not.toContain('2026');
  });
});
