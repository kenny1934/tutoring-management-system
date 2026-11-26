import { useEffect, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MaterialWorkControls } from './MaterialWorkControls';
import type { MaterialResult } from './MaterialSearch';

const captured = vi.hoisted(() => ({ autoReady: true, ready: undefined as (() => void) | undefined, files: [] as { path: string; pages: string; pageCount?: number }[] }));
vi.mock('./MaterialOriginal', () => ({ MaterialOriginal: ({ initialPage }: { initialPage?: number }) => <div role="region" aria-label="Original PDF fixture">Page {initialPage}</div> }));
vi.mock('next/dynamic', () => ({ default: () => (props: { files: typeof captured.files; onClose: () => void; onAssignComplete: () => void; onReady?: () => void }) => {
  useEffect(() => { if (captured.autoReady) props.onReady?.(); }, [props.onReady]);
  captured.ready = props.onReady;
  captured.files = props.files;
  return <div role="dialog" aria-label="Shared session selector"><button onClick={props.onClose}>Cancel selection</button><button onClick={props.onAssignComplete}>Confirm assignment</button></div>;
} }));
const file: MaterialResult = { file_id: 9, share: 'center', filename: 'Fixture.pdf', ext: '.pdf', rel_path: 'Year 9/Fixture.pdf', nas_path: '\\\\nas\\Center\\Year 9\\Fixture.pdf', page_count: 3, matched_pages: [], snippet: '', highlights: [], duplicate_count: 0, duplicate_locations: [] };

beforeEach(() => { captured.files = []; captured.autoReady = true; captured.ready = undefined; });
describe('Courseware assignment from search', () => {
  it('reveals page selection on demand, validates bounds and passes the selection to the shared selector', async () => {
    render(<MaterialWorkControls material={file} scope="fixture" canAssign />);
    expect(screen.queryByLabelText('Courseware pages')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Assign to sessions' }));
    const pages = screen.getByLabelText('Courseware pages');
    fireEvent.change(pages, { target: { value: '4' } });
    expect(screen.getByRole('button', { name: 'Choose sessions' })).toBeDisabled();
    fireEvent.change(pages, { target: { value: '1, 3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Choose sessions' }));
    expect(screen.getByRole('dialog', { name: 'Shared session selector' })).toBeVisible();
    expect(captured.files).toEqual([{ path: '[Center]\\Year 9\\Fixture.pdf', pages: '1, 3', pageCount: 3 }]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel selection' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Assign to sessions' }));
    expect(screen.getByLabelText('Courseware pages')).toHaveValue('1, 3');
    fireEvent.click(screen.getByRole('button', { name: 'Choose sessions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm assignment' }));
    expect(screen.getByRole('status')).toHaveTextContent('Courseware assigned.');
    expect(screen.queryByLabelText('Courseware pages')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Assign to sessions' })).toHaveFocus());
  });
  it('keeps assignment unavailable in read-only mode', () => {
    render(<MaterialWorkControls material={file} scope="fixture" canAssign={false} />);
    expect(screen.queryByRole('button', { name: 'Assign to sessions' })).toBeNull();
    expect(screen.getByRole('button', { name: 'View original PDF' })).toBeVisible();
  });
});

it('switches directly to the current match page and restores the text reading position', () => {
  const { container } = render(<MaterialWorkControls material={{ ...file, page_count: 34 }} scope="fixture" canAssign previewPage={16}><p>Long extracted text fixture</p></MaterialWorkControls>);
  const scroll = container.querySelector<HTMLElement>('[data-courseware-scroll]')!;
  scroll.scrollTop = 1200;
  fireEvent.click(screen.getByRole('button', { name: 'View original PDF' }));
  expect(screen.getByRole('region', { name: 'Original PDF fixture' })).toHaveTextContent('Page 16');
  expect(screen.getByText('Long extracted text fixture')).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Show extracted text' }));
  expect(screen.getByText('Long extracted text fixture')).toBeVisible();
  expect(scroll.scrollTop).toBe(1200);
});

it('keeps the page picker until the asynchronously loaded calendar is ready', async () => {
  captured.autoReady = false;
  render(<MaterialWorkControls material={file} scope="fixture" canAssign />);
  fireEvent.click(screen.getByRole('button', { name: 'Assign to sessions' }));
  fireEvent.change(screen.getByLabelText('Courseware pages'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Choose sessions' }));
  await waitFor(() => expect(screen.getByRole('dialog', { name: 'Assign courseware' })).toBeVisible());
  act(() => captured.ready?.());
  expect(screen.queryByRole('dialog', { name: 'Assign courseware' })).toBeNull();
  expect(screen.getByRole('dialog', { name: 'Shared session selector' })).toBeVisible();
});

it('expands the same PDF instance, restores on Escape, and exits expansion when returning to text', async () => {
  function Reader() {
    const [expanded, setExpanded] = useState(false);
    return <div data-expanded={expanded}><MaterialWorkControls material={file} scope="fixture" canAssign={false} expanded={expanded} onExpandedChange={setExpanded}><p>Extracted text fixture</p></MaterialWorkControls></div>;
  }
  const { container } = render(<Reader />);
  fireEvent.click(screen.getByRole('button', { name: 'View original PDF' }));
  const pdf = screen.getByRole('region', { name: 'Original PDF fixture' });
  fireEvent.click(screen.getByRole('button', { name: 'Expand PDF' }));
  expect(container.firstChild).toHaveAttribute('data-expanded', 'true');
  expect(screen.getByRole('region', { name: 'Original PDF fixture' })).toBe(pdf);
  fireEvent.keyDown(pdf, { key: 'Escape' });
  expect(container.firstChild).toHaveAttribute('data-expanded', 'false');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Expand PDF' })).toHaveFocus());
  fireEvent.click(screen.getByRole('button', { name: 'Expand PDF' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show extracted text' }));
  expect(container.firstChild).toHaveAttribute('data-expanded', 'false');
  expect(screen.getByText('Extracted text fixture')).toBeVisible();
});


it('adds the exact physical page selection to the current lesson without opening a calendar', async () => {
  const pick = vi.fn();
  render(<MaterialWorkControls material={file} scope="fixture" canAssign onPick={pick} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add to lesson' }));
  fireEvent.change(screen.getByLabelText('Courseware pages'), { target: { value: '4' } });
  expect(within(screen.getByRole('dialog', { name: 'Add courseware' })).getByRole('button', { name: 'Add to lesson' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Courseware pages'), { target: { value: '1, 3' } });
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Add courseware' })).getByRole('button', { name: 'Add to lesson' }));
  expect(pick).toHaveBeenCalledWith([{ path: '[Center]\\Year 9\\Fixture.pdf', pages: '1, 3', pageCount: 3, title: 'Fixture.pdf' }]);
  expect(screen.queryByRole('dialog', { name: 'Shared session selector' })).toBeNull();
  expect(captured.files).toEqual([]);
});


it('leaves the expanded PDF in place when Escape closes an assignment dialog', async () => {
  const expand = vi.fn();
  render(<MaterialWorkControls material={file} scope="expanded-portal" canAssign expanded onExpandedChange={expand} />);
  fireEvent.click(screen.getByRole('button', { name: 'Assign to sessions' }));
  const pages = await screen.findByLabelText('Courseware pages');
  fireEvent.keyDown(pages, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByLabelText('Courseware pages')).toBeNull());
  expect(expand).not.toHaveBeenCalled();
});
