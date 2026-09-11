import { describe, it, expect } from 'vitest';
import {
  parsePageInput,
  parseExerciseRemarks,
  combineExerciseRemarks,
  detectPageMode,
  validateExercisePageRange,
  getDisplayName,
  normalizeFilename,
  getPageFieldsFromSelection,
  insertExercisesAfterIndex,
  buildDuplicateIndex,
  findDuplicatesFromIndex,
} from './exercise-utils';

// ============================================================================
// parsePageInput
// ============================================================================

describe('parsePageInput', () => {
  it('returns undefined for empty string', () => {
    expect(parsePageInput('')).toBeUndefined();
    expect(parsePageInput('   ')).toBeUndefined();
  });

  it('parses single page number', () => {
    expect(parsePageInput('5')).toEqual({ pageStart: 5, pageEnd: 5 });
  });

  it('parses simple range', () => {
    expect(parsePageInput('1-5')).toEqual({ pageStart: 1, pageEnd: 5 });
  });

  it('normalizes tilde separator', () => {
    expect(parsePageInput('1~5')).toEqual({ pageStart: 1, pageEnd: 5 });
  });

  it('normalizes em dash separator', () => {
    expect(parsePageInput('3—7')).toEqual({ pageStart: 3, pageEnd: 7 });
  });

  it('returns complex range for comma-separated', () => {
    expect(parsePageInput('1,3,5-7')).toEqual({ complexRange: '1,3,5-7' });
  });

  it('returns complex range for non-numeric input', () => {
    expect(parsePageInput('1,3,5')).toEqual({ complexRange: '1,3,5' });
  });

  it('trims whitespace', () => {
    expect(parsePageInput('  5  ')).toEqual({ pageStart: 5, pageEnd: 5 });
  });
});

// ============================================================================
// parseExerciseRemarks
// ============================================================================

describe('parseExerciseRemarks', () => {
  it('returns empty for null/undefined', () => {
    expect(parseExerciseRemarks(null)).toEqual({ complexPages: '', remarks: '' });
    expect(parseExerciseRemarks(undefined)).toEqual({ complexPages: '', remarks: '' });
  });

  it('returns plain text as remarks', () => {
    expect(parseExerciseRemarks('Good work')).toEqual({ complexPages: '', remarks: 'Good work' });
  });

  it('parses pages-only format', () => {
    expect(parseExerciseRemarks('Pages: 1,3,5-7')).toEqual({ complexPages: '1,3,5-7', remarks: '' });
  });

  it('parses pages with remarks', () => {
    expect(parseExerciseRemarks('Pages: 1,3 || Some notes')).toEqual({
      complexPages: '1,3',
      remarks: 'Some notes',
    });
  });
});

// ============================================================================
// combineExerciseRemarks
// ============================================================================

describe('combineExerciseRemarks', () => {
  it('returns empty for both empty', () => {
    expect(combineExerciseRemarks('', '')).toBe('');
  });

  it('returns pages only', () => {
    expect(combineExerciseRemarks('1,3,5', '')).toBe('Pages: 1,3,5');
  });

  it('returns remarks only', () => {
    expect(combineExerciseRemarks('', 'Good work')).toBe('Good work');
  });

  it('combines both with delimiter', () => {
    expect(combineExerciseRemarks('1,3', 'Notes')).toBe('Pages: 1,3 || Notes');
  });

  it('trims whitespace', () => {
    expect(combineExerciseRemarks('  1,3  ', '  Notes  ')).toBe('Pages: 1,3 || Notes');
  });
});

// ============================================================================
// detectPageMode
// ============================================================================

describe('detectPageMode', () => {
  it('returns custom when complexPages is set', () => {
    expect(detectPageMode('', '', '1,3,5')).toBe('custom');
  });

  it('returns simple when page numbers are set', () => {
    expect(detectPageMode('1', '5', '')).toBe('simple');
  });

  it('returns simple when only start is set', () => {
    expect(detectPageMode('1', '', '')).toBe('simple');
  });

  it('returns simple as default', () => {
    expect(detectPageMode('', '', '')).toBe('simple');
    expect(detectPageMode(null, null, '')).toBe('simple');
  });
});

// ============================================================================
// validateExercisePageRange
// ============================================================================

