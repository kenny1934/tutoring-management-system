import { describe, expect, it } from 'vitest';
import { indexPdfText, pdfTextMatches } from './pdf-text-search';
const hits = (text: string, query: string, whole = false) => pdfTextMatches(text, [{ text: query, whole }]).matches.map(hit => text.slice(hit.start, hit.end));
describe('Native PDF search offsets', () => {
  it('finds words across contiguous PDF text runs without inventing a space', () => {
    const index = indexPdfText([{ str: 'factor', width: 36, transform: [12,0,0,12,50,700] }, { str: 'isation', width: 40, transform: [12,0,0,12,86,700] }]);
    expect(index.text).toBe('factorisation');
    expect(hits(index.text, 'factorisation')).toEqual(['factorisation']);
    expect(index.runs[1]).toMatchObject({ start: 6, end: 13, item: 1 });
  });
  it('preserves phrase matching across lines and actual gaps', () => {
    const index = indexPdfText([{ str: 'quadratic', hasEOL: true }, { str: 'equations' }]);
    expect(hits(index.text, 'quadratic equations', true)).toEqual(['quadratic\nequations']);
  });
  it('maps ligatures, full-width characters and astral Unicode back to original DOM offsets', () => {
    expect(hits('😀 ﬁnal Ａlgebra', 'final')).toEqual(['ﬁnal']);
    expect(hits('😀 ﬁnal Ａlgebra', 'algebra')).toEqual(['Ａlgebra']);
  });
  it('joins hyphenated and soft-hyphen words without swallowing the preceding character', () => {
    expect(hits('factor-\nisation and factor\u00adisation', 'factorisation')).toEqual(['factor-\nisation', 'factor\u00adisation']);
  });
  it('keeps quoted single-word boundaries while ordinary words retain substring matching', () => {
    expect(hits('terminal term terms', 'term', true)).toEqual(['term']);
    expect(hits('terminal term terms', 'term')).toHaveLength(3);
  });
  it('matches literal formula notation, superscripts, minus variants and spaced PDF text', () => {
    expect(hits('Solve 4x² − y² + 10x - y = 0.', '4x^2-y^2+10x-y', true)).toEqual(['4x² − y² + 10x - y']);
    expect(hits('x^{23} and x²³ and x^234', 'x^23', true)).toEqual(['x^{23}', 'x²³']);
    expect(hits('x23', 'x^23', true)).toEqual([]);
  });
  it('treats regex syntax as literal content', () => {
    expect(hits('a+b.* aaaaaab', 'a+b.*', true)).toEqual(['a+b.*']);
  });
  it('does not broaden an unmatched formula to an entire page', () => {
    expect(pdfTextMatches('An unrelated worksheet page', [{ text: '4x^2-y^2+10x-y', whole: true }]).matches).toEqual([]);
  });
  it('bounds dense pages and reports that the match count is truncated', () => {
    const found = pdfTextMatches('algebra '.repeat(600), [{ text: 'algebra' }]);
    expect(found.matches).toHaveLength(500); expect(found.truncated).toBe(true);
  });
});
