import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, expect, it, vi } from 'vitest';
import { CoursewareWorkspace } from './CoursewareWorkspace';
const h = vi.hoisted(() => ({ fetch: vi.fn(), id: 5, role: 'Tutor', readOnly: false, location: 'Main Center' }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: h.id }, effectiveRole: h.role, isReadOnly: h.readOnly }) }));
vi.mock('@/contexts/LocationContext', () => ({ useLocation: () => ({ selectedLocation: h.location }) }));
vi.mock('@/lib/api', () => ({ fetchAPI: h.fetch }));
vi.mock('@/lib/hooks', () => ({ useCoursewarePopularity: () => ({ data: [] }), useCoursewareUsageDetail: () => ({ data: [] }) }));
vi.mock('@/components/ui/pdf-preview-modal', () => ({ PdfPreviewModal: () => null }));
vi.mock('@/components/commandPalette/MaterialOriginal', () => ({ MaterialOriginal: () => <div>Original fixture</div> }));
const row = { file_id: 40, filename: 'Fractions.pdf', share: 'center', ext: '.pdf', rel_path: 'F1/Fractions.pdf', nas_path: '[Center]\\F1\\Fractions.pdf', page_count: 3, matched_pages: [2], snippet: 'Solve fractions', highlights: [[6, 15]], duplicate_count: 0, duplicate_locations: [] };
const found = { total: 1, page: 1, page_size: 20, results: [row], facets: { share: {}, ext: {}, modified: {}, folder: {} } };
beforeEach(() => {
  h.id = 5; h.role = 'Tutor'; h.readOnly = false; h.location = 'Main Center'; localStorage.clear(); h.fetch.mockReset();
  h.fetch.mockImplementation(async (path: string) => {
    if (path === '/materials/sources') return { features: ['search_refinements'], sources: [{ id: 'center', label: 'Center' }] };
    if (path === '/materials/search') return found;
    if (path.startsWith('/materials/40/preview')) return { chunks: [] };
    throw new Error(`Unexpected service: ${path}`);
  });
});
const mount = (props: Parameters<typeof CoursewareWorkspace>[0] = {}) => {
  const cache = new Map();
  const view = render(<SWRConfig value={{ provider: () => cache }}><CoursewareWorkspace {...props} /></SWRConfig>);
  return { ...view, refresh: () => view.rerender(<SWRConfig value={{ provider: () => cache }}><CoursewareWorkspace {...props} /></SWRConfig>) };
};
it('uses MCKB for query and preview, and resets selected files/query on account change', async () => {
  const view = mount({ onPick: vi.fn() });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search courseware' }), { target: { value: 'fractions' } });
  const result = await screen.findByRole('button', { name: /^Fractions\.pdf/ });
  await act(async () => { fireEvent.click(result); });
  expect(await screen.findByRole('region', { name: 'Courseware preview' })).toBeVisible();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Fractions.pdf' }));
  expect(screen.getByText('1 selected')).toBeVisible();
  h.id = 9; await act(async () => { view.refresh(); });
  expect(screen.getByRole('searchbox')).toHaveValue('');
  expect(screen.queryByText('1 selected')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Courseware preview' })).toBeNull();
  expect(screen.queryByRole('region', { name: 'Recent courseware files' })).toBeNull();
  expect(h.fetch.mock.calls.every(([path]) => path.startsWith('/materials/'))).toBe(true);
});
it('keeps external Zen previews in the existing pane and passes the exact path for assignment', async () => {
  const preview = vi.fn(), assign = vi.fn();
  mount({ externalPreview: true, multiple: false, onPreview: preview, onAssignResult: assign });
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'fractions' } });
  const result = await screen.findByRole('button', { name: /^Fractions\.pdf/ });
  await act(async () => { fireEvent.click(result); });
  expect(preview).toHaveBeenCalledWith(row);
  expect(screen.queryByRole('region', { name: 'Courseware preview' })).toBeNull();
  expect(screen.getByRole('button', { name: /^Fractions\.pdf/ })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Assign Fractions.pdf' }));
  expect(assign).toHaveBeenCalledWith(row);
});
it('removes assignment and basket controls for a read-only role', async () => {
  h.readOnly = true; h.role = 'Supervisor'; mount({ onPick: vi.fn(), onAssignResult: vi.fn() });
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'fractions' } });
  const result = await screen.findByRole('button', { name: /^Fractions\.pdf/ });
  await act(async () => { fireEvent.click(result); });
  expect(screen.queryByRole('button', { name: 'Add to lesson' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Assign Fractions.pdf' })).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
});
it('ignores an old query result after switching centres', async () => {
  let finish!: (value: unknown) => void;
  h.fetch.mockImplementation(async (path: string) => path.endsWith('/sources') ? { sources: [{ id: 'center', label: 'Center' }] } : new Promise(resolve => { finish = resolve; }));
  const view = mount();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'fractions' } });
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  h.location = 'Other Center'; view.refresh();
  await act(async () => finish(found));
  expect(screen.getByRole('searchbox')).toHaveValue('');
  expect(screen.queryByText('Fractions.pdf')).toBeNull();
});
