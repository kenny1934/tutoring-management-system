import { describe, expect, it } from 'vitest';
import { defaultSearchFilters, hasSearchConstraint, readCalendarWords, requestFilters, searchDate, searchDateRange } from './search-filters';
describe('Search date and scope filters', () => {
  it('uses the Hong Kong calendar around UTC midnight and month/year boundaries', () => {
    const now = new Date('2026-12-31T17:30:00Z');
    expect(searchDate(0, now)).toBe('2027-01-01');
    expect(searchDate(1, now)).toBe('2027-01-02');
    expect(searchDateRange('week', new Date('2026-11-29T04:00:00Z'))).toEqual({ from_date: '2026-11-23', to_date: '2026-11-29' });
  });
  it('turns a trailing date word into a visible filter while retaining the search term', () => {
    expect(readCalendarWords('Learner tomorrow')).toEqual({ term: 'Learner', dates: 'tomorrow' });
    expect(readCalendarWords('this week')).toEqual({ term: '', dates: 'week' });
    expect(readCalendarWords('today tomorrow')).toEqual({ term: 'today tomorrow' });
    expect(readCalendarWords("Today's school")).toEqual({ term: "Today's school" });
    expect(readCalendarWords('"revise tomorrow"')).toEqual({ term: 'revise tomorrow' });
  });
  it('keeps a category distinct from a constraint that permits an empty query', () => {
    expect(hasSearchConstraint({ category: 'sessions' })).toBe(false);
    expect(hasSearchConstraint({ category: 'sessions', from_date: '2026-11-23' })).toBe(true);
    expect(requestFilters({ ...defaultSearchFilters(), audience: 'my', student: { id: 9, name: 'Learner' } }, 5)).toEqual({ tutor_id: 5, student_id: 9 });
    expect(requestFilters(defaultSearchFilters(), 5)).toEqual({});
  });
});
