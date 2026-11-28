import * as React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SWRConfig, useSWRConfig } from 'swr';
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
  localStorage.clear(); mocks.fetch.mockReset();
  mocks.fetch.mockImplementation(async (path: string) => {
    if (path.endsWith('/sources')) return sources;
    if (path.includes('/preview')) return { file_id: 1, chunks: [{ chunk_index: 0, page_start: 1, page_end: 2, content: 'Practice fractions here', highlights: [[9, 18]] }], truncated: false };
    return page([1, 2]);
  });
});

describe('Courseware search', () => {
  it('passes source, type, date and folder filters without changing the query', async () => {
    mount(); await screen.findByRole('button', { name: /Worksheet 1/ });
    fireEvent.change(screen.getByLabelText('Courseware source'), { target: { value: 'developer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.change(screen.getByLabelText('Courseware file type'), { target: { value: '.pdf' } });
    fireEvent.change(screen.getByLabelText('Courseware modified date'), { target: { value: 'year' } });
    await screen.findByRole('option', { name: 'Year 9 (2)' });
    fireEvent.change(screen.getByLabelText('Courseware folder'), { target: { value: 'Year 9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(JSON.parse(mocks.fetch.mock.calls.filter(call => call[0].endsWith('/search')).at(-1)![1].body)).toMatchObject({ q: 'fractions', share: 'developer', ext: '.pdf', modified: 'year', folder: 'Year 9' }));
  });
  it.each(['"a term"', '4x^2-y^2+10x-y'])('preserves the courseware query %s for the provider', async query => {
    mount(query);
    await screen.findByRole('button', { name: /Worksheet 1/ });
    const request = mocks.fetch.mock.calls.find(call => call[0].endsWith('/search'))!;
    expect(JSON.parse(request[1].body).q).toBe(query);
  });
  it('opens an honest page-range preview and returns focus to the same material', async () => {
    mount(); const result = await screen.findByRole('button', { name: /Worksheet 1/ }); fireEvent.click(result);
    const preview = await screen.findByRole('region', { name: 'Courseware preview' });
    expect(await within(preview).findByText('Pages 1–2')).toBeInTheDocument();
    expect(within(preview).getByRole('combobox', { name: 'Matching text pages' })).toBeVisible();
    expect(within(preview).getByRole('option', { name: 'Page 2' })).toBeInTheDocument();
    fireEvent.keyDown(preview, { key: 'Escape' });
    expect(result).toHaveFocus();
    expect(screen.queryByRole('region', { name: 'Courseware preview' })).toBeNull();
  });
  it('keeps file paths and fallback actions in collapsed file details', async () => {
    mount(); fireEvent.click(await screen.findByRole('button', { name: /Worksheet 1/ }));
    const preview = await screen.findByRole('region', { name: 'Courseware preview' });
    const details = within(preview).getByText('File details').closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(within(preview).getByRole('button', { name: 'Copy path' })).not.toBeVisible();
    expect(within(preview).getByRole('button', { name: 'Open in connected folder' })).not.toBeVisible();
    expect(within(preview).queryByLabelText('Courseware pages')).toBeNull();
    fireEvent.click(within(preview).getByText('File details'));
    expect(within(preview).getByRole('button', { name: 'Copy path' })).toBeVisible();
  });
  it('steps through text matches, wraps and scrolls only the preview content', async () => {
    mocks.fetch.mockImplementation(async (path: string) => path.endsWith('/sources') ? sources : path.includes('/preview') ? { file_id: 1, chunks: [{ chunk_index: 0, page_start: 1, page_end: 1, content: 'fractions and more fractions', highlights: [[0, 9], [19, 28]] }] } : page([1]));
    mount(); fireEvent.click(await screen.findByRole('button', { name: /Worksheet 1/ }));
    const preview = await screen.findByRole('region', { name: 'Courseware preview' });
    await within(preview).findByText('1 of 2 matches');
    const scroll = vi.fn();
    Object.assign(preview.querySelector('[data-courseware-scroll]')!, { scrollTo: scroll });
    const matches = preview.querySelectorAll('mark');
    expect(matches[0]).toHaveAttribute('data-current-match', 'true');
    fireEvent.click(within(preview).getByRole('button', { name: 'Next text match' }));
    expect(within(preview).getByText('2 of 2 matches')).toBeVisible();
    expect(matches[1]).toHaveAttribute('data-current-match', 'true');
    expect(matches[0]).not.toHaveAttribute('data-current-match');
    expect(scroll).toHaveBeenCalled();
    // A wrapped mobile match bar must leave the active text below its real height.
    const box = (top: number, height = 20) => ({ top, bottom: top + height, left: 0, right: 200, width: 200, height, x: 0, y: top, toJSON: () => ({}) });
    const content = preview.querySelector<HTMLElement>('[data-courseware-scroll]')!;
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(box(100, 500));
    vi.spyOn(within(preview).getByRole('group', { name: 'Text matches' }), 'getBoundingClientRect').mockReturnValue(box(100, 104));
    vi.spyOn(matches[0], 'getBoundingClientRect').mockReturnValue(box(500));
    vi.spyOn(preview.querySelector('[data-text-chunk]')!, 'getBoundingClientRect').mockReturnValue(box(200, 600));
    fireEvent.click(within(preview).getByRole('button', { name: 'Next text match' }));
    expect(scroll).toHaveBeenLastCalledWith({ top: 284, behavior: 'auto' });
    fireEvent.click(within(preview).getByRole('button', { name: 'Previous text match' }));
    fireEvent.click(within(preview).getByRole('button', { name: 'Next text match' }));
    expect(within(preview).getByText('1 of 2 matches')).toBeVisible();
    fireEvent.click(within(preview).getByRole('button', { name: 'Previous text match' }));
    expect(within(preview).getByText('2 of 2 matches')).toBeVisible();
  });
  it('highlights a rendered expression without marking its whole OCR page', async () => {
    const content = String.raw`解 $4x^{2} - y^{2} + 10x - y$。 Other page text.`;
    const start = Array.from(content.slice(0, content.indexOf('4x'))).length;
    const end = Array.from(content.slice(0, content.indexOf('$。'))).length;
    mocks.fetch.mockImplementation(async (path: string) => path.endsWith('/sources') ? sources : path.includes('/preview') ? { file_id: 1, chunks: [{ chunk_index: 0, page_start: 16, page_end: 16, content, highlights: [[start, end]] }] } : page([1]));
    mount('4x^2-y^2+10x-y'); fireEvent.click(await screen.findByRole('button', { name: /Worksheet 1/ }));
    const preview = await screen.findByRole('region', { name: 'Courseware preview' });
    await within(preview).findByText('1 of 1 matches');
    const match = preview.querySelector('mark[data-current-match]');
    expect(match?.querySelector('.katex')).not.toBeNull();
    expect(match).not.toHaveTextContent('Other page text');
    expect(preview.querySelector('[data-text-chunk]')).not.toHaveAttribute('data-current-match');
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
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'Load more courseware' }));
    await screen.findByRole('button', { name: /Worksheet 3/ });
    expect(screen.getAllByRole('button', { name: /Worksheet 2/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Load more courseware' })).toBeNull();
    const searches = mocks.fetch.mock.calls.filter(call => call[0].endsWith('/search'));
    expect(searches.filter(call => JSON.parse(call[1].body).page === 1)).toHaveLength(1);
  });
  it('keeps an unconfigured provider actionable', async () => {
    mocks.fetch.mockRejectedValue(new Error('Materials search is not connected yet.'));
    mount(); expect(await screen.findByRole('alert')).toHaveTextContent('not connected yet');
    expect(screen.getByRole('button', { name: 'Retry connection' })).toBeEnabled();
  });
  it('drops previews when identity scope changes', async () => {
    const view = mount(); fireEvent.click(await screen.findByRole('button', { name: /Worksheet 1/ }));
    await screen.findByRole('region', { name: 'Courseware preview' });
    await act(async () => view.change('fractions', 'tutor-2'));
    expect(screen.queryByRole('region', { name: 'Courseware preview' })).toBeNull();
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

it('restores source filters, loaded results, selection, match and reading position after the console unmounts', async () => {
  const { createMaterialWorkspace } = await import('./material-workspace');
  const workspace = createMaterialWorkspace(), cache = new Map();
  mocks.fetch.mockImplementation(async (path: string, options: { body: string }) => path.endsWith('/sources') ? sources : path.includes('/preview') ? {
    file_id: 3, chunks: [1, 16].map((number, index) => ({ chunk_index: index, page_start: number, page_end: number, content: 'fractions', highlights: [[0, 9]] })), truncated: false,
  } : JSON.parse(options.body).page === 1 ? page([1, 2], 3) : page([3], 3, 2));
  const tree = (open: boolean, query = 'fractions') => <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>{open && <MaterialSearch query={query} scope="continuity" workspace={workspace} />}</SWRConfig>;
  const view = render(tree(true));
  await screen.findByRole('button', { name: /Worksheet 1/ });
  fireEvent.change(screen.getByLabelText('Courseware source'), { target: { value: 'developer' } });
  fireEvent.change(screen.getByLabelText('Courseware sort'), { target: { value: 'recent' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Load more courseware' }));
  fireEvent.click(await screen.findByRole('button', { name: /Worksheet 3/ }));
  await screen.findByText('1 of 2 matches');
  fireEvent.click(screen.getByRole('button', { name: 'Next text match' }));
  const list = screen.getByLabelText('Courseware results'), text = document.querySelector<HTMLElement>('[data-courseware-scroll]')!;
  list.scrollTop = 300; fireEvent.scroll(list); text.scrollTop = 1400; fireEvent.scroll(text);
  view.rerender(tree(false)); view.rerender(tree(true));
  expect(screen.getByLabelText('Courseware source')).toHaveValue('developer');
  expect(screen.getByLabelText('Courseware sort')).toHaveValue('recent');
  await screen.findByRole('region', { name: 'Courseware preview' });
  expect(await screen.findByText('2 of 2 matches')).toBeVisible();
  expect(screen.getByRole('button', { name: /Worksheet 3/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Courseware results').scrollTop).toBe(300);
  expect(document.querySelector('[data-courseware-scroll]')?.scrollTop).toBe(1400);
  expect(workspace.reading?.place.matchPage).toBe(16);
  view.rerender(tree(true, 'new query'));
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Courseware preview' })).toBeNull());
});

it('recalls courseware history with source filters and allows removing it', async () => {
  const query = '4x^2-y^2+10x-y';
  let current = query;
  const cache = new Map();
  const change = (value: string) => { current = value; view.rerender(tree()); };
  const tree = () => <SWRConfig value={{ provider: () => cache }}><MaterialSearch query={current} scope="history-user" onQueryChange={change} /></SWRConfig>;
  const view = render(tree());
  await screen.findByRole('button', { name: /Worksheet 1/ });
  fireEvent.change(screen.getByLabelText('Courseware source'), { target: { value: 'msa_scan' } });
  fireEvent.click(await screen.findByRole('button', { name: /Worksheet 1/ }));
  change('');
  const recall = await screen.findByRole('button', { name: `Search courseware for ${query}` });
  expect(screen.queryByLabelText('Courseware sort')).toBeNull();
  expect(screen.queryByText(/results?$/, { selector: '[aria-live="polite"]' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Courseware source'), { target: { value: '' } });
  fireEvent.click(recall);
  await waitFor(() => expect(screen.getByLabelText('Courseware source')).toHaveValue('msa_scan'));
  await waitFor(() => expect(JSON.parse(mocks.fetch.mock.calls.filter(call => call[0].endsWith('/search')).at(-1)![1].body)).toMatchObject({ q: query, share: 'msa_scan' }));
  change('');
  fireEvent.click(await screen.findByRole('button', { name: `Remove courseware search ${query}` }));
  expect(screen.queryByRole('button', { name: `Search courseware for ${query}` })).toBeNull();
});

it('qualifies empty results only when the selected accessible source has known text gaps', async () => {
  mocks.fetch.mockImplementation(async (path: string) => path.endsWith('/sources') ? { sources: [
    { id: 'center', label: 'Center', coverage: { files: 10, limited_files: 0 } },
    { id: 'developer', label: 'Developer', coverage: { files: 10, limited_files: 3 } },
  ] } : page([], 0));
  mount();
  expect(await screen.findByRole('note')).toHaveTextContent('Some files in these sources have no searchable text');
  fireEvent.change(screen.getByLabelText('Courseware source'), { target: { value: 'center' } });
  await screen.findByText('No courseware matches. Try fewer words or broaden the filters.');
  expect(screen.queryByRole('note')).toBeNull();
  fireEvent.change(screen.getByLabelText('Courseware source'), { target: { value: 'developer' } });
  expect(await screen.findByRole('note')).toBeVisible();
});

it('distinguishes deferred OCR from uncertain recognised text and keeps the explanation collapsed', async () => {
  mocks.fetch.mockImplementation(async (path: string) => path.endsWith('/sources') ? sources : path.includes('/preview') ? {
    file_id: 1, chunks: [], truncated: false, extraction_metadata: { needs_review: true, pages: [] },
    coverage: { status: 'awaiting_ocr', has_text: false, total_pages: 3, native: 0, ocr: 0, pending_ocr: 3, failed_ocr: 0 },
  } : page([1]));
  mount(); fireEvent.click(await screen.findByRole('button', { name: /Worksheet 1/ }));
  const details = await screen.findByLabelText('Text coverage');
  expect(details).not.toHaveAttribute('open');
  expect(within(details).getByText('OCR not run · 3 pages')).toBeVisible();
  expect(screen.queryByText(/uncertain OCR/)).toBeNull();
  fireEvent.click(within(details).getByText('OCR not run · 3 pages'));
  expect(within(details).getByText(/may include blank or sparse pages/)).toBeVisible();
  fireEvent.keyDown(details, { key: 'Escape' });
  expect(details).not.toHaveAttribute('open');
  expect(screen.getByRole('region', { name: 'Courseware preview' })).toBeVisible();
});

it('loads a matching page omitted by the initial text cap, preserves highlights, and returns to all matches', async () => {
  const later = 'Later fractions page';
  mocks.fetch.mockImplementation(async (path: string) => path.endsWith('/sources') ? { ...sources, features: ['coverage', 'focused_preview'] } : path.includes('/preview') ? {
    file_id: 1, chunks: [{ chunk_index: path.includes('&page=16') ? 15 : 0, page_start: path.includes('&page=16') ? 16 : 1, page_end: path.includes('&page=16') ? 16 : 1,
      content: path.includes('&page=16') ? later : 'fractions', highlights: path.includes('&page=16') ? [[6, 15]] : [[0, 9]] }], truncated: !path.includes('&page=16'),
  } : { ...page([1]), results: [{ ...row(1), page_count: 34, matched_pages: [1, 16] }] });
  mount(); fireEvent.click(await screen.findByRole('button', { name: /Worksheet 1/ }));
  await screen.findByRole('heading', { name: 'Page 1' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Matching text pages' }), { target: { value: '16' } });
  await screen.findByRole('heading', { name: 'Page 16' });
  expect(mocks.fetch).toHaveBeenCalledWith('/materials/1/preview?q=fractions&page=16', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(screen.getByRole('combobox', { name: 'Matching text pages' })).toHaveValue('16');
  expect(document.querySelector('[data-current-match]')).toHaveTextContent('fractions');
  expect(document.querySelector('[data-text-chunk]')).toHaveTextContent(later);
  fireEvent.change(screen.getByRole('combobox', { name: 'Matching text pages' }), { target: { value: 'all' } });
  await screen.findByRole('heading', { name: 'Page 1' });
  expect(screen.getByRole('combobox', { name: 'Matching text pages' })).toHaveValue('all');
});

it('can jump within an existing preview when the provider has not deployed focused-page support', async () => {
  mocks.fetch.mockImplementation(async (path: string) => path.endsWith('/sources') ? sources : path.includes('/preview') ? {
    file_id: 1, chunks: [1, 16].map((number, index) => ({ chunk_index: index, page_start: number, page_end: number, content: 'fractions', highlights: [[0, 9]] })), truncated: false,
  } : { ...page([1]), results: [{ ...row(1), page_count: 34, matched_pages: [1, 16] }] });
  mount(); fireEvent.click(await screen.findByRole('button', { name: /Worksheet 1/ }));
  await screen.findByRole('heading', { name: 'Page 1' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Matching text pages' }), { target: { value: '16' } });
  await screen.findByRole('heading', { name: 'Page 16' });
  expect(screen.queryByRole('heading', { name: 'Page 1' })).toBeNull();
  expect(mocks.fetch.mock.calls.filter(call => call[0].includes('/preview')).every(call => !call[0].includes('&page='))).toBe(true);
});

it('aborts obsolete search and preview requests', async () => {
  const original = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((path: string, options: { body: string }) => {
    if (path.includes('/preview') || (path === '/materials/search' && JSON.parse(options.body).q === 'algebra')) return new Promise(() => {});
    return original(path, options);
  });
  const view = mount(); await screen.findByRole('button', { name: /Worksheet 1/ });
  fireEvent.click(screen.getByRole('button', { name: /Worksheet 1/ }));
  await screen.findByRole('region', { name: 'Courseware preview' });
  const oldPreview = mocks.fetch.mock.calls.find(call => String(call[0]).includes('/preview'))![1].signal as AbortSignal;
  view.change('algebra');
  await waitFor(() => expect(oldPreview.aborted).toBe(true));
  await waitFor(() => expect(mocks.fetch.mock.calls.some(call => call[0] === '/materials/search' && JSON.parse(call[1].body).q === 'algebra')).toBe(true));
  const latest = mocks.fetch.mock.calls.filter(call => call[0] === '/materials/search').at(-1)![1].signal as AbortSignal;
  expect(latest.aborted).toBe(false); view.unmount(); expect(latest.aborted).toBe(true);
});
it('keeps selected documents while changing the search query', async () => {
  const view = render(<SWRConfig value={{ provider: () => new Map() }}><MaterialSearch query="fractions" scope="basket" canAssign /></SWRConfig>);
  fireEvent.click(await screen.findByLabelText('Select Worksheet 1.pdf'));
  expect(screen.getByRole('group', { name: 'Selected courseware' })).toHaveTextContent('1 selected');
  view.rerender(<SWRConfig value={{ provider: () => new Map() }}><MaterialSearch query="algebra" scope="basket" canAssign /></SWRConfig>);
  await screen.findByRole('button', { name: /Worksheet 2/ });
  fireEvent.click(screen.getByLabelText('Select Worksheet 2.pdf'));
  expect(screen.getByRole('group', { name: 'Selected courseware' })).toHaveTextContent('2 selected');
  fireEvent.click(screen.getByRole('button', { name: 'Review and assign' }));
  expect(screen.getByLabelText('Pages for Worksheet 1.pdf')).toHaveValue('1-3');
  expect(screen.getByLabelText('Pages for Worksheet 2.pdf')).toHaveValue('1-3');
});

it('applies structured rules together, forwards them to preview, and removes individual chips', async () => {
  const original = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((path: string, options: { body: string }) => path.endsWith('/sources') ? Promise.resolve({ ...sources, features: ['search_refinements', 'focused_preview'] }) : original(path, options));
  mount('F1 algebra');
  await screen.findByRole('button', { name: /Worksheet 1/ });
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  const calls = mocks.fetch.mock.calls.filter(call => call[0] === '/materials/search').length;
  fireEvent.change(screen.getByLabelText('Add condition'), { target: { value: 'any_words' } });
  fireEvent.change(screen.getByLabelText('Alternatives'), { target: { value: 'factorisation' } });
  fireEvent.keyDown(screen.getByLabelText('Alternatives'), { key: 'Enter' });
  fireEvent.change(screen.getByLabelText('Alternatives'), { target: { value: 'factorization' } });
  fireEvent.change(screen.getByLabelText('Add condition'), { target: { value: 'exclude_words' } });
  fireEvent.change(screen.getByLabelText('Excluded words'), { target: { value: 'draft' } });
  fireEvent.keyDown(screen.getByLabelText('Excluded words'), { key: 'Enter' });
  fireEvent.change(screen.getByLabelText('Excluded words'), { target: { value: 'answers' } });
  fireEvent.change(screen.getByLabelText('Add condition'), { target: { value: 'exact_phrase' } });
  fireEvent.change(screen.getByLabelText('Exact phrase'), { target: { value: 'a term' } });
  fireEvent.change(screen.getByLabelText('Courseware modified date'), { target: { value: 'custom' } });
  fireEvent.change(screen.getByLabelText('Modified from'), { target: { value: '2025-01-01' } });
  fireEvent.change(screen.getByLabelText('Modified through'), { target: { value: '2025-12-31' } });
  expect(mocks.fetch.mock.calls.filter(call => call[0] === '/materials/search')).toHaveLength(calls);
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(screen.queryByRole('form', { name: 'Courseware filter settings' })).toBeNull();
  await waitFor(() => expect(mocks.fetch.mock.calls.filter(call => call[0] === '/materials/search')).toHaveLength(calls+1));
  const payload = JSON.parse(mocks.fetch.mock.calls.filter(call => call[0] === '/materials/search').at(-1)![1].body);
  expect(payload).toMatchObject({ q: 'F1 algebra', refine: { any_words: 'factorisation factorization', exclude_words: 'draft answers', exact_phrase: 'a term', modified_from: '2025-01-01', modified_to: '2025-12-31' } });
  expect(payload.any_words).toBeUndefined();
  fireEvent.click(await screen.findByRole('button', { name: /Worksheet 1/ }));
  await waitFor(() => expect(mocks.fetch.mock.calls.some(call => String(call[0]).includes('/preview'))).toBe(true));
  const url = new URL(mocks.fetch.mock.calls.find(call => String(call[0]).includes('/preview'))![0], 'https://example.test');
  expect(JSON.parse(url.searchParams.get('refine')!)).toEqual(payload.refine);
  fireEvent.click(screen.getByRole('button', { name: 'Remove Excludes draft or answers' }));
  await waitFor(() => expect(JSON.parse(mocks.fetch.mock.calls.filter(call => call[0] === '/materials/search').at(-1)![1].body).refine.exclude_words).toBeUndefined());
});

it('rejects reversed dates and cancels drafts without changing the search', async () => {
  const original = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((path: string, options: { body: string }) => path.endsWith('/sources') ? Promise.resolve({ ...sources, features: ['search_refinements'] }) : original(path, options));
  mount(); await screen.findByRole('button', { name: /Worksheet 1/ });
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  fireEvent.change(screen.getByLabelText('Courseware modified date'), { target: { value: 'custom' } });
  fireEvent.change(screen.getByLabelText('Modified from'), { target: { value: '2026-01-01' } });
  fireEvent.change(screen.getByLabelText('Modified through'), { target: { value: '2025-01-01' } });
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('start date');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  expect(screen.queryByLabelText('Modified from')).toBeNull();
  expect(screen.getByLabelText('Courseware modified date')).toHaveValue('');
  expect(mocks.fetch.mock.calls.filter(call => call[0] === '/materials/search')).toHaveLength(1);
});

it('supports a phrase-only search and recalls its complete refinements from history', async () => {
  const original = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((path: string, options: { body: string }) => path.endsWith('/sources') ? Promise.resolve({ ...sources, features: ['search_refinements'] }) : original(path, options));
  const cache = new Map();
  function App() {
    const [query, change] = React.useState('');
    return <SWRConfig value={{ provider: () => cache }}><MaterialSearch scope="phrase-history" query={query} onQueryChange={change} /></SWRConfig>;
  }
  const view = render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Filters' }));
  fireEvent.change(screen.getByLabelText('Add condition'), { target: { value: 'exact_phrase' } });
  fireEvent.change(screen.getByLabelText('Exact phrase'), { target: { value: 'a term' } });
  fireEvent.change(screen.getByLabelText('Search word matching'), { target: { value: 'any' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  fireEvent.click(await screen.findByRole('button', { name: /Worksheet 1/ }));
  view.unmount(); render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Search courseware for a term' }));
  await screen.findByRole('button', { name: /Worksheet 1/ });
  expect(screen.getByRole('button', { name: 'Remove Exact phrase: a term' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Remove Any search word' })).toBeVisible();
});

it('hosts courseware controls in the shared toolbar and edits source/scope within Filters', async () => {
  const host = document.createElement('div'); document.body.append(host);
  mocks.fetch.mockImplementation(async (path: string) => path.endsWith('/sources') ? { ...sources, features: ['search_refinements'] } : page([1]));
  render(<SWRConfig value={{ provider: () => new Map() }}><MaterialSearch query="algebra" scope="toolbar" toolbarHost={host} /></SWRConfig>);
  await screen.findByRole('button', { name: /Worksheet 1/ });
  expect(host).toContainElement(screen.getByLabelText('Courseware source'));
  expect(host.querySelectorAll('select')).toHaveLength(1);
  expect(screen.queryByLabelText('Courseware search scope')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  fireEvent.change(screen.getByLabelText('Filter courseware source'), { target: { value: 'developer' } });
  fireEvent.change(screen.getByLabelText('Courseware search scope'), { target: { value: 'content' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  await waitFor(() => expect(JSON.parse(mocks.fetch.mock.calls.filter(call => call[0].endsWith('/search')).at(-1)![1].body)).toMatchObject({ share: 'developer', refine: { search_in: 'content' } }));
  expect(screen.getByLabelText('Courseware source')).toHaveValue('developer');
  host.remove();
});


it('warms source permissions while records are open, without searching until courseware is active', async () => {
  const cache = new Map();
  const tree = (active: boolean, scope = 'warm-user:MSA', warm = true) => <SWRConfig value={{ provider: () => cache }}><MaterialSearch query="fractions" scope={scope} active={active} prefetchSources={warm} /></SWRConfig>;
  const view = render(tree(false, 'warm-user:MSA', false));
  expect(mocks.fetch).not.toHaveBeenCalled();
  view.rerender(tree(false));
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
  expect(mocks.fetch).toHaveBeenCalledWith('/materials/sources');
  expect(mocks.fetch.mock.calls.some(([path]) => path.endsWith('/search'))).toBe(false);
  view.rerender(tree(true));
  await screen.findByRole('button', { name: /Worksheet 1/ });
  expect(mocks.fetch.mock.calls.filter(([path]) => path.endsWith('/sources'))).toHaveLength(1);
  view.rerender(tree(false, 'another-user:MSB'));
  await waitFor(() => expect(mocks.fetch.mock.calls.filter(([path]) => path.endsWith('/sources'))).toHaveLength(2));
  expect(screen.queryByRole('button', { name: /Worksheet 1/ })).toBeNull();
});


it('keeps the selected courseware when Escape closes a portalled assignment dialog', async () => {
  render(<SWRConfig value={{ provider: () => new Map() }}><MaterialSearch query="fractions" scope="portal-escape" canAssign /></SWRConfig>);
  fireEvent.click(await screen.findByRole('button', { name: /Worksheet 1/ }));
  const preview = screen.getByRole('region', { name: 'Courseware preview' });
  fireEvent.click(within(preview).getByRole('button', { name: 'Assign to sessions' }));
  const pages = await screen.findByLabelText('Courseware pages');
  fireEvent.keyDown(pages, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByLabelText('Courseware pages')).toBeNull());
  expect(preview).toBeVisible();
  expect(within(preview).getByRole('heading', { name: 'Worksheet 1.pdf' })).toBeVisible();
});


it('reopens a cancelled request cache without flashing an abort alert', async () => {
  const original=mocks.fetch.getMockImplementation()!;
  let fractionsCalls=0,finish!: (value: ReturnType<typeof page>)=>void;
  mocks.fetch.mockImplementation((path:string,options?:{body:string;signal:AbortSignal})=>{
    if(path!=='/materials/search'||JSON.parse(options!.body).q!=='fractions')return original(path,options);
    fractionsCalls++;
    if(fractionsCalls===1)return new Promise((_resolve,reject)=>options!.signal.addEventListener('abort',()=>reject(new DOMException('signal is aborted without reason','AbortError'))));
    return new Promise(resolve=>{finish=resolve;});
  });
  const alerts:string[]=[];
  const observer=new MutationObserver(()=>document.querySelectorAll('[role="alert"]').forEach(el=>alerts.push(el.textContent??'')));
  observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  try{
    const view=mount('fractions');await waitFor(()=>expect(fractionsCalls).toBe(1));
    view.change('algebra');await screen.findByRole('button',{name:/Worksheet 1/});
    view.change('fractions');await waitFor(()=>expect(fractionsCalls).toBe(2));
    expect(screen.queryByRole('button',{name:'Retry search'})).not.toBeInTheDocument();
    await act(async()=>{finish(page([3]));});await screen.findByRole('button',{name:/Worksheet 3/});
    expect(alerts.some(text=>/aborted|Retry search/i.test(text))).toBe(false);
  }finally{observer.disconnect();}
});


it('still offers Retry for a failure that the current request did not cancel', async () => {
  mocks.fetch.mockImplementation((path:string)=>path.endsWith('/sources')?Promise.resolve(sources):Promise.reject(new Error('Courseware service unavailable.')));
  mount();await screen.findByRole('button',{name:'Retry search'});
  expect(screen.getByRole('alert')).toHaveTextContent('Courseware service unavailable.');
});

it('opens a pasted NAS path through exact resolution and the existing reader', async () => {
  const material = row(9, 'Algebra.pdf');
  mocks.fetch.mockImplementation(async (path: string) => {
    if (path.endsWith('/sources')) return { ...sources, features: ['folder_navigation', 'focused_preview', 'search_refinements'] };
    if (path.endsWith('/resolve')) return material;
    if (path.includes('/preview')) return { file_id: 9, chunks: [], truncated: false };
    return page([]);
  });
  mount(String.raw`V:\English\DSE\Algebra.pdf`);
  const preview = await screen.findByRole('region', { name: 'Courseware preview' });
  expect(within(preview).getByRole('heading', { name: 'Algebra.pdf' })).toBeVisible();
  const lookup = mocks.fetch.mock.calls.find(call => call[0].endsWith('/resolve'))!;
  expect(JSON.parse(lookup[1].body)).toEqual({ path: String.raw`V:\English\DSE\Algebra.pdf`, allow_folder: true });
  expect(mocks.fetch.mock.calls.some(call => call[0].endsWith('/search'))).toBe(false);
  await waitFor(() => expect(mocks.fetch.mock.calls.some(call => call[0].includes('/preview?q=') && !call[0].includes('English'))).toBe(true));
  fireEvent.click(within(preview).getByRole('button', { name: 'Back to courseware' }));
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Courseware preview' })).toBeNull());
  expect(screen.getByRole('button', { name: /Algebra.pdf/ })).toBeInTheDocument();
});

it('does not fall back to a text search when a pasted path is inaccessible', async () => {
  mocks.fetch.mockImplementation(async (path: string) => {
    if (path.endsWith('/sources')) return { ...sources, features: ['folder_navigation'] };
    throw new Error('Not available');
  });
  mount(String.raw`Z:\Private\Algebra.pdf`);
  expect(await screen.findByRole('button', { name: 'Retry opening' })).toBeVisible();
  expect(mocks.fetch.mock.calls.some(call => call[0].endsWith('/search'))).toBe(false);
});

it('browses a selected source folder with an empty search box', async () => {
  const { createMaterialWorkspace } = await import('./material-workspace');
  const workspace = createMaterialWorkspace();
  workspace.filters = { ...workspace.filters, share: 'center', folder: 'English/DSE/F4' };
  mocks.fetch.mockImplementation(async (path: string) => {
    if (path.endsWith('/sources')) return { ...sources, features: ['folder_navigation', 'search_refinements'] };
    return page([1]);
  });
  render(<SWRConfig value={{ provider: () => new Map() }}><MaterialSearch query="" scope="browse" workspace={workspace} /></SWRConfig>);
  expect(await screen.findByRole('button', { name: /Worksheet 1/ })).toBeVisible();
  expect(JSON.parse(mocks.fetch.mock.calls.find(call => call[0].endsWith('/search'))![1].body)).toMatchObject({ q: '', share: 'center', folder: 'English/DSE/F4' });
});


it.each(['English/DSE', '/'])('turns a pasted folder into a browsable scope: %s', async folder => {
  mocks.fetch.mockImplementation(async (path: string) => {
    if (path.endsWith('/sources')) return { ...sources, features: ['folder_navigation', 'search_refinements'] };
    if (path.endsWith('/resolve')) return { kind: 'folder', share: 'center', folder };
    return page([1]);
  });
  function Harness() {
    const [query, setQuery] = React.useState(String.raw`Z:\English\DSE`);
    return <><input aria-label="Test query" value={query} onChange={e => setQuery(e.target.value)} /><MaterialSearch query={query} scope="folder-path" onQueryChange={setQuery} /></>;
  }
  render(<SWRConfig value={{ provider: () => new Map() }}><Harness /></SWRConfig>);
  expect(await screen.findByRole('button', { name: /Worksheet 1/ })).toBeVisible();
  expect(screen.getByLabelText('Test query')).toHaveValue('');
  const requests = () => mocks.fetch.mock.calls.filter(call => call[0].endsWith('/search')).map(call => JSON.parse(call[1].body));
  expect(requests()).toContainEqual(expect.objectContaining({ q: '', share: 'center', folder }));
  expect(requests().some(request => request.q.includes('English'))).toBe(false);
  expect(screen.queryByRole('region', { name: 'Courseware preview' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Test query'), { target: { value: 'quadratic' } });
  await waitFor(() => expect(requests()).toContainEqual(expect.objectContaining({ q: 'quadratic', share: 'center', folder })));
});


it('browses folders before immediate files and searches descendants by default', async () => {
  const { createMaterialWorkspace } = await import('./material-workspace');
  const workspace = createMaterialWorkspace();
  workspace.filters = { ...workspace.filters, share: 'center', folder: 'English/DSE' };
  mocks.fetch.mockImplementation(async (path: string, options?: {body: string}) => {
    if (path.endsWith('/sources')) return { ...sources, features: ['folder_navigation', 'search_refinements'] };
    if (path.endsWith('/folders')) {
      const {share, folder} = JSON.parse(options!.body);
      return {share, path: folder === '/' ? '' : folder, folders: folder === 'English/DSE' ? [{name: 'F4', path: 'English/DSE/F4', files: 3}] : [], next: null};
    }
    return page([1]);
  });
  function Harness() {
    const [query, setQuery] = React.useState('');
    return <><input aria-label="Test query" value={query} onChange={e=>setQuery(e.target.value)} /><MaterialSearch query={query} scope="browse-depth" workspace={workspace} onQueryChange={setQuery} /></>;
  }
  render(<SWRConfig value={{provider:()=>new Map()}}><Harness /></SWRConfig>);
  const folder = await screen.findByRole('button', {name:'Open folder F4'});
  const file = await screen.findByRole('button', {name:/Worksheet 1/});
  expect(folder.compareDocumentPosition(file) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const requests = () => mocks.fetch.mock.calls.filter(call=>call[0].endsWith('/search')).map(call=>JSON.parse(call[1].body));
  expect(requests()).toContainEqual(expect.objectContaining({q:'',folder:'English/DSE',folder_scope:'current'}));
  fireEvent.click(folder);
  await waitFor(()=>expect(requests()).toContainEqual(expect.objectContaining({q:'',folder:'English/DSE/F4',folder_scope:'current'})));
  fireEvent.click(screen.getByRole('button',{name:'DSE'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Open folder F4'})).toBeVisible());
  fireEvent.change(screen.getByLabelText('Test query'),{target:{value:'quadratic'}});
  const toggle = await screen.findByRole('checkbox',{name:'Include subfolders'});
  expect(toggle).toBeChecked();
  await waitFor(()=>expect(requests()).toContainEqual(expect.objectContaining({q:'quadratic',folder:'English/DSE',folder_scope:'subtree'})));
  fireEvent.click(toggle);
  await waitFor(()=>expect(requests()).toContainEqual(expect.objectContaining({q:'quadratic',folder:'English/DSE',folder_scope:'current'})));
});


it('opens folders from a visible Browse action, switches sources and preserves a cancelled search', async () => {
  mocks.fetch.mockImplementation(async (path: string, options?: {body: string}) => {
    if (path.endsWith('/sources')) return {...sources,features:['folder_navigation','search_refinements']};
    if (path.endsWith('/folders')) {
      const {share,folder}=JSON.parse(options!.body);
      const name=share==='center'?'English':'Revision';
      return {share,path:folder,folders:folder===''?[{name,path:name,files:3}]:[],next:null};
    }
    return page([1]);
  });
  function Harness() {
    const [query,setQuery]=React.useState('fractions');
    return <><input aria-label="Test query" value={query} onChange={e=>setQuery(e.target.value)}/><MaterialSearch query={query} scope="browse-entry" onQueryChange={setQuery}/></>;
  }
  render(<SWRConfig value={{provider:()=>new Map()}}><Harness/></SWRConfig>);
  await screen.findByRole('button',{name:/Worksheet 1/});
  fireEvent.click(screen.getByRole('button',{name:'Browse folders'}));
  expect(await screen.findByRole('button',{name:'Browse Center'})).toBeVisible();
  expect(screen.getByRole('button',{name:'Browse Courseware Developer 中學'})).toBeVisible();
  expect(screen.getByRole('button',{name:'Browse MSA Staff / scan'})).toBeVisible();
  expect(screen.queryByRole('button',{name:'Filters'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Back to search'}));
  expect(screen.getByLabelText('Test query')).toHaveValue('fractions');
  expect(await screen.findByRole('button',{name:/Worksheet 1/})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Browse folders'}));
  fireEvent.click(screen.getByRole('button',{name:'Browse Center'}));
  expect(await screen.findByRole('button',{name:'Open folder English'})).toBeVisible();
  expect(screen.getByLabelText('Test query')).toHaveValue('');
  const requests=()=>mocks.fetch.mock.calls.filter(call=>call[0].endsWith('/search')).map(call=>JSON.parse(call[1].body));
  await waitFor(()=>expect(requests()).toContainEqual(expect.objectContaining({q:'',share:'center',folder:'/',folder_scope:'current'})));
  fireEvent.click(screen.getByRole('button',{name:'Folders'}));
  fireEvent.click(screen.getByRole('button',{name:'Browse Courseware Developer 中學'}));
  expect(await screen.findByRole('button',{name:'Open folder Revision'})).toBeVisible();
  expect(screen.queryByRole('button',{name:'Open folder English'})).toBeNull();
  await waitFor(()=>expect(requests()).toContainEqual(expect.objectContaining({q:'',share:'developer',folder:'/'})));
  fireEvent.click(screen.getByRole('button',{name:'Browse folders'}));
  fireEvent.change(screen.getByLabelText('Test query'),{target:{value:'quadratic'}});
  await waitFor(()=>expect(screen.queryByRole('region',{name:'Courseware folders'})).toBeNull());
  await waitFor(()=>expect(requests()).toContainEqual(expect.objectContaining({q:'quadratic',share:'developer',folder:'/',folder_scope:'subtree'})));
});

it('handles Escape from the portalled Browse button without closing its parent', async () => {
  mocks.fetch.mockImplementation(async (path:string)=>path.endsWith('/sources')?{...sources,features:['folder_navigation']}:page([]));
  const host=document.createElement('div');document.body.appendChild(host);
  const parentEscape=vi.fn();
  try {
    render(<SWRConfig value={{provider:()=>new Map()}}><div onKeyDown={parentEscape}><MaterialSearch query="" scope="browse-escape" toolbarHost={host}/></div></SWRConfig>);
    const browse=await screen.findByRole('button',{name:'Browse folders'});
    fireEvent.click(browse);
    await screen.findByRole('region',{name:'Courseware folders'});
    fireEvent.keyDown(browse,{key:'Escape'});
    expect(screen.queryByRole('region',{name:'Courseware folders'})).toBeNull();
    expect(parentEscape).not.toHaveBeenCalled();
    expect(browse).toHaveFocus();
  } finally {host.remove();}
});


it('opens a recent folder directly and omits history from unavailable sources', async () => {
  const {defaultMaterialFilters}=await import('./material-workspace');
  localStorage.setItem('command-palette-courseware-history:recent-folder-entry',JSON.stringify([
    {query:'quadratic',filters:{...defaultMaterialFilters(),share:'center',folder:'English/DSE'}},
    {query:'private',filters:{...defaultMaterialFilters(),share:'director',folder:'Private'}},
  ]));
  mocks.fetch.mockImplementation(async(path:string,options?:{body:string})=>{
    if(path.endsWith('/sources'))return {...sources,features:['folder_navigation','search_refinements']};
    if(path.endsWith('/folders')){const {share,folder}=JSON.parse(options!.body);return {share,path:folder,folders:[],next:null};}
    return page([1]);
  });
  function Harness(){const [query,setQuery]=React.useState('');return <MaterialSearch query={query} scope="recent-folder-entry" onQueryChange={setQuery}/>;}
  render(<SWRConfig value={{provider:()=>new Map()}}><Harness/></SWRConfig>);
  fireEvent.click(await screen.findByRole('button',{name:'Browse folders'}));
  expect(screen.queryByRole('button',{name:/Browse recent folder.*Private/})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Browse recent folder Center / English/DSE'}));
  await waitFor(()=>expect(mocks.fetch.mock.calls.some(call=>call[0].endsWith('/search')&&JSON.parse(call[1].body).folder==='English/DSE')).toBe(true));
  expect(screen.queryByRole('region',{name:'Courseware folders'})).toBeNull();
});


it('keeps a pasted-file reader closed when its metadata refreshes after Back', async () => {
  const path=String.raw`Z:\English\Algebra.pdf`;
  const material=row(9,'Algebra.pdf');
  mocks.fetch.mockImplementation(async(url:string)=>{
    if(url.endsWith('/sources'))return {...sources,features:['folder_navigation','focused_preview','search_refinements']};
    if(url.endsWith('/resolve'))return material;
    return {file_id:9,chunks:[],truncated:false};
  });
  let refresh!:ReturnType<typeof useSWRConfig>['mutate'];
  function Harness(){refresh=useSWRConfig().mutate;return <MaterialSearch query={path} scope="refresh-path"/>;}
  render(<SWRConfig value={{provider:()=>new Map()}}><Harness/></SWRConfig>);
  const preview=await screen.findByRole('region',{name:'Courseware preview'});
  fireEvent.click(within(preview).getByRole('button',{name:'Back to courseware'}));
  await waitFor(()=>expect(screen.queryByRole('region',{name:'Courseware preview'})).toBeNull());
  await act(async()=>{await refresh(['material-path','refresh-path',path],{...material,filename:'Updated algebra.pdf'},{revalidate:false});});
  expect(screen.queryByRole('region',{name:'Courseware preview'})).toBeNull();
  expect(screen.getByRole('button',{name:/Updated algebra.pdf/})).toBeVisible();
});


it('starts explicit source navigation without waiting for the typing debounce', async () => {
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
  mocks.fetch.mockImplementation(async(path:string,options?:{body:string})=>{
    if(path.endsWith('/sources'))return {...sources,features:['folder_navigation','search_refinements']};
    if(path.endsWith('/folders')){const body=JSON.parse(options!.body);return {share:body.share,path:'',folders:[],next:null};}
    return page([1]);
  });
  function Harness(){const [query,setQuery]=React.useState('algebra');return <MaterialSearch query={query} scope="immediate-source" onQueryChange={setQuery}/>;}
  try {
    render(<SWRConfig value={{provider:()=>new Map()}}><Harness/></SWRConfig>);
    await act(async()=>{await vi.advanceTimersByTimeAsync(20);});
    fireEvent.click(screen.getByRole('button',{name:'Browse folders'}));
    fireEvent.click(screen.getByRole('button',{name:'Browse Center'}));
    await act(async()=>{await vi.advanceTimersByTimeAsync(20);});
    expect(mocks.fetch.mock.calls.some(call=>call[0].endsWith('/search')&&JSON.parse(call[1].body).q===''&&JSON.parse(call[1].body).folder==='/')).toBe(true);
  } finally {vi.useRealTimers();}
});

it('starts a deliberate saved search immediately while retaining debouncing for typed words', async () => {
  const {defaultMaterialFilters}=await import('./material-workspace');
  localStorage.setItem('command-palette-courseware-history:immediate-history',JSON.stringify([{query:'quadratic',filters:defaultMaterialFilters()}]));
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
  mocks.fetch.mockImplementation(async(path:string)=>path.endsWith('/sources')?sources:page([1]));
  function Harness(){const [query,setQuery]=React.useState('');return <><input aria-label="Test query" value={query} onChange={e=>setQuery(e.target.value)}/><MaterialSearch query={query} scope="immediate-history" onQueryChange={setQuery}/></>;}
  try {
    render(<SWRConfig value={{provider:()=>new Map()}}><Harness/></SWRConfig>);
    await act(async()=>{await vi.advanceTimersByTimeAsync(20);});
    fireEvent.click(screen.getByRole('button',{name:'Search courseware for quadratic'}));
    await act(async()=>{await vi.advanceTimersByTimeAsync(20);});
    const searched=(q:string)=>mocks.fetch.mock.calls.some(call=>call[0].endsWith('/search')&&JSON.parse(call[1].body).q===q);
    expect(searched('quadratic')).toBe(true);
    fireEvent.change(screen.getByLabelText('Test query'),{target:{value:'algebra'}});
    await act(async()=>{await vi.advanceTimersByTimeAsync(299);});
    expect(searched('algebra')).toBe(false);
    await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
    expect(searched('algebra')).toBe(true);
  } finally {vi.useRealTimers();}
});

it('returns from the source chooser to the previous results scroll position', async () => {
  const {createMaterialWorkspace}=await import('./material-workspace');
  const workspace=createMaterialWorkspace();
  mocks.fetch.mockImplementation(async(path:string,options?:{body:string})=>path.endsWith('/sources')?{...sources,features:['folder_navigation']}:JSON.parse(options!.body).page===2?page([3],3,2):page([1,2],3));
  render(<SWRConfig value={{provider:()=>new Map()}}><MaterialSearch query="fractions" scope="chooser-scroll" workspace={workspace}/></SWRConfig>);
  await screen.findByRole('button',{name:/Worksheet 1/});
  fireEvent.click(screen.getByRole('button',{name:'Load more courseware'}));
  await screen.findByRole('button',{name:/Worksheet 3/});
  const list=screen.getByLabelText('Courseware results');
  list.scrollTop=320;fireEvent.scroll(list);
  fireEvent.click(screen.getByRole('button',{name:'Browse folders'}));
  await screen.findByRole('button',{name:'Browse Center'});
  list.scrollTop=0;fireEvent.scroll(list);
  fireEvent.click(screen.getByRole('button',{name:'Back to search'}));
  await screen.findByRole('button',{name:/Worksheet 1/});
  expect(await screen.findByRole('button',{name:/Worksheet 3/})).toBeVisible();
  expect(list.scrollTop).toBe(320);
  expect(workspace.listTop).toBe(320);
});

it('waits for folder names before declaring that a browsed folder has no files', async () => {
  const {createMaterialWorkspace}=await import('./material-workspace');
  const workspace=createMaterialWorkspace();workspace.filters={...workspace.filters,share:'center',folder:'English'};
  let finishFolders!:(value:unknown)=>void;
  mocks.fetch.mockImplementation(async(path:string)=>{
    if(path.endsWith('/sources'))return {...sources,features:['folder_navigation']};
    if(path.endsWith('/folders'))return new Promise(resolve=>{finishFolders=resolve;});
    return page([]);
  });
  render(<SWRConfig value={{provider:()=>new Map()}}><MaterialSearch query="" scope="slow-folder" workspace={workspace}/></SWRConfig>);
  await screen.findByText('Loading folders…');
  await waitFor(()=>expect(screen.getByText('0 files')).toBeVisible());
  expect(screen.queryByText('No files directly in this folder.')).toBeNull();
  await act(async()=>finishFolders({share:'center',path:'English',folders:[{name:'DSE',path:'English/DSE',files:3}],next:null}));
  expect(await screen.findByRole('button',{name:'Open folder DSE'})).toBeVisible();
  expect(screen.getByText('No files directly in this folder.')).toBeVisible();
});

it('restores each parent folder position and its loaded file pages', async () => {
  const {createMaterialWorkspace}=await import('./material-workspace');
  const workspace=createMaterialWorkspace();workspace.filters={...workspace.filters,share:'center',folder:'English'};
  mocks.fetch.mockImplementation(async(path:string,options?:{body:string})=>{
    if(path.endsWith('/sources'))return {...sources,features:['folder_navigation']};
    const request=JSON.parse(options!.body);
    if(path.endsWith('/folders'))return {share:'center',path:request.folder,folders:request.folder==='English'?[{name:'DSE',path:'English/DSE',files:3}]:[],next:null};
    return request.page===2?page([3],3,2):page([1,2],3);
  });
  render(<SWRConfig value={{provider:()=>new Map()}}><MaterialSearch query="" scope="parent-place" workspace={workspace}/></SWRConfig>);
  fireEvent.click(await screen.findByRole('button',{name:'Load more courseware'}));
  await screen.findByRole('button',{name:/Worksheet 3/});
  const list=screen.getByLabelText('Courseware results');list.scrollTop=450;fireEvent.scroll(list);
  fireEvent.click(screen.getByRole('button',{name:'Open folder DSE'}));
  await screen.findByRole('button',{name:'DSE'});
  list.scrollTop=120;fireEvent.scroll(list);
  fireEvent.click(screen.getByRole('button',{name:'English'}));
  expect(await screen.findByRole('button',{name:/Worksheet 3/})).toBeVisible();
  expect(list.scrollTop).toBe(450);
  fireEvent.click(screen.getByRole('button',{name:'Open folder DSE'}));
  await screen.findByRole('button',{name:'DSE'});
  expect(list.scrollTop).toBe(120);
});

it('broadens folder search without clearing the query or other refinements', async () => {
  const {createMaterialWorkspace}=await import('./material-workspace');
  const workspace=createMaterialWorkspace();workspace.filters={...workspace.filters,share:'center',folder:'English/DSE',ext:'.pdf',exact_phrase:'quadratic equation',folder_scope:'current'};
  mocks.fetch.mockImplementation(async(path:string)=>path.endsWith('/sources')?{...sources,features:['folder_navigation','search_refinements']}:page([1]));
  render(<SWRConfig value={{provider:()=>new Map()}}><MaterialSearch query="algebra" scope="broaden-scope" workspace={workspace}/></SWRConfig>);
  await screen.findByRole('button',{name:/Worksheet 1/});
  fireEvent.click(screen.getByRole('button',{name:'Search all courseware'}));
  await waitFor(()=>{
    const request=JSON.parse(mocks.fetch.mock.calls.filter(call=>call[0].endsWith('/search')).at(-1)![1].body);
    expect(request).toMatchObject({q:'algebra',ext:'.pdf',refine:expect.objectContaining({exact_phrase:'quadratic equation'})});
    expect(request.share).toBeUndefined();expect(request.folder).toBeUndefined();
  });
  expect(screen.queryByRole('navigation',{name:'Courseware folder location'})).toBeNull();
  expect(screen.getByText('All courseware ·')).toBeVisible();
});

it('keeps navigation keys in the saved-search name editor and persists renaming', async () => {
  const {defaultMaterialFilters}=await import('./material-workspace');
  localStorage.setItem('courseware-saved-searches:rename-keys',JSON.stringify([
    {id:'one',name:'Fractions',query:'fractions',filters:defaultMaterialFilters()},
    {id:'two',name:'Geometry',query:'geometry',filters:defaultMaterialFilters()},
  ]));
  function Harness(){const [query,setQuery]=React.useState('');return <MaterialSearch query={query} scope="rename-keys" onQueryChange={setQuery}/>;}
  render(<SWRConfig value={{provider:()=>new Map()}}><Harness/></SWRConfig>);
  fireEvent.click(await screen.findByRole('button',{name:'Rename saved search Fractions'}));
  const input=screen.getByRole('textbox',{name:'Saved search name'});
  expect(fireEvent.keyDown(input,{key:'Home'})).toBe(true);
  expect(input).toHaveFocus();
  fireEvent.change(input,{target:{value:'F4 revision'}});
  fireEvent.click(screen.getByRole('button',{name:'Save search name'}));
  expect(await screen.findByRole('button',{name:'Run saved search F4 revision'})).toBeVisible();
  expect(JSON.parse(localStorage.getItem('courseware-saved-searches:rename-keys')!)[0].name).toBe('F4 revision');
});

it('shows early filenames and keeps an opened document when complete results arrive', async () => {
  let finish!:(value:unknown)=>void;
  mocks.fetch.mockImplementation(async(path:string)=>{
    if(path.endsWith('/sources'))return {...sources,features:['quick_filename_search','search_refinements']};
    if(path.endsWith('/quick'))return {...page([1]),eligible:true,results:[{...row(1),filename_match:true}]};
    if(path.includes('/preview'))return {file_id:1,chunks:[],truncated:false};
    return new Promise(resolve=>{finish=resolve;});
  });
  mount('algebra');
  const first=await screen.findByRole('button',{name:/Worksheet 1/});
  expect(screen.getByText('Searching page text…')).toBeVisible();
  expect(screen.queryByText('No courseware matches. Try fewer words or broaden the filters.')).toBeNull();
  expect(screen.queryByRole('button',{name:'Load more courseware'})).toBeNull();
  expect(JSON.parse(mocks.fetch.mock.calls.find(call=>call[0].endsWith('/search'))![1].body).filename_first).toBe(true);
  fireEvent.click(first);await screen.findByRole('region',{name:'Courseware preview'});
  await act(async()=>finish({...page([1,2]),results:[{...row(1),filename_match:true},row(2)]}));
  expect(screen.getByRole('region',{name:'Courseware preview'})).toBeVisible();
  expect(screen.getByRole('button',{name:/Worksheet 1/})).toHaveAttribute('aria-pressed','true');
  expect(screen.queryByText('Searching page text…')).toBeNull();
  expect(screen.getByRole('button',{name:/Worksheet 2/})).toBeVisible();
});

it('continues complete search when early filename assistance fails',async()=>{
  mocks.fetch.mockImplementation(async(path:string)=>{
    if(path.endsWith('/sources'))return {...sources,features:['quick_filename_search','search_refinements']};
    if(path.endsWith('/quick'))throw Error('Early service unavailable');
    return page([2]);
  });
  mount('algebra');expect(await screen.findByRole('button',{name:/Worksheet 2/})).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('offers explicit typo recovery after zero results and preserves its filters',async()=>{
  const {createMaterialWorkspace}=await import('./material-workspace');const workspace=createMaterialWorkspace();workspace.filters={...workspace.filters,share:'center',ext:'.pdf'};
  mocks.fetch.mockImplementation(async(path:string,options?:{body:string})=>{
    if(path.endsWith('/sources'))return {...sources,features:['search_suggestions','search_refinements']};
    if(path.endsWith('/suggestions'))return {suggestions:['quadratic']};
    return JSON.parse(options!.body).q==='qudratic'?page([]):page([1]);
  });
  function Harness(){const [query,setQuery]=React.useState('qudratic');return <><input aria-label="Test query" value={query} onChange={event=>setQuery(event.target.value)}/><MaterialSearch query={query} scope="typo-recovery" workspace={workspace} onQueryChange={setQuery}/></>;}
  render(<SWRConfig value={{provider:()=>new Map()}}><Harness/></SWRConfig>);
  const button=await screen.findByRole('button',{name:'quadratic',exact:true});
  expect(screen.getByLabelText('Test query')).toHaveValue('qudratic');
  fireEvent.click(button);await screen.findByRole('button',{name:/Worksheet 1/});
  expect(screen.getByLabelText('Test query')).toHaveValue('quadratic');
  expect(JSON.parse(mocks.fetch.mock.calls.filter(call=>call[0].endsWith('/search')).at(-1)![1].body)).toMatchObject({q:'quadratic',share:'center',ext:'.pdf'});
});

it('never requests corrections for an expression even when it finds no results',async()=>{
  mocks.fetch.mockImplementation(async(path:string)=>path.endsWith('/sources')?{...sources,features:['quick_filename_search','search_suggestions','search_refinements']}:page([]));
  mount('4x^2-y^2+10x-y');await screen.findByText('No courseware matches. Try fewer words or broaden the filters.');
  expect(mocks.fetch.mock.calls.some(call=>call[0].endsWith('/quick')||call[0].endsWith('/suggestions'))).toBe(false);
});


it('ignores a late early-filename response after the query changes', async()=>{
  let finishOld!:(value:unknown)=>void;
  let oldSignal!:AbortSignal;
  mocks.fetch.mockImplementation(async(path:string,options?:{body:string,signal:AbortSignal})=>{
    if(path.endsWith('/sources'))return {...sources,features:['quick_filename_search','search_refinements']};
    const request=JSON.parse(options!.body);
    if(path.endsWith('/quick')&&request.q==='old query'){
      oldSignal=options!.signal;
      return new Promise(resolve=>{finishOld=resolve;});
    }
    if(path.endsWith('/quick'))return {...page([7]),eligible:true};
    return request.q==='old query'?new Promise(()=>{}):page([7]);
  });
  const view=mount('old query');await waitFor(()=>expect(finishOld).toBeTypeOf('function'));
  view.change('new query');await screen.findByRole('button',{name:/Worksheet 7/});
  expect(oldSignal.aborted).toBe(true);
  await act(async()=>finishOld({...page([8]),eligible:true}));
  expect(screen.queryByRole('button',{name:/Worksheet 8/})).toBeNull();
});


it('keeps early filename results and their reader while retrying a failed text search',async()=>{
  let rejectFirst!:(error:Error)=>void,finishRetry!:(value:unknown)=>void;
  let attempts=0;
  mocks.fetch.mockImplementation(async(path:string)=>{
    if(path.endsWith('/sources'))return {...sources,features:['quick_filename_search','search_refinements']};
    if(path.endsWith('/quick'))return {...page([1]),eligible:true,results:[{...row(1),filename_match:true}]};
    if(path.includes('/preview'))return {file_id:1,chunks:[],truncated:false};
    attempts++;
    if(attempts===1)return new Promise((_resolve,reject)=>{rejectFirst=reject;});
    return new Promise(resolve=>{finishRetry=resolve;});
  });
  mount('algebra');fireEvent.click(await screen.findByRole('button',{name:/Worksheet 1/}));
  await screen.findByRole('region',{name:'Courseware preview'});
  await act(async()=>rejectFirst(Object.assign(new Error('Courseware search is temporarily unavailable.'),{status:503})));
  expect(screen.getByRole('button',{name:/Worksheet 1/})).toBeVisible();
  expect(screen.getByRole('region',{name:'Courseware preview'})).toBeVisible();
  expect(screen.queryByText('Searching page text…')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Retry search'}));
  await waitFor(()=>expect(attempts).toBe(2));
  expect(screen.getByRole('button',{name:'Retrying…'})).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Retrying page-text search');
  await act(async()=>finishRetry({...page([1,2]),results:[{...row(1),filename_match:true},row(2)]}));
  await screen.findByRole('button',{name:/Worksheet 2/});
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('region',{name:'Courseware preview'})).toBeVisible();
  expect(mocks.fetch.mock.calls.filter(call=>call[0].endsWith('/quick'))).toHaveLength(1);
});

it('makes a new request on every explicit retry and retains a repeated failure',async()=>{
  let attempts=0;
  mocks.fetch.mockImplementation(async(path:string)=>{
    if(path.endsWith('/sources'))return sources;
    attempts++;if(attempts<=2)throw Object.assign(new Error('Temporarily unavailable.'),{status:503});
    return page([1]);
  });
  mount('algebra');fireEvent.click(await screen.findByRole('button',{name:'Retry search'}));
  await waitFor(()=>expect(attempts).toBe(2));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Retry search'})).toBeEnabled());
  expect(screen.getByRole('alert')).toHaveTextContent('Temporarily unavailable.');
  fireEvent.click(screen.getByRole('button',{name:'Retry search'}));
  await screen.findByRole('button',{name:/Worksheet 1/});expect(attempts).toBe(3);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('does not retain early results when source permission is denied',async()=>{
  let fail!:(error:Error)=>void;
  mocks.fetch.mockImplementation(async(path:string)=>{
    if(path.endsWith('/sources'))return {...sources,features:['quick_filename_search','search_refinements']};
    if(path.endsWith('/quick'))return {...page([1]),eligible:true};
    return new Promise((_resolve,reject)=>{fail=reject;});
  });
  mount('algebra');await screen.findByRole('button',{name:/Worksheet 1/});
  await act(async()=>fail(Object.assign(new Error('Access denied.'),{status:403})));
  await screen.findByRole('alert');expect(screen.queryByRole('button',{name:/Worksheet 1/})).toBeNull();
});
