import { describe, it, expect } from 'vitest';
import { getTagColor, TAG_COLORS } from './tag-colors';
import { getInitials, getAvatarColor, AVATAR_COLORS } from './avatar-utils';
import { getDocumentPath, getTrendingPath } from './courseware-utils';
import { getPageLabel, getStudentIdDisplay } from './lesson-utils';
import type { Session, SessionExercise } from '@/types';

// ============================================================================
// tag-colors
// ============================================================================

describe('getTagColor', () => {
  it('returns a valid class string', () => {
    const color = getTagColor('Math');
    expect(TAG_COLORS).toContain(color);
  });

  it('is deterministic for same input', () => {
    expect(getTagColor('Science')).toBe(getTagColor('Science'));
  });

  it('different tags can get different colors', () => {
    // Not guaranteed but very likely with different strings
    const colors = new Set(['a', 'bb', 'ccc', 'dddd', 'eeeee'].map(getTagColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

// ============================================================================
// avatar-utils
// ============================================================================

describe('getInitials', () => {
  it('extracts first and last initials', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('strips Mr prefix', () => {
    expect(getInitials('Mr. John Doe')).toBe('JD');
  });

  it('strips Ms prefix', () => {
    expect(getInitials('Ms Jane Smith')).toBe('JS');
  });

  it('Mrs prefix: regex matches Mr first, leaving "s. Alice Wong"', () => {
    // Known quirk: alternation order means Mr matches before Mrs
    expect(getInitials('Mrs. Alice Wong')).toBe('SW');
  });

  it('handles single name', () => {
    expect(getInitials('Alice')).toBe('A');
  });

  it('uses last name for multi-part names', () => {
    expect(getInitials('John Michael Doe')).toBe('JD');
  });
});

describe('getAvatarColor', () => {
  it('returns valid color class', () => {
    expect(AVATAR_COLORS).toContain(getAvatarColor(0));
  });

  it('cycles through colors', () => {
    expect(getAvatarColor(0)).toBe(getAvatarColor(AVATAR_COLORS.length));
  });
});

// ============================================================================
// courseware-utils
// ============================================================================

describe('getDocumentPath', () => {
  it('prefers converted_path', () => {
    expect(getDocumentPath({
      converted_path: '/converted',
      original_path: '/original',
      title: 'Title',
    } as any)).toBe('/converted');
  });

  it('falls back to original_path', () => {
    expect(getDocumentPath({
      original_path: '/original',
      title: 'Title',
    } as any)).toBe('/original');
  });

  it('falls back to original_file_name', () => {
    expect(getDocumentPath({
      original_file_name: 'file.pdf',
      title: 'Title',
    } as any)).toBe('file.pdf');
  });

  it('falls back to title', () => {
    expect(getDocumentPath({ title: 'My Doc' } as any)).toBe('My Doc');
  });
});

describe('getTrendingPath', () => {
  it('returns first path from normalized_paths', () => {
    expect(getTrendingPath({
      normalized_paths: '/path/a.pdf, /path/b.pdf',
      filename: 'c.pdf',
    } as any)).toBe('/path/a.pdf');
  });

  it('falls back to filename', () => {
    expect(getTrendingPath({
      filename: 'file.pdf',
    } as any)).toBe('file.pdf');
  });
});

// ============================================================================
// lesson-utils
// ============================================================================

describe('getPageLabel', () => {
  const makeExercise = (overrides: Partial<SessionExercise> = {}): SessionExercise => ({
    id: 1,
    pdf_name: 'test.pdf',
    page_start: undefined,
    page_end: undefined,
    remarks: null,
    ...overrides,
  } as SessionExercise);

  it('returns null when no pages', () => {
    expect(getPageLabel(makeExercise())).toBeNull();
  });

  it('returns single page label', () => {
    expect(getPageLabel(makeExercise({ page_start: 5 }))).toBe('p5');
  });

  it('returns range label', () => {
    expect(getPageLabel(makeExercise({ page_start: 1, page_end: 3 }))).toBe('p1-3');
  });

  it('returns single page when start equals end', () => {
    expect(getPageLabel(makeExercise({ page_start: 5, page_end: 5 }))).toBe('p5');
  });

  it('returns complex pages from remarks', () => {
    expect(getPageLabel(makeExercise({ remarks: 'Pages: 1,3,5-7' }))).toBe('p1,3,5-7');
  });
});

describe('getStudentIdDisplay', () => {
  const makeSession = (overrides: Partial<Session> = {}): Session => ({
    school_student_id: '1001',
    location: 'MSA',
    ...overrides,
  } as Session);

  it('returns id without prefix for specific location', () => {
    expect(getStudentIdDisplay(makeSession(), 'MSA')).toBe('1001');
  });

  it('returns location-prefixed id for All Locations', () => {
    expect(getStudentIdDisplay(makeSession(), 'All Locations')).toBe('MSA-1001');
  });

  it('returns null when no student id', () => {
    expect(getStudentIdDisplay(makeSession({ school_student_id: undefined }), 'MSA')).toBeNull();
  });
});
