import { describe, it, expect } from 'vitest';
import { parsePageRange, validatePageRange, composeSideBySidePdf } from './pdf-utils';

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

// ============================================================================
// composeSideBySidePdf
// ============================================================================

describe('composeSideBySidePdf', () => {
  const A4: [number, number] = [595, 842];

  async function makePdf(pageCount: number, size: [number, number] = A4): Promise<ArrayBuffer> {
    const { PDFDocument, rgb } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) {
      // Pages need a content stream to be embeddable (as real PDFs have).
      doc.addPage(size).drawRectangle({ x: 10, y: 10, width: 50, height: 50, color: rgb(0, 0, 0) });
    }
    const bytes = await doc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  async function pageSizes(data: ArrayBuffer): Promise<Array<{ width: number; height: number }>> {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(data);
    return doc.getPages().map((p) => p.getSize());
  }

  it('pairs page n of each side onto one double-width page', async () => {
    const composed = await composeSideBySidePdf(await makePdf(3), await makePdf(3));
    const sizes = await pageSizes(composed);
    expect(sizes).toHaveLength(3);
    expect(sizes[0].width).toBe(A4[0] * 2);
    expect(sizes[0].height).toBe(A4[1]);
  });

  it('leaves a blank half when page counts differ', async () => {
    const composed = await composeSideBySidePdf(await makePdf(2), await makePdf(1));
    const sizes = await pageSizes(composed);
    // The trailing left-only page still gets a full-width spread.
    expect(sizes).toHaveLength(2);
    expect(sizes[1].width).toBe(A4[0] * 2);
  });
});
