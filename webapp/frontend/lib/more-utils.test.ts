import { describe, it, expect } from 'vitest';
import { formatError } from './utils';
import { getGradeColor, getTimeSlotsForDay, isWeekend, WEEKDAY_TIME_SLOTS, WEEKEND_TIME_SLOTS } from './constants';
import { getCategoryColor } from './termination-constants';
import { hexToRgba, generatePointName, getPointAttrs, getLineAttrs, getFillAttrs } from './geometry-tools';
import { getPageNumbers } from './bulk-pdf-helpers';

// ============================================================================
// formatError
// ============================================================================

describe('formatError', () => {
  it('extracts message from Error object', () => {
    expect(formatError(new Error('Something broke'))).toBe('Something broke');
  });

  it('returns string errors directly', () => {
    expect(formatError('Connection failed')).toBe('Connection failed');
  });

  it('maps known error patterns', () => {
    expect(formatError('Not authenticated')).toBe('Please log in to continue');
    expect(formatError(new Error('Failed to fetch'))).toBe(
      'Unable to connect to server. Please check your connection'
    );
  });

  it('returns fallback for null/undefined', () => {
    expect(formatError(null)).toBe('An unexpected error occurred');
    expect(formatError(undefined, 'Custom fallback')).toBe('Custom fallback');
  });

  it('returns fallback for empty message', () => {
    expect(formatError(new Error(''))).toBe('An unexpected error occurred');
  });

  it('strips technical prefix', () => {
    expect(formatError('Error: disk full')).toBe('Disk full');
  });

  it('extracts message from plain object', () => {
    expect(formatError({ message: 'obj error' })).toBe('Obj error');
  });

  it('returns fallback for non-extractable types', () => {
    expect(formatError(42)).toBe('An unexpected error occurred');
  });
});

// ============================================================================
// constants
// ============================================================================

describe('getGradeColor', () => {
  it('returns color for known grade', () => {
    expect(getGradeColor('F1', 'C')).toBe('#c2dfce');
  });

  it('returns default for unknown grade', () => {
    expect(getGradeColor('F9', 'X')).toBe('#e5e7eb');
  });

  it('handles undefined inputs', () => {
    expect(getGradeColor(undefined, undefined)).toBe('#e5e7eb');
  });
});

describe('getTimeSlotsForDay', () => {
  it('returns weekend slots for Sunday (0)', () => {
    expect(getTimeSlotsForDay(0)).toBe(WEEKEND_TIME_SLOTS);
  });

  it('returns weekend slots for Saturday (6)', () => {
    expect(getTimeSlotsForDay(6)).toBe(WEEKEND_TIME_SLOTS);
  });

  it('returns weekday slots for weekdays', () => {
    expect(getTimeSlotsForDay(1)).toBe(WEEKDAY_TIME_SLOTS);
    expect(getTimeSlotsForDay(5)).toBe(WEEKDAY_TIME_SLOTS);
  });
});

describe('isWeekend', () => {
  it('returns true for Saturday', () => {
    expect(isWeekend('2026-03-14')).toBe(true); // Saturday
  });

  it('returns false for weekday', () => {
    expect(isWeekend('2026-03-12')).toBe(false); // Thursday
  });
});

// ============================================================================
// termination-constants
// ============================================================================

describe('getCategoryColor', () => {
  it('returns light color by default', () => {
    expect(getCategoryColor('Financial reasons')).toBe('#dc2626');
  });

  it('returns dark color when isDark is true', () => {
    expect(getCategoryColor('Financial reasons', true)).toBe('#f87171');
  });

  it('returns fallback for unknown category', () => {
    expect(getCategoryColor('Unknown Category')).toBe('#78716c');
    expect(getCategoryColor('Unknown Category', true)).toBe('#a8a29e');
  });
});

// ============================================================================
// geometry-tools
// ============================================================================

describe('hexToRgba', () => {
  it('converts hex to rgba', () => {
    expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255,0,0,0.5)');
  });

  it('handles dark colors', () => {
    expect(hexToRgba('#000000', 1)).toBe('rgba(0,0,0,1)');
  });
});

describe('generatePointName', () => {
  it('returns A-Z for first 26', () => {
    expect(generatePointName(0)).toBe('A');
    expect(generatePointName(25)).toBe('Z');
  });

  it('adds subscript for cycles beyond first', () => {
    const name = generatePointName(26); // A₁
    expect(name).toMatch(/^A/);
    expect(name.length).toBeGreaterThan(1);
  });
});

describe('getPointAttrs', () => {
  it('returns point attributes with given color', () => {
    const attrs = getPointAttrs('#ff0000');
    expect(attrs.strokeColor).toBe('#ff0000');
    expect(attrs.fillColor).toBe('#ff0000');
    expect(attrs.size).toBe(4);
  });
});

describe('getLineAttrs', () => {
  it('returns line attributes with given color', () => {
    const attrs = getLineAttrs('#00ff00');
    expect(attrs.strokeColor).toBe('#00ff00');
    expect(attrs.strokeWidth).toBe(2);
    expect(attrs.dash).toBe(0);
  });

  it('accepts dash parameter', () => {
    expect(getLineAttrs('#00ff00', 3).dash).toBe(3);
  });
});

describe('getFillAttrs', () => {
  it('returns fill attributes with rgba colors', () => {
    const attrs = getFillAttrs('#0000ff');
    expect(attrs.fillColor).toContain('rgba(0,0,255,0.15)');
    expect(attrs.highlightFillColor).toContain('rgba(0,0,255,0.25)');
  });
});

// ============================================================================
// bulk-pdf-helpers
// ============================================================================

describe('getPageNumbers', () => {
  it('parses complex_pages field', () => {
    const result = getPageNumbers({ pdf_name: 'test.pdf', complex_pages: '1,3,5-7' });
    expect(result).toEqual([1, 3, 5, 6, 7]);
  });

  it('uses page_start and page_end', () => {
    const result = getPageNumbers({ pdf_name: 'test.pdf', page_start: 3, page_end: 5 });
    expect(result).toEqual([3, 4, 5]);
  });

  it('uses page_start only as single page', () => {
    const result = getPageNumbers({ pdf_name: 'test.pdf', page_start: 7 });
    expect(result).toEqual([7]);
  });

  it('handles string page numbers', () => {
    const result = getPageNumbers({ pdf_name: 'test.pdf', page_start: '3', page_end: '5' });
    expect(result).toEqual([3, 4, 5]);
  });

  it('returns empty for all pages', () => {
    const result = getPageNumbers({ pdf_name: 'test.pdf' });
    expect(result).toEqual([]);
  });
});
