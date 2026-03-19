import { describe, it, expect } from 'vitest';
import { parsePageRange, validatePageRange } from './pdf-utils';

// ============================================================================
// parsePageRange
// ============================================================================

describe('parsePageRange', () => {
  it('returns empty for empty string', () => {
    expect(parsePageRange('')).toEqual([]);
    expect(parsePageRange('   ')).toEqual([]);
  });

  it('parses single page', () => {
    expect(parsePageRange('5')).toEqual([5]);
  });

  it('parses simple range', () => {
    expect(parsePageRange('1-5')).toEqual([1, 2, 3, 4, 5]);
  });

  it('parses comma-separated', () => {
    expect(parsePageRange('1,3,5')).toEqual([1, 3, 5]);
  });

  it('parses mixed format', () => {
    expect(parsePageRange('1,3,5-7,10')).toEqual([1, 3, 5, 6, 7, 10]);
  });

  it('normalizes tilde as range separator', () => {
    expect(parsePageRange('1~5')).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles spaces around separators', () => {
    expect(parsePageRange('1, 3, 5 - 7')).toEqual([1, 3, 5, 6, 7]);
  });

  it('ignores text remarks', () => {
    expect(parsePageRange('1,3,5-7 (not done)')).toEqual([1, 3, 5, 6, 7]);
  });

  it('deduplicates pages', () => {
    expect(parsePageRange('1,1,2,2')).toEqual([1, 2]);
  });

  it('preserves input order', () => {
    expect(parsePageRange('5,1,3')).toEqual([5, 1, 3]);
  });

  it('preserves order across mixed ranges', () => {
    expect(parsePageRange('8-10,5-6,16-18')).toEqual([8, 9, 10, 5, 6, 16, 17, 18]);
  });

  it('deduplicates overlapping ranges preserving first occurrence order', () => {
    expect(parsePageRange('8-15,12-18')).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it('ignores zero (negative sign parsed as range separator)', () => {
    // -1 is parsed as range with empty start → treats "1" as single page
    expect(parsePageRange('0,-1,3')).toEqual([1, 3]);
  });
});

// ============================================================================
// validatePageRange
// ============================================================================

describe('validatePageRange', () => {
  it('returns true for empty string (means all pages)', () => {
    expect(validatePageRange('')).toBe(true);
  });

  it('returns true for valid range', () => {
    expect(validatePageRange('1-5')).toBe(true);
  });

  it('returns false for non-numeric input', () => {
    expect(validatePageRange('abc')).toBe(false);
  });

  it('returns true when within total pages', () => {
    expect(validatePageRange('1-5', 10)).toBe(true);
  });

  it('returns false when exceeding total pages', () => {
    expect(validatePageRange('1-15', 10)).toBe(false);
  });

  it('returns true for single page within bounds', () => {
    expect(validatePageRange('5', 5)).toBe(true);
  });
});
