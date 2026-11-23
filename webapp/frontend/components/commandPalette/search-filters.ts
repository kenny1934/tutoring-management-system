export type SearchCategory = 'students' | 'sessions' | 'enrollments' | 'exams';
export type SearchOptions = { category?: SearchCategory; offset?: number; from_date?: string; to_date?: string; tutor_id?: number; student_id?: number; status?: string };
export type SearchFilters = {
  category: '' | SearchCategory;
  audience: 'centre' | 'my';
  dates: 'recent' | 'today' | 'tomorrow' | 'week' | 'custom';
  from: string; to: string; status: string;
  student?: { id: number; name: string };
};
export const defaultSearchFilters = (): SearchFilters => ({ category: '', audience: 'centre', dates: 'recent', from: '', to: '', status: '' });

/** Resolve calendar words using Hong Kong dates, including around UTC midnight. */
export function searchDate(offset = 0, now = new Date()): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function searchDateRange(preset: SearchFilters['dates'], now = new Date()): Pick<SearchOptions, 'from_date' | 'to_date'> {
  if (preset === 'today') return { from_date: searchDate(0, now), to_date: searchDate(0, now) };
  if (preset === 'tomorrow') return { from_date: searchDate(1, now), to_date: searchDate(1, now) };
  if (preset === 'week') {
    const weekday = new Date(`${searchDate(0, now)}T12:00:00Z`).getUTCDay();
    const monday = weekday === 0 ? -6 : 1 - weekday;
    return { from_date: searchDate(monday, now), to_date: searchDate(monday + 6, now) };
  }
  return {};
}
export function readCalendarWords(term: string): { term: string; dates?: SearchFilters['dates'] } {
  const literal = term.trim();
  if (literal.startsWith('"') && literal.endsWith('"') && literal.length > 1) return { term: literal.slice(1, -1) };
  const matches = [...term.matchAll(/\b(today|tomorrow|this week)\b/gi)];
  // Conflicting words stay literal so a name or comment isn't silently reinterpreted.
  if (matches.length !== 1 || (matches[0].index ?? 0) + matches[0][0].length !== term.trimEnd().length) return { term };
  const dates = matches[0][0].toLowerCase();
  return { term: term.replace(matches[0][0], '').trim(), dates: dates === 'this week' ? 'week' : dates as 'today' | 'tomorrow' };
}
export function requestFilters(filters: SearchFilters, tutorId?: number, now = new Date()): SearchOptions {
  return {
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.audience === 'my' && tutorId ? { tutor_id: tutorId } : {}),
    ...(filters.dates === 'custom' ? { ...(filters.from ? { from_date: filters.from } : {}), ...(filters.to ? { to_date: filters.to } : {}) } : searchDateRange(filters.dates, now)),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.student ? { student_id: filters.student.id } : {}),
  };
}
export function hasSearchConstraint(options: SearchOptions): boolean {
  return !!(options.from_date || options.to_date || options.tutor_id || options.student_id || options.status);
}
