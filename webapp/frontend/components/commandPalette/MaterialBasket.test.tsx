import { useEffect, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { MaterialBasket } from './MaterialBasket';
import type { MaterialBasketEntry } from './material-workspace';
const h = vi.hoisted(() => ({ files: [] as { path: string; pages: string }[] }));
vi.mock('next/dynamic', () => ({ default: () => (props: { files: typeof h.files; onReady: () => void; onClose: () => void; onAssignComplete: () => void }) => {
  const { onReady } = props;
  useEffect(() => { onReady(); }, [onReady]); h.files = props.files;
  return <div role="dialog" aria-label="Shared calendar"><button onClick={props.onClose}>Back to files</button><button onClick={props.onAssignComplete}>Confirm assignment</button></div>;
} }));
function Harness() {
  const [entries, setEntries] = useState([1, 2].map(id => ({ material: { file_id: id, filename: `Exam ${id}.pdf`, nas_path: `[Center]\\Exam ${id}.pdf`, page_count: 4 }, pages: '1-4' })) as MaterialBasketEntry[]);
  return entries.length ? <MaterialBasket entries={entries} onChange={setEntries} /> : <p>Selection cleared</p>;
}
it('validates each PDF separately and preserves per-file ranges when returning from the calendar', async () => {
  render(<Harness />); fireEvent.click(screen.getByRole('button', { name: 'Review and assign' }));
  fireEvent.change(screen.getByLabelText('Pages for Exam 1.pdf'), { target: { value: '5' } });
  expect(screen.getByRole('button', { name: 'Choose sessions' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Pages for Exam 1.pdf'), { target: { value: '1, 3' } });
  fireEvent.change(screen.getByLabelText('Pages for Exam 2.pdf'), { target: { value: '2-4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Choose sessions' }));
  await screen.findByRole('dialog', { name: 'Shared calendar' });
  expect(h.files).toEqual([{ path: '[Center]\\Exam 1.pdf', pages: '1, 3', pageCount: 4 }, { path: '[Center]\\Exam 2.pdf', pages: '2-4', pageCount: 4 }]);
  fireEvent.click(screen.getByRole('button', { name: 'Back to files' }));
  expect(screen.getByLabelText('Pages for Exam 1.pdf')).toHaveValue('1, 3');
  fireEvent.click(screen.getByRole('button', { name: 'Choose sessions' }));
  await screen.findByRole('dialog', { name: 'Shared calendar' }); fireEvent.click(screen.getByRole('button', { name: 'Confirm assignment' }));
  await waitFor(() => expect(screen.getByText('Selection cleared')).toBeVisible());
});


it('returns separate page ranges to a lesson draft without opening the session calendar', () => {
  const pick = vi.fn(), change = vi.fn();
  const material = { file_id: 1, filename: 'First.pdf', nas_path: '[Center]\\First.pdf', page_count: 4 } as MaterialBasketEntry['material'];
  render(<MaterialBasket entries={[{ material, pages: '1, 3' }, { material: { ...material, file_id: 2, filename: 'Second.pdf', nas_path: '[Center]\\Second.pdf', page_count: 2 }, pages: '1-2' }]} onChange={change} onPick={pick} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review selection' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add to lesson' }));
  expect(pick).toHaveBeenCalledWith([
    { path: '[Center]\\First.pdf', pages: '1, 3', pageCount: 4, title: 'First.pdf' },
    { path: '[Center]\\Second.pdf', pages: '1-2', pageCount: 2, title: 'Second.pdf' },
  ]);
  expect(change).toHaveBeenCalledWith([]);
  expect(screen.queryByRole('dialog', { name: 'Shared calendar' })).toBeNull();
});
