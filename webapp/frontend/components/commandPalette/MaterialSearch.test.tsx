import * as React from 'react';
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
    expect(within(preview).getByRole('group', { name: 'Matching pages' })).toBeInTheDocument();
    expect(within(preview).getByRole('button', { name: 'Show matching page 2' })).toBeVisible();
    fireEvent.keyDown(preview, { key: 'Escape' });
    await waitFor(() => expect(result).toHaveFocus());
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
  await screen.findByText('Page 1');
  fireEvent.click(screen.getByRole('button', { name: 'Show matching page 16' }));
  await screen.findByText('Page 16');
  expect(mocks.fetch).toHaveBeenCalledWith('/materials/1/preview?q=fractions&page=16', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(screen.getByRole('button', { name: 'Show matching page 16' })).toHaveAttribute('aria-pressed', 'true');
  expect(document.querySelector('[data-current-match]')).toHaveTextContent('fractions');
  expect(document.querySelector('[data-text-chunk]')).toHaveTextContent(later);
  fireEvent.click(screen.getByRole('button', { name: 'Show all matching text' }));
  await screen.findByText('Page 1');
  expect(screen.getByRole('button', { name: 'Show all matching text' })).toHaveAttribute('aria-pressed', 'true');
});

it('can jump within an existing preview when the provider has not deployed focused-page support', async () => {
  mocks.fetch.mockImplementation(async (path: string) => path.endsWith('/sources') ? sources : path.includes('/preview') ? {
    file_id: 1, chunks: [1, 16].map((number, index) => ({ chunk_index: index, page_start: number, page_end: number, content: 'fractions', highlights: [[0, 9]] })), truncated: false,
  } : { ...page([1]), results: [{ ...row(1), page_count: 34, matched_pages: [1, 16] }] });
  mount(); fireEvent.click(await screen.findByRole('button', { name: /Worksheet 1/ }));
  await screen.findByText('Page 1');
  fireEvent.click(screen.getByRole('button', { name: 'Show matching page 16' }));
  await screen.findByText('Page 16');
  expect(screen.queryByText('Page 1')).toBeNull();
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