describe('validateExercisePageRange', () => {
  const base = {
    page_mode: 'simple' as const,
    page_start: '',
    page_end: '',
    complex_pages: '',
    pdf_name: 'test.pdf',
  };

  it('returns no errors for empty pages', () => {
    expect(validateExercisePageRange(base, 0)).toEqual([]);
  });

  it('returns no errors for valid range', () => {
    expect(validateExercisePageRange({ ...base, page_start: '1', page_end: '5' }, 0)).toEqual([]);
  });

  it('returns error for non-numeric start page', () => {
    const errors = validateExercisePageRange({ ...base, page_start: 'abc' }, 0);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('page_start');
  });

  it('returns error for negative start page', () => {
    const errors = validateExercisePageRange({ ...base, page_start: '-1' }, 0);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('page_start');
  });

  it('returns error when end < start', () => {
    const errors = validateExercisePageRange({ ...base, page_start: '5', page_end: '3' }, 0);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('page_end');
    expect(errors[0].message).toContain('≥');
  });

  it('returns error for invalid custom range (no numbers)', () => {
    const errors = validateExercisePageRange({
      ...base,
      page_mode: 'custom',
      complex_pages: 'abc',
    }, 0);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('complex_pages');
  });

  it('passes valid custom range', () => {
    expect(validateExercisePageRange({
      ...base,
      page_mode: 'custom',
      complex_pages: '1,3,5-7',
    }, 0)).toEqual([]);
  });
});

// ============================================================================
// getDisplayName
// ============================================================================

describe('getDisplayName', () => {
  it('removes path and extension', () => {
    expect(getDisplayName('V:\\abc\\def\\ghi.pdf')).toBe('ghi');
  });

  it('handles forward slashes', () => {
    expect(getDisplayName('/path/to/file.docx')).toBe('file');
  });

  it('handles filename only', () => {
    expect(getDisplayName('test.pdf')).toBe('test');
  });

  it('handles no extension', () => {
    expect(getDisplayName('filename')).toBe('filename');
  });
});

// ============================================================================
// normalizeFilename
// ============================================================================

describe('normalizeFilename', () => {
  it('returns empty for empty input', () => {
    expect(normalizeFilename('')).toBe('');
  });

  it('lowercases and strips extension', () => {
    expect(normalizeFilename('V:\\Dir\\FILE.PDF')).toBe('file');
  });

  it('handles forward slashes', () => {
    expect(normalizeFilename('/path/MyDoc.docx')).toBe('mydoc');
  });
});

// ============================================================================
// getPageFieldsFromSelection
// ============================================================================

describe('getPageFieldsFromSelection', () => {
  it('returns null for null/undefined', () => {
    expect(getPageFieldsFromSelection(null)).toBeNull();
    expect(getPageFieldsFromSelection(undefined)).toBeNull();
  });

  it('returns custom mode for complexRange', () => {
    expect(getPageFieldsFromSelection({ complexRange: '1,3,5' })).toEqual({
      page_mode: 'custom',
      page_start: '',
      page_end: '',
      complex_pages: '1,3,5',
    });
  });

  it('returns simple mode for page numbers', () => {
    expect(getPageFieldsFromSelection({ pageStart: 1, pageEnd: 5 })).toEqual({
      page_mode: 'simple',
      page_start: '1',
      page_end: '5',
      complex_pages: '',
    });
  });

  it('returns null for empty selection', () => {
    expect(getPageFieldsFromSelection({})).toBeNull();
  });
});

// ============================================================================
// insertExercisesAfterIndex
// ============================================================================

describe('insertExercisesAfterIndex', () => {
  it('inserts items at correct position', () => {
    const arr = ['a', 'b', 'c'];
    expect(insertExercisesAfterIndex(arr, 0, ['x', 'y'])).toEqual(['a', 'x', 'y', 'b', 'c']);
  });

  it('inserts at the end', () => {
    const arr = ['a', 'b'];
    expect(insertExercisesAfterIndex(arr, 1, ['x'])).toEqual(['a', 'b', 'x']);
  });
});

// ============================================================================
// buildDuplicateIndex + findDuplicatesFromIndex
// ============================================================================

describe('duplicate detection', () => {
  const history = [
    {
      session_id: 100,
      session_date: '2026-03-01',
      exercises: [
        { pdf_name: '/path/Math.pdf', exercise_type: 'Classwork', page_start: 1, page_end: 5 },
        { pdf_name: '/path/Science.pdf', exercise_type: 'Homework', page_start: 10, page_end: 15 },
      ],
    },
  ];

  it('builds index keyed by normalized filename', () => {
    const index = buildDuplicateIndex(history);
    expect(index.has('math')).toBe(true);
    expect(index.has('science')).toBe(true);
    expect(index.get('math')).toHaveLength(1);
  });

  it('finds duplicates with overlapping pages', () => {
    const index = buildDuplicateIndex(history);
    const matches = findDuplicatesFromIndex('/other/Math.pdf', 3, 7, index);
    expect(matches).toHaveLength(1);
    expect(matches[0].sessionId).toBe(100);
  });

  it('finds no duplicates for non-overlapping pages', () => {
    const index = buildDuplicateIndex(history);
    const matches = findDuplicatesFromIndex('/other/Math.pdf', 6, 10, index);
    expect(matches).toHaveLength(0);
  });

  it('returns empty for unknown filename', () => {
    const index = buildDuplicateIndex(history);
    expect(findDuplicatesFromIndex('unknown.pdf', 1, 5, index)).toEqual([]);
  });

  it('returns empty for empty name', () => {
    expect(findDuplicatesFromIndex('', 1, 5)).toEqual([]);
  });
});
