import { expect, it } from 'vitest';
import { defaultMaterialFilters } from './material-workspace';
import { parseMaterialTerms, serializeMaterialTerms, filterChips } from './material-refinements';
import { createTermDraft, termValues } from './MaterialTermInput';
it('keeps phrase and formula boundaries while retaining ordinary Chinese word expansion', () => {
  const terms = parseMaterialTerms('“a term” 練習 "4x^2-y^2+10x-y"');
  expect(terms).toEqual(['a term', '練習', '4x^2-y^2+10x-y']);
  expect(serializeMaterialTerms(terms)).toBe('"a term" 練習 "4x^2-y^2+10x-y"');
  expect(parseMaterialTerms('4x^2 - y^2 + 10x - y')).toEqual(['4x^2 - y^2 + 10x - y']);
});
it('includes uncommitted terms without losing an edited value or duplicating an existing word', () => {
  expect(termValues({ ...createTermDraft('factorisation factorization'), pending: 'factorisation' })).toEqual(['factorisation', 'factorization']);
  expect(termValues({ ...createTermDraft('factorisation factorization'), editing: 0, pending: 'a term' })).toEqual(['a term', 'factorization']);
});
it('describes alternatives and one-sided dates in human-readable applied conditions', () => {
  const chips = filterChips({ ...defaultMaterialFilters(), any_words: 'factorisation factorization', modified_from: '2025-01-01' });
  expect(chips.map(chip => chip.label)).toEqual(['Includes factorisation or factorization', 'Modified since 1 Jan 2025']);
  expect(chips[0].key).toBe('any_words');
});

it('sends only positive literal terms to PDF highlighting and keeps phrase/math boundaries', async () => {
  const { coursewarePdfTerms } = await import('./material-refinements');
  const filters = { ...defaultMaterialFilters(), any_words: 'factorisation "a term"', exclude_words: 'draft', exact_phrase: 'quadratic equations' };
  expect(coursewarePdfTerms('F1 algebra', filters)).toEqual([{ text: 'F1' }, { text: 'algebra' }, { text: 'factorisation' }, { text: 'a term', whole: true }, { text: 'quadratic equations', whole: true }]);
  expect(coursewarePdfTerms('term', { ...defaultMaterialFilters(), exact_phrase: 'term' })).toEqual([{ text: 'term', whole: true }]);
  expect(coursewarePdfTerms('4x^2-y^2+10x-y', defaultMaterialFilters())).toEqual([{ text: '4x^2-y^2+10x-y', whole: true }]);
  expect(coursewarePdfTerms('algebra', { ...filters, search_in: 'filename' })).toEqual([]);
});
