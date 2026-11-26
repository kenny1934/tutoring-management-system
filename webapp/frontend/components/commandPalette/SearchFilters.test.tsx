import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';
import { SearchFilterControls } from './SearchFilters';
import { type SearchFilters, defaultSearchFilters } from './search-filters';
it('hosts the compact controls in the shared toolbar and keeps category rules consistent in the filter panel', () => {
  const host = document.createElement('div'); document.body.append(host);
  function Filters() {
    const [filters, setFilters] = useState<SearchFilters>({ ...defaultSearchFilters(), audience: 'my', category: 'sessions', status: 'Attended', dates: 'today' });
    return <SearchFilterControls toolbarHost={host} filters={filters} onChange={setFilters} expanded onToggle={() => {}} includeHistory={false} onHistory={() => {}} currentTutor={5} />;
  }
  render(<Filters />);
  expect(host).toContainElement(screen.getByLabelText('Search category'));
  fireEvent.change(screen.getByLabelText('Filter search category'), { target: { value: 'exams' } });
  expect(screen.getByLabelText('Search scope')).toHaveValue('centre');
  expect(screen.getByLabelText('1 active filters')).toHaveTextContent('1');
  expect(screen.getByLabelText('Session status')).toHaveValue('');
  expect(screen.getByLabelText('Session dates')).toHaveValue('recent');
  host.remove();
});
