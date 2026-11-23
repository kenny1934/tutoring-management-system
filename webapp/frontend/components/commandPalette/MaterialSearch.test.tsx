import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SWRConfig } from 'swr';
import { MaterialHighlight, MaterialSearch, materialAliasPath } from './MaterialSearch';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/api', () => ({ fetchAPI: mocks.fetch }));
const row = (id: number, filename = `Worksheet ${id}.pdf`) => ({ file_id: id, filename, share: 'developer', ext: '.pdf', rel_path: `Year 9/${filename}`, nas_path: `\\\\nas\\Courseware Developer 中學\\Year 9\\${filename}`, page_count: 3, snippet: 'Practice fractions here', highlights: [[9, 18]], matched_pages: [1, 2], duplicate_count: 1, duplicate_locations: [] });
const page = (ids: number[], total = ids.length, number = 1) => ({ results: ids.map(id => row(id)), total, page: number, page_size: 2, facets: { share: { developer: total }, ext: { '.pdf': total }, folder: { 'Year 9': total }, modified: {} } });
const sources = { sources: [{ id: 'center', label: 'Center' }, { id: 'developer', label: 'Courseware Developer 中學' }, { id: 'msa_scan', label: 'MSA Staff / scan' }] };
function mount(query = 'fractions', scope = 'tutor-1') {
  const cache = new Map();
  const view = (value: string, identity: string) => <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}><MaterialSearch query={value} scope={identity} /></SWRConfig>;
  const result = render(view(query, scope));
  return { ...result, change: (value: string, identity = scope) => result.rerender(view(value, identity)) };
}
beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.fetch.mockImplementation(async (path: string) => {
    if (path.endsWith('/sources')) return sources;
    if (path.includes('/preview')) return { file_id: 1, chunks: [{ chunk_index: 0, page_start: 1, page_end: 2, content: 'Practice fractions here', highlights: [[9, 18]] }], truncated: false };
    return page([1, 2]);
  });
});

describe('Materials search', () => {
  it('passes source, type, date and folder filters without changing the query', async () => {
    mount(); await screen.findByRole('button', { name: /Worksheet 1/ });
    fireEvent.change(screen.getByLabelText('Material source'), { target: { value: 'developer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(screen.getByLabelText('Material file type'), { target: { value: '.pdf' } });
    fireEvent.change(screen.getByLabelText('Material modified date'), { target: { value: 'year' } });
    await screen.findByRole('option', { name: 'Year 9 (2)' });
    fireEvent.change(screen.getByLabelText('Material folder'), { target: { value: 'Year 9' } });
    await waitFor(() => expect(JSON.parse(mocks.fetch.mock.calls.filter(call => call[0].endsWith('/search')).at(-1)![1].body)).toMatchObject({ q: 'fractions', share: 'developer', ext: '.pdf', modified: 'year', folder: 'Year 9' }));
  });
  it('opens an honest page-range preview and returns focus to the same material', async () => {
    mount(); const result = await screen.findByRole('button', { name: /Worksheet 1/ }); fireEvent.click(result);
    const preview = await screen.findByRole('region', { name: 'Material preview' });
    expect(await within(preview).findByText('Pages 1–2')).toBeInTheDocument();
    expect(within(preview).getByText(/candidate page ranges/)).toBeInTheDocument();
    fireEvent.keyDown(preview, { key: 'Escape' });
    await waitFor(() => expect(result).toHaveFocus());
    expect(screen.queryByRole('region', { name: 'Material preview' })).toBeNull();
  });
  it('prevents a slow previous query from replacing newer results', async () => {
    let old!: (data: unknown) => void;
    mocks.fetch.mockImplementation((path: string, options: { body: string }) => path.endsWith('/sources') ? Promise.resolve(sources) : JSON.parse(options.body).q === 'old query' ? new Promise(resolve => { old = resolve; }) : Promise.resolve({ ...page([7]), results: [row(7, 'New result.pdf')] }));
    const view = mount('old query');
    await waitFor(() => expect(old).toBeTypeOf('function'));
    view.change('new query'); await screen.findByRole('button', { name: /New result/ });
    await act(async () => old({ ...page([8]), results: [row(8, 'Old result.pdf')] }));
    expect(screen.queryByRole('button', { name: /Old result/ })).toBeNull();
  });
  it('loads another page and groups repeated file identities', async () => {
    mocks.fetch.mockImplementation(async (path: string, options: { body: string }) => path.endsWith('/sources') ? sources : JSON.parse(options.body).page === 1 ? page([1, 2], 3) : page([2, 3], 3, 2));
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'Load more materials' }));
    await screen.findByRole('button', { name: /Worksheet 3/ });
    expect(screen.getAllByRole('button', { name: /Worksheet 2/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Load more materials' })).toBeNull();
  });
  it('keeps an unconfigured provider actionable', async () => {
    mocks.fetch.mockRejectedValue(new Error('Materials search is not connected yet.'));
    mount(); expect(await screen.findByRole('alert')).toHaveTextContent('not connected yet');
    expect(screen.getByRole('button', { name: 'Retry connection' })).toBeEnabled();
  });
  it('drops previews when identity scope changes', async () => {
    const view = mount(); fireEvent.click(await screen.findByRole('button', { name: /Worksheet 1/ }));
    await screen.findByRole('region', { name: 'Material preview' });
    await act(async () => view.change('fractions', 'tutor-2'));
    expect(screen.queryByRole('region', { name: 'Material preview' })).toBeNull();
  });
  it('can navigate the results using the arrow keys', async () => {
    mount(); const first = await screen.findByRole('button', { name: /Worksheet 1/ }); first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' }); expect(screen.getByRole('button', { name: /Worksheet 2/ })).toHaveFocus();
  });
  it('uses existing CSM aliases and preserves the scan subfolder', () => {
    expect(materialAliasPath('\\\\nas\\MSA Staff\\scan\\worksheet.pdf')).toBe('[MSA Staff]\\scan\\worksheet.pdf');
  });
  it('highlights Unicode code-point offsets without splitting emoji', () => {
    const { container } = render(<MaterialHighlight text="📚 分數 practice" ranges={[[2, 4]]} />);
    expect(container.querySelector('mark')).toHaveTextContent('分數');
    expect(container.textContent).toBe('📚 分數 practice');
  });
});
