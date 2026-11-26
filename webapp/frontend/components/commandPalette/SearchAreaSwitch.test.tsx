import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';
import { SearchAreaSwitch, type SearchArea } from './SearchAreaSwitch';
it('exposes the selected mode and supports keyboard switching without trapping Tab', () => {
  function Switch() { const [area, setArea] = useState<SearchArea>('records'); return <SearchAreaSwitch value={area} onChange={setArea} />; }
  render(<Switch />);
  const records = screen.getByRole('button', { name: 'Records' }), courseware = screen.getByRole('button', { name: 'Courseware' });
  expect(records).toHaveAttribute('aria-pressed', 'true'); expect(courseware).toHaveAttribute('tabindex', '-1');
  records.focus(); fireEvent.keyDown(records, { key: 'ArrowRight' });
  expect(courseware).toHaveFocus(); expect(courseware).toHaveAttribute('aria-pressed', 'true');
  expect(records).toHaveAttribute('tabindex', '-1');
  fireEvent.keyDown(courseware, { key: 'Home' }); expect(records).toHaveFocus(); expect(records).toHaveAttribute('aria-pressed', 'true');
});
