import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MaterialWorkControls } from './MaterialWorkControls';
import type { MaterialResult } from './MaterialSearch';

const captured = vi.hoisted(() => ({ files: [] as { path: string; pages: string; pageCount?: number }[] }));
vi.mock('./MaterialOriginal', () => ({ MaterialOriginal: () => null }));
vi.mock('next/dynamic', () => ({ default: () => (props: { files: typeof captured.files; onClose: () => void; onAssignComplete: () => void }) => {
  captured.files = props.files;
  return <div role="dialog" aria-label="Shared session selector"><button onClick={props.onClose}>Cancel selection</button><button onClick={props.onAssignComplete}>Confirm assignment</button></div>;
} }));
const file: MaterialResult = { file_id: 9, share: 'center', filename: 'Fixture.pdf', ext: '.pdf', rel_path: 'Year 9/Fixture.pdf', nas_path: '\\\\nas\\Center\\Year 9\\Fixture.pdf', page_count: 3, matched_pages: [], snippet: '', highlights: [], duplicate_count: 0, duplicate_locations: [] };

beforeEach(() => { captured.files = []; });
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
