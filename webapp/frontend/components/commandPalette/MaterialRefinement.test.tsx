import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MaterialRefinement } from './MaterialRefinement';
import { defaultMaterialFilters, type MaterialFilters } from './material-workspace';

function Harness({ onApply = vi.fn(), edit }: { onApply?: (patch: Partial<MaterialFilters>) => void; edit?: 'any_words' | 'modified' } = {}) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState({ ...defaultMaterialFilters(), share: 'center', search_in: 'content', sort: 'recent' });
  return <><MaterialRefinement filters={filters} onApply={patch => { onApply(patch); setFilters(value => ({ ...value, ...patch })); }} isOpen={open} onOpenChange={setOpen} supportsRefinements edit={edit} /><button>Outside</button></>;
}
function add(rule: string) { fireEvent.change(screen.getByLabelText('Add condition'), { target: { value: rule } }); }
afterEach(() => { Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true }); });

it('shows only file settings until a word condition or custom date range is requested', () => {
  render(<Harness />); fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  expect(screen.getAllByLabelText('Courseware modified date')).toHaveLength(1);
  expect(screen.queryByLabelText('Modified from')).toBeNull();
  expect(screen.queryByLabelText('Alternatives')).toBeNull();
  expect(screen.queryByLabelText('Excluded words')).toBeNull();
  expect(screen.queryByLabelText('Exact phrase')).toBeNull();
  add('any_words'); expect(screen.getByLabelText('Alternatives')).toHaveFocus();
  expect(screen.getByText('Must include one of')).toBeVisible();
  expect(screen.queryByLabelText('Excluded words')).toBeNull();
});

it('edits separate alternative tokens and includes a pending phrase when applying', () => {
  const onApply = vi.fn(); render(<Harness onApply={onApply} />);
  fireEvent.click(screen.getByRole('button', { name: 'Filters' })); add('any_words');
  fireEvent.change(screen.getByLabelText('Alternatives'), { target: { value: 'factorisation' } });
  fireEvent.keyDown(screen.getByLabelText('Alternatives'), { key: 'Enter' });
  fireEvent.change(screen.getByLabelText('Alternatives'), { target: { value: 'factorization' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add alternatives' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit Alternatives: factorisation' }));
  fireEvent.change(screen.getByLabelText('Alternatives'), { target: { value: 'quadratic equation' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ any_words: '"quadratic equation" factorization' }));
  expect(screen.queryByRole('dialog', { name: 'Courseware filters' })).toBeNull();
});

it('discards a draft on Escape and outside press while returning focus to Filters', async () => {
  const onApply = vi.fn(); render(<Harness onApply={onApply} />);
  const trigger = screen.getByRole('button', { name: 'Filters' });
  fireEvent.click(trigger); add('exclude_words');
  fireEvent.change(screen.getByLabelText('Excluded words'), { target: { value: 'answers' } });
  fireEvent.keyDown(screen.getByLabelText('Excluded words'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(trigger).toHaveFocus());
  fireEvent.click(trigger); expect(screen.queryByLabelText('Excluded words')).toBeNull();
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(onApply).not.toHaveBeenCalled();
});

it('selects an inclusive date range with the calendar and replaces it with a preset', () => {
  const onApply = vi.fn(); render(<Harness onApply={onApply} />);
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  fireEvent.change(screen.getByLabelText('Courseware modified date'), { target: { value: 'custom' } });
  fireEvent.change(screen.getByLabelText('Modified from'), { target: { value: '2025-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: '12 January 2025' }));
  expect(screen.getByLabelText('Modified through')).toHaveValue('2025-01-12');
  fireEvent.click(screen.getByRole('button', { name: '15 January 2025' }));
  expect(screen.getByLabelText('Modified from')).toHaveValue('2025-01-15');
  expect(screen.getByLabelText('Modified through')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: '19 January 2025' }));
  expect(screen.getByLabelText('Modified through')).toHaveValue('2025-01-19');
  fireEvent.change(screen.getByLabelText('Courseware modified date'), { target: { value: 'month' } });
  expect(screen.queryByLabelText('Modified from')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ modified: 'month', modified_from: '', modified_to: '' }));
});

it('clears popup rules while preserving the source, search scope and sort', () => {
  const onApply = vi.fn(); render(<Harness onApply={onApply} />);
  fireEvent.click(screen.getByRole('button', { name: 'Filters' })); add('exact_phrase');
  fireEvent.change(screen.getByLabelText('Exact phrase'), { target: { value: 'a term' } });
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(onApply).toHaveBeenCalledWith({ ...defaultMaterialFilters(), share: 'center', search_in: 'content', sort: 'recent' });
});

it('blocks excess terms rather than dropping a word', () => {
  render(<Harness />); fireEvent.click(screen.getByRole('button', { name: 'Filters' })); add('exclude_words');
  fireEvent.change(screen.getByLabelText('Excluded words'), { target: { value: 'one,two,three,four,five,six,seven,eight,nine' } });
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('eight');
});

it('uses a modal sheet on mobile and owns Escape without closing a parent', async () => {
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  const parent = vi.fn(); render(<div onKeyDown={parent}><Harness /></div>);
  act(() => window.dispatchEvent(new Event('resize')));
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  const sheet = await screen.findByRole('dialog', { name: 'Courseware filters' });
  expect(sheet).toHaveAttribute('aria-modal', 'true');
  fireEvent.keyDown(within(sheet).getByLabelText('Courseware file type'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(parent).not.toHaveBeenCalled();
});

it('keeps calendar keyboard navigation usable across month boundaries', async () => {
  render(<Harness />); fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  fireEvent.change(screen.getByLabelText('Courseware modified date'), { target: { value: 'custom' } });
  fireEvent.change(screen.getByLabelText('Modified from'), { target: { value: '2025-01-31' } });
  const day = screen.getByRole('button', { name: '31 January 2025' });
  act(() => day.focus()); fireEvent.keyDown(day, { key: 'PageDown' });
  await waitFor(() => expect(screen.getByRole('button', { name: '28 February 2025' })).toHaveFocus());
  fireEvent.keyDown(screen.getByRole('button', { name: '28 February 2025' }), { key: 'ArrowRight' });
  await waitFor(() => expect(screen.getByRole('button', { name: '1 March 2025' })).toHaveFocus());
});

it('keeps keyboard focus inside the editor when removing a term or condition', async () => {
  render(<Harness />); fireEvent.click(screen.getByRole('button', { name: 'Filters' })); add('any_words');
  fireEvent.change(screen.getByLabelText('Alternatives'), { target: { value: 'factorisation' } });
  fireEvent.keyDown(screen.getByLabelText('Alternatives'), { key: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: 'Remove Alternatives: factorisation' }));
  expect(screen.getByLabelText('Alternatives')).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Remove condition: Must include one of' }));
  await waitFor(() => expect(screen.getByLabelText('Add condition')).toHaveFocus());
});
