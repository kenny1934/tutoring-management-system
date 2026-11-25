import { defaultMaterialFilters, type MaterialFilters } from './material-workspace';
export const refinementKeys = ['match', 'any_words', 'exclude_words', 'exact_phrase', 'search_in', 'modified_from', 'modified_to'] as const;
export function searchRefinement(filters: MaterialFilters) {
  const defaults = defaultMaterialFilters();
  const entries = refinementKeys.filter(key => filters[key] && filters[key] !== defaults[key]).map(key => [key, filters[key].trim()]);
  return entries.length ? Object.fromEntries(entries) : undefined;
}
export function positiveSearch(query: string, filters: MaterialFilters) {
  return [query, filters.any_words, filters.exact_phrase].some(value => value.trim().length >= 2);
}
/** Quoted phrases stay together when restoring existing searches. */
export function parseMaterialTerms(raw: string): string[] {
  raw = raw.replace(/[“”]/g, '"');
  if (/^(?:\d+(?:\.\d+)?)?\s*[A-Za-z]\s*(?:[\^²³⁴⁵⁶⁷⁸⁹⁰+−=-]|\d)/.test(raw.trim()) && /[\^²³⁴⁵⁶⁷⁸⁹⁰+=−–-]/.test(raw) && /^[A-Za-z0-9\s.^_{}()\\+*/=−–²³⁴⁵⁶⁷⁸⁹⁰-]+$/.test(raw.trim())) return [raw.trim()];
  return [...raw.matchAll(/"([^"\n]+)"|([^\s"]+)/g)].map(match => match[1] ?? match[2]);
}
export function serializeMaterialTerms(terms: string[]): string {
  return [...new Set(terms.map(term => term.trim()).filter(Boolean))]
    .map(term => /[\s+*()<>~@"-]/.test(term) ? `"${term}"` : term).join(' ');
}
export type MaterialFilterChip = { key: keyof MaterialFilters; label: string; clear: Partial<MaterialFilters> };
function words(raw: string) { return new Intl.ListFormat('en-GB', { type: 'disjunction' }).format(parseMaterialTerms(raw)); }
function dateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function filterChips(filters: MaterialFilters, labels: Record<string, string> = {}): MaterialFilterChip[] {
  const chips: MaterialFilterChip[] = [];
  if (filters.share) chips.push({ key: 'share', label: labels[filters.share] ?? filters.share, clear: { share: '', folder: '' } });
  if (filters.ext) chips.push({ key: 'ext', label: filters.ext.slice(1).toUpperCase(), clear: { ext: '' } });
  if (filters.folder) chips.push({ key: 'folder', label: filters.folder, clear: { folder: '' } });
  if (filters.modified) chips.push({ key: 'modified', label: ({ week: 'Past week', month: 'Past month', year: 'Past year', older: 'Older' } as Record<string, string>)[filters.modified] || filters.modified, clear: { modified: '' } });
  if (filters.match === 'any') chips.push({ key: 'match', label: 'Any search word', clear: { match: 'all' } });
  if (filters.any_words.trim()) chips.push({ key: 'any_words', label: `Includes ${words(filters.any_words)}`, clear: { any_words: '' } });
  if (filters.exclude_words.trim()) chips.push({ key: 'exclude_words', label: `Excludes ${words(filters.exclude_words)}`, clear: { exclude_words: '' } });
  if (filters.exact_phrase.trim()) chips.push({ key: 'exact_phrase', label: `Exact phrase: ${filters.exact_phrase}`, clear: { exact_phrase: '' } });
  if (filters.search_in !== 'both') chips.push({ key: 'search_in', label: filters.search_in === 'filename' ? 'Filename only' : 'Contents only', clear: { search_in: 'both' } });
  if (filters.modified_from || filters.modified_to) {
    const from = filters.modified_from && dateLabel(filters.modified_from), to = filters.modified_to && dateLabel(filters.modified_to);
    chips.push({ key: 'modified', label: from && to ? `Modified ${from} – ${to}` : from ? `Modified since ${from}` : `Modified through ${to}`, clear: { modified_from: '', modified_to: '' } });
  }
  return chips;
}
