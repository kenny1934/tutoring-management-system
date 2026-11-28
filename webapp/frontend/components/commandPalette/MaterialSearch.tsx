"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { createPortal } from "react-dom";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { SearchProgress } from "./SearchProgress";
import { MaterialRefinement } from './MaterialRefinement';
import { searchRefinement, coursewarePdfTerms, positiveSearch, refinementKeys, filterChips } from './material-refinements';
import { defaultMaterialFilters } from './material-workspace';
import { MaterialFolderPicker } from './MaterialFolderPicker';
import { coursewarePath, folderBrowse } from './material-paths';
import { MaterialBasket } from './MaterialBasket';
import { isCancelledSearchRequest, useAbortableRequest } from './useAbortableRequest';
import { ArrowLeft, ArrowUp, ArrowDown, Copy, FileText, Clock, X, CalendarPlus, FolderOpen, HardDrive, ChevronRight, Bookmark, Loader2 } from "lucide-react";
import { isPdfMath } from '@/lib/pdf-text-search';
import { fetchAPI } from "@/lib/api";
import { IconButton } from '@/components/controls';
import { MathText } from "@/components/ui/math-text";
import { MaterialWorkControls } from "./MaterialWorkControls";
import { createMaterialWorkspace, createMaterialReadingPlace, type MaterialWorkspace } from "./material-workspace";
import { useSavedCoursewareSearches, savedSearchIdentity } from './useSavedCoursewareSearches';
import { CoursewareSourceStatus, type CoursewareSource } from './CoursewareSourceStatus';
import { SavedCoursewareSearches } from './SavedCoursewareSearches';
import { useCoursewareHistory, type CoursewareHistoryEntry } from "./useCoursewareHistory";
import { MaterialCoverageStatus, type MaterialCoverage } from "./MaterialCoverage";
import styles from "./MaterialSearch.module.css";

export type MaterialResult = {
  file_id: number; share: string; filename: string; ext: string; rel_path: string; nas_path: string;
  page_count: number | null; matched_pages: number[]; snippet: string; highlights: number[][];
  filename_match?: boolean; duplicate_count: number; duplicate_locations: { share: string; rel_path: string; nas_path: string }[];
};
type SearchPage = { eligible?: boolean; total: number; page: number; page_size: number; results: MaterialResult[];
  facets: { share: Record<string, number>; ext: Record<string, number>; modified: Record<string, number>; folder: Record<string, number> } };
type Preview = { file_id: number; filename: string; page_count: number | null; truncated: boolean; coverage?: MaterialCoverage; focused_page?: number | null; extraction_metadata?: { needs_review: boolean; pages: { page: number; method: string; warnings: string[] }[] };
  chunks: { chunk_index: number; page_start: number | null; page_end: number | null; content: string; highlights: number[][] }[] };

/** Python offsets count Unicode code points, including characters outside the BMP. */
export function MaterialHighlight({ text, ranges }: { text: string; ranges: number[][] }) {
  const chars = Array.from(text), parts = []; let end = 0;
  for (const [start, stop] of ranges) {
    if (start < end || stop <= start || start < 0 || stop > chars.length) continue;
    parts.push(chars.slice(end, start).join(''), <mark key={`${start}:${stop}`}>{chars.slice(start, stop).join('')}</mark>); end = stop;
  }
  parts.push(chars.slice(end).join('')); return <>{parts}</>;
}

export function materialAliasPath(path: string) {
  return path.replace(/^\\\\[^\\]+\\([^\\]+)\\/, '[$1]\\');
}

export type CoursewareSelection = { path: string; pages: string; pageCount: number; title: string };

type MaterialSearchProps = { onPick?: (files: CoursewareSelection[]) => void; multiple?: boolean; emptyState?: ReactNode; onPreview?: (file: MaterialResult) => void; externalPreview?: boolean; onAssignResult?: (file: MaterialResult) => void; toolbarHost?: HTMLElement | null; query: string; scope: string; active?: boolean; prefetchSources?: boolean; canAssign?: boolean; workspace?: MaterialWorkspace; onQueryChange?: (query: string) => void };

export function MaterialSearch(props: MaterialSearchProps) {
  return <MaterialSearchWorkspace key={props.scope} {...props} />;
}

function MaterialSearchWorkspace({ query, scope, active = true, prefetchSources = false, canAssign = false, workspace: saved, onQueryChange, toolbarHost, onPick, multiple = true, emptyState, onPreview, externalPreview = false, onAssignResult }: MaterialSearchProps) {
  const mobile = useIsMobile(768);
  const local = useRef(createMaterialWorkspace());
  const workspace = saved ?? local.current;
  const history = useCoursewareHistory(scope);
  const savedSearches = useSavedCoursewareSearches(scope);
  const [term, setQuickTerm] = useState(query.trim());
  const [textTerm, setTextTerm] = useState(query.trim());
  const setTerm = useCallback((value: string) => { setQuickTerm(value); setTextTerm(value); }, []);
  const [filters, setFilters] = useState(() => workspace.filters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [editFilter, setEditFilter] = useState<keyof typeof filters>();
  const [choosingSource, setChoosingSource] = useState(false);
  const browseId = useId();
  const browseQuery = useRef(query), browseButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (choosingSource && query !== browseQuery.current) setChoosingSource(false); }, [query, choosingSource]);
  useEffect(() => { if (!active) setFilterOpen(false); }, [active]);
  const [selection, setSelection] = useState(() => workspace.selection);
  const [basket, setBasket] = useState(workspace.basket);
  const changeBasket = (entries: typeof basket) => { workspace.basket = entries; setBasket(entries); };
  const [notice, setNotice] = useState('');
  const [pageJump, setPageJump] = useState(0);
  const [readerExpanded, setReaderExpanded] = useState(false);
  const previewRef = useRef<HTMLElement>(null), listRef = useRef<HTMLDivElement>(null);
  const returnToFile = useRef<number | null>(null);
  useEffect(() => {
    if (!query.trim()) { setTerm(''); return; }
    const timer = setTimeout(() => setQuickTerm(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query, setTerm]);
  const sources = useSWR(active || prefetchSources ? ["material-sources", scope] : null, () => fetchAPI<{ features?: string[]; sources: CoursewareSource[] }>("/materials/sources"), { revalidateOnFocus: false, shouldRetryOnError: false, refreshInterval: active ? 60_000 : 0 });
  const supportsNavigation = sources.data?.features?.includes('folder_navigation') ?? false;
  const path = coursewarePath(term);
  const pathMode = !!coursewarePath(query);
  const pathReady = active && !choosingSource && !!path && pathMode && term === query.trim() && path.length <= 2048 && !!sources.data?.sources.length && supportsNavigation;
  const pathRequest = useAbortableRequest(JSON.stringify([scope, path]), pathReady);
  const resolved = useSWR<MaterialResult | { kind: 'folder'; share: string; folder: string }>(pathReady ? ['material-path', scope, path] : null,
    () => pathRequest(signal => fetchAPI<MaterialResult>('/materials/resolve', { method: 'POST', body: JSON.stringify({ path, allow_folder: true }), signal })),
    { keepPreviousData: false, revalidateOnFocus: false, shouldRetryOnError: false });
  const resolvedFile = resolved.data && !('kind' in resolved.data) ? resolved.data : undefined;
  const browsing = supportsNavigation && folderBrowse(query, filters);
  const supportsFocusedPreview = sources.data?.features?.includes("focused_preview") ?? false;
  const supportsRefinements = sources.data?.features?.includes("search_refinements") ?? false;
  const refine = searchRefinement(filters) ?? (supportsRefinements ? {} : undefined);
  const refineKey = JSON.stringify(refine ?? null);
  const requestFilters = Object.fromEntries(Object.entries(filters).filter(([key, value]) => value && (key !== 'folder_scope' || supportsNavigation) && !refinementKeys.includes(key as typeof refinementKeys[number])));
  const key = JSON.stringify([scope, term, filters]);
  const ready = active && !choosingSource && !!sources.data?.sources.length && !pathMode && (positiveSearch(term, filters) || browsing) && term.length <= 256 && term === query.trim() && (!refine || supportsRefinements);
  const quickEligible = !!sources.data?.features?.includes('quick_filename_search') && !browsing && !pathMode && filters.sort === 'relevance'
    && filters.search_in === 'both' && !filters.exclude_words.trim() && !isPdfMath(query);
  useEffect(() => {
    if (!query.trim()) return;
    // A fast filename lookup keeps feedback immediate while we avoid page
    // scans during brief mid-word pauses. Deliberate picks use setTerm.
    const timer = setTimeout(() => setTextTerm(query.trim()), quickEligible ? 650 : 300);
    return () => clearTimeout(timer);
  }, [query, quickEligible]);
  const quickRequest = useAbortableRequest(key, ready && quickEligible);
  const early = useSWR<SearchPage>(ready && quickEligible ? ['material-quick', key] : null,
    () => quickRequest(signal => fetchAPI<SearchPage>('/materials/quick', { method: 'POST', body: JSON.stringify({ q: term, ...requestFilters, ...(refine ? { refine } : {}) }), signal })),
    { revalidateOnFocus: false, shouldRetryOnError: false });
  const pageReady = ready && textTerm === query.trim();
  const searchRequest = useAbortableRequest(key, pageReady);
  const pages = useSWRInfinite<SearchPage>(
    (index, previous) => !pageReady || (previous && previous.page * previous.page_size >= previous.total) ? null : ["material-search", key, index + 1],
    ([, , page]: [string, string, number]) => searchRequest(signal => fetchAPI<SearchPage>("/materials/search", { method: 'POST', body: JSON.stringify({ q: term, ...requestFilters, ...(quickEligible ? { filename_first: true } : {}), ...(browsing ? { folder_scope: 'current' } : {}), ...(refine ? { refine } : {}), page }), signal })),
    { revalidateOnFocus: false, shouldRetryOnError: false, persistSize: false, revalidateFirstPage: false, initialSize: workspace.searchKey === key ? workspace.size : 1 }
  );
  const { size: loadedPages, setSize } = pages;
  const [retryingKey, setRetryingKey] = useState<string | null>(null);
  const retrying = retryingKey === key;
  const retrySearch = async () => {
    if (retrying || pages.isValidating) return;
    setRetryingKey(key);
    try { await pages.mutate(); }
    finally { setRetryingKey(current => current === key ? null : current); }
  };
  const searchErrorStatus = (pages.error as { status?: number } | undefined)?.status;
  const canKeepFilenames = typeof searchErrorStatus === 'number' && [408, 429, 500, 502, 503, 504].includes(searchErrorStatus)
    || pages.error instanceof TypeError;
  const earlyMode = ready && !pages.data?.[0] && (!pages.error || isCancelledSearchRequest(pages.error) || canKeepFilenames) && !!early.data?.eligible && !!early.data.results.length;
  const visible = useMemo<SearchPage[] | undefined>(() => pathReady && resolvedFile ? [{ total: 1, page: 1, page_size: 20, results: [resolvedFile], facets: { share: {}, ext: {}, folder: {}, modified: {} } }] : ready ? pages.data ?? (earlyMode ? [early.data!] : undefined) : undefined, [pathReady, resolvedFile, ready, pages.data, earlyMode, early.data]);
  const rows = [...new Map((visible ?? []).flatMap(page => page.results).map(row => [row.file_id, row])).values()];
  const selected = !choosingSource && selection?.key === key && term === query.trim() ? rows.find(row => row.file_id === selection.id) : undefined;
  useEffect(() => { if (!selected || !active) setReaderExpanded(false); }, [selected, active]);
  const expanded = !!selected && readerExpanded;
  const readingKey = `${key}:${selected?.file_id}`;
  if (selected && workspace.reading?.key !== readingKey) workspace.reading = { key: readingKey, place: createMaterialReadingPlace() };
  const reading = selected ? workspace.reading!.place : undefined;
  const wasBrowsing = useRef(false);
  useLayoutEffect(() => {
    if (workspace.searchKey !== key) {
      if (wasBrowsing.current && workspace.searchKey) {
        workspace.browsePlaces.delete(workspace.searchKey);
        workspace.browsePlaces.set(workspace.searchKey, { top: workspace.listTop, size: workspace.size });
        if (workspace.browsePlaces.size > 20) workspace.browsePlaces.delete(workspace.browsePlaces.keys().next().value!);
      }
      const place = browsing ? workspace.browsePlaces.get(key) : undefined;
      workspace.searchKey = key; workspace.listTop = place?.top ?? 0; workspace.size = place?.size ?? 1;
      if (loadedPages !== workspace.size) void setSize(workspace.size);
      setSelection(null); workspace.selection = null;
    } else { workspace.size = loadedPages; workspace.selection = selection; }
    wasBrowsing.current = supportsNavigation && folderBrowse(term, filters);
    workspace.filters = filters;
    if (listRef.current) listRef.current.scrollTop = choosingSource ? 0 : workspace.listTop;
  }, [workspace, key, filters, selection, loadedPages, setSize, visible, choosingSource, browsing, supportsNavigation, term]);
  useLayoutEffect(() => {
    if (selection || returnToFile.current === null) return;
    document.getElementById(`material-${returnToFile.current}`)?.focus({ preventScroll: true });
    returnToFile.current = null;
  }, [selection]);
  const previewTerm = pathMode ? '' : term;
  const previewRefine = pathMode ? undefined : refine;
  const previewRefineKey = pathMode ? 'null' : refineKey;
  const previewRequest = useAbortableRequest(JSON.stringify([scope, selected?.file_id, previewTerm, reading?.focusPage, previewRefineKey]), active && !!selected);
  const preview = useSWR(active && selected ? ["material-preview", scope, selected.file_id, previewTerm, supportsFocusedPreview ? reading?.focusPage ?? null : null, previewRefineKey] : null,
    () => previewRequest(signal => fetchAPI<Preview>(`/materials/${selected!.file_id}/preview?q=${encodeURIComponent(previewTerm)}${supportsFocusedPreview && reading?.focusPage ? `&page=${reading.focusPage}` : ""}${previewRefine ? `&refine=${encodeURIComponent(previewRefineKey)}` : ""}`, { signal })), { revalidateOnFocus: false, shouldRetryOnError: false });
  const shownPreview = preview.data && !supportsFocusedPreview && reading?.focusPage ? {
    ...preview.data, chunks: preview.data.chunks.filter(chunk => chunk.page_start && chunk.page_start <= reading.focusPage! && reading.focusPage! <= (chunk.page_end ?? chunk.page_start)),
  } : preview.data;
  const focusedTextOmitted = reading?.focusPage && !supportsFocusedPreview && preview.data?.truncated && !shownPreview?.chunks.length;
  const labels = Object.fromEntries((sources.data?.sources ?? []).map(source => [source.id, source.label]));
  const recentFolders = [...new Map(history.entries.filter(entry => entry.filters.folder && entry.filters.folder !== '/' && labels[entry.filters.share])
    .map(entry => [JSON.stringify([entry.filters.share, entry.filters.folder]), entry.filters])).values()].slice(0, 3);
  const visibleChips = filterChips(filters, labels).filter(chip =>
    !(supportsNavigation && filters.share && filters.folder && (chip.key === 'share' || chip.key === 'folder')) &&
    (chip.key !== 'share' || (!!toolbarHost && mobile)));
  const limitedSources = (sources.data?.sources ?? []).some(source => (!filters.share || source.id === filters.share) && (source.coverage?.limited_files ?? 0) > 0);
  const first = visible?.[0], facets = first?.facets;
  const pending = active && !sources.error && (sources.isLoading || (pathMode && (resolved.isLoading || term !== query.trim())) || (
    !!sources.data?.sources.length && !pathMode && (positiveSearch(query, filters) || browsing) && query.trim().length <= 256 && (!refine || supportsRefinements) &&
    (term !== query.trim() || textTerm !== query.trim() || (pageReady && (pages.isLoading || (pages.isValidating && pages.size === 1))))
  ));
  // A completed filename lookup can identify a likely typo while page-text
  // search continues. An incidental OCR hit must not suppress that assistance.
  const emptyFilenameLookup = quickEligible && early.data?.total === 0 && !early.isLoading && !early.error;
  const suggestReady = ready && (emptyFilenameLookup || (!pending && !pages.error && first?.total === 0)) && !browsing && !pathMode
    && filters.search_in !== 'content' && !!sources.data?.features?.includes('search_suggestions') && /^[a-zA-Z0-9 ]+$/.test(query) && !isPdfMath(query);
  const suggestRequest = useAbortableRequest(key, suggestReady);
  const suggested = useSWR<{ suggestions: string[] }>(suggestReady ? ['material-suggestions', key] : null,
    () => suggestRequest(signal => fetchAPI<{ suggestions: string[] }>('/materials/suggestions', { method: 'POST', body: JSON.stringify({ q: term, ...requestFilters, ...(refine ? { refine } : {}) }), signal })),
    { revalidateOnFocus: false, shouldRetryOnError: false });
  const jumpToPage = (page: number | null) => {
    if (!reading) return;
    reading.focusPage = page; reading.matchIndex = 0; reading.textTop = null; reading.matchPage = page;
    if (page !== null) { reading.pdfStartPage = page; reading.pdfViews.clear(); }
    setPageJump(value => value + 1);
  };
  const { save: saveHistory } = history;
  useEffect(() => {
    if (!active || !first || pages.error || !ready || pathMode || earlyMode) return;
    if (browsing) { saveHistory({ query: term, filters }); return; }
    // Avoid saving every intermediate query while the tutor types.
    const timer = setTimeout(() => saveHistory({ query: term, filters }), 1500);
    return () => clearTimeout(timer);
  }, [active, first, pages.error, ready, pathMode, browsing, term, filters, saveHistory, earlyMode]);
  const openedPath = useRef<string | null>(null);
  useEffect(() => { openedPath.current = null; }, [query]);
  useEffect(() => {
    if (!pathReady || !resolved.data || openedPath.current === path) return;
    openedPath.current = path;
    if ('kind' in resolved.data) {
      if (onQueryChange) {
        setSelection(null);
        setFilters({ ...defaultMaterialFilters(), share: resolved.data.share, folder: resolved.data.folder });
        workspace.reading = null;
        setTerm('');
        onQueryChange('');
      }
      return;
    }
    setSelection({ key, id: resolved.data.file_id });
    onPreview?.(resolved.data);
    saveHistory({ query: term, filters });
    // A deliberate Back keeps the resolved file in the list until a new lookup.
  }, [path, pathReady, resolved.data, key, onPreview, saveHistory, term, filters, onQueryChange, workspace, setTerm]);
  const recall = (entry: CoursewareHistoryEntry) => {
    setFilters(entry.filters); setSelection(null); workspace.reading = null; workspace.listTop = 0;
    setTerm(entry.query.trim());
    onQueryChange?.(entry.query);
  };
  const update = (patch: Partial<typeof filters>) => { setFilters(value => ({ ...value, ...patch })); setNotice(''); };
  const browseFolders = () => { browseQuery.current = query; setFilterOpen(false); setChoosingSource(true); };
  const closeBrowse = () => { setChoosingSource(false); browseButton.current?.focus({ preventScroll: true }); };
  const focusFolder = (path?: string) => requestAnimationFrame(() => {
    const child = path ? [...(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-folder-path]') ?? [])].find(button => button.dataset.folderPath === path) : undefined;
    (child ?? listRef.current?.querySelector<HTMLButtonElement>('[aria-current="location"]'))?.focus({ preventScroll: true });
  });
  const browseSource = (share: string, folder = '/') => {
    setSelection(null); workspace.reading = null;
    setFilters({ ...defaultMaterialFilters(), share, folder });
    setTerm('');
    onQueryChange?.(''); setChoosingSource(false);
    listRef.current?.scrollTo?.(0, 0);
    focusFolder();
  };
  const choose = (row: MaterialResult) => { onPreview?.(row); saveHistory({ query: term, filters }); setSelection({ key, id: row.file_id }); setNotice(''); requestAnimationFrame(() => previewRef.current?.focus({ preventScroll: true })); };
  const back = () => { returnToFile.current = selected?.file_id ?? null; setSelection(null); };
  const copy = async (path: string) => { try { await navigator.clipboard.writeText(materialAliasPath(path)); setNotice('Path copied.'); } catch { setNotice('Copy failed. You can select and copy the path below.'); } };
  const open = async () => {
    if (!selected) return;
    setNotice('Opening original…');
    try {
      const { openFileFromPathWithFallback } = await import('@/lib/file-system');
      const error = await openFileFromPathWithFallback(materialAliasPath(selected.nas_path));
      setNotice(error ? 'The original could not be opened. Connect its folder in Settings, or use View PDF to open it here.' : 'Original opened.');
    } catch { setNotice('The original could not be opened. The extracted text is still available here.'); }
  };
  const toolbarControls = (
      <div className={`${styles.toolbar} ${toolbarHost ? styles.hostedToolbar : ""}`}>
        {supportsNavigation && <button ref={browseButton} type="button" className={styles.browseTrigger} aria-label="Browse folders" aria-expanded={choosingSource}
          aria-controls={choosingSource ? browseId : undefined} onClick={choosingSource ? closeBrowse : browseFolders}><FolderOpen size={16} /><span>Browse</span></button>}
        {!choosingSource && !pathMode && <>
        <label><span className={styles.visuallyHidden}>Source</span><select aria-label="Courseware source" title={labels[filters.share] || 'All sources'} value={filters.share} onChange={event => update({ share: event.target.value, folder: '' })}>
          <option value="">All sources</option>{sources.data?.sources.map(source => <option key={source.id} value={source.id}>{source.label}{facets?.share[source.id] !== undefined ? ` (${facets.share[source.id]})` : ''}</option>)}
        </select></label>

        {active && <MaterialRefinement sources={sources.data?.sources} filters={filters} onApply={update} facets={facets} supportsRefinements={supportsRefinements} folderNavigation={supportsNavigation} scope={scope} isOpen={filterOpen} edit={editFilter} onOpenChange={open => { setFilterOpen(open); if (!open) setEditFilter(undefined); }} />}
        </>}
      </div>
  );
  const savedCurrent = savedSearches.entries.find(entry => savedSearchIdentity(entry) === savedSearchIdentity({ query: query.trim(), filters }));
  const saveSearchName = (query.trim() || filters.exact_phrase || filters.any_words || filters.folder.split('/').filter(Boolean).at(-1) || labels[filters.share] || 'Courseware').slice(0, 80);
  const textPageNavigation = selected && (!!selected.matched_pages.length && <label className={styles.textPages}>
          <span className={styles.visuallyHidden}>Matching text pages</span>
          <select aria-label="Matching text pages" value={reading?.focusPage ?? 'all'} onChange={event => jumpToPage(event.target.value === 'all' ? null : Number(event.target.value))}>
            <option value="all">All matching text</option>
            {selected.matched_pages.map(page => <option key={page} value={page}>Page {page}</option>)}
          </select>
        </label>);
  return <section className={`${styles.root} ${expanded ? styles.readerExpanded : ""}`} aria-label="Courseware search" data-courseware-detail={!!selected && !externalPreview || undefined} onKeyDown={event => { if (choosingSource && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeBrowse(); } }} style={{ display: active ? undefined : "none" }}>
    {active && toolbarHost && !expanded && createPortal(toolbarControls, toolbarHost)}
    <div className={styles.filters} hidden={expanded || (!!toolbarHost && (choosingSource || !visibleChips.length) && !(refine && sources.data && !supportsRefinements))}>
      {!toolbarHost && toolbarControls}
      {!choosingSource && !!visibleChips.length && <div className={styles.filterChips} role="group" aria-label="Applied courseware filters">{visibleChips.map(chip => <span key={chip.key} className={styles.appliedFilter}>
        <button title={chip.label} aria-label={`Edit ${chip.label}`} onClick={() => { setEditFilter(chip.key); setFilterOpen(true); }}><span>{chip.label}</span></button>
        <button aria-label={`Remove ${chip.label}`} onClick={() => update(chip.clear)}><X size={12} /></button>
      </span>)}</div>}
      {refine && sources.data && !supportsRefinements && <p role="alert">Search refinements are unavailable on this service. <button onClick={() => update(Object.fromEntries(refinementKeys.map(key => [key, defaultMaterialFilters()[key]])))}>Clear refinements</button></p>}
    </div>
    {!choosingSource && !expanded && (first || positiveSearch(query, filters) || browsing) && <div className={styles.resultTools}><span className={styles.count} aria-live="polite">{!earlyMode && !browsing && !pathMode && <span>{filters.share ? labels[filters.share] ?? filters.share : 'All courseware'}{first ? ' · ' : ''}</span>}{first ? `${first.total.toLocaleString()} ${earlyMode ? first.total === 1 ? 'filename match' : 'filename matches' : browsing ? first.total === 1 ? 'file' : 'files' : first.total === 1 ? 'result' : 'results'}` : ''}{earlyMode && <small className={styles.earlyStatus}>{pages.isValidating ? <><Loader2 size={12} aria-hidden />Searching page text…</> : 'Filename matches only'}</small>}</span>
      <div className={styles.resultActions}>
      {!pathMode && (positiveSearch(query, filters) || browsing) && <button type="button" className={styles.saveSearch} aria-label={savedCurrent ? 'Remove saved search' : 'Save search'} aria-pressed={!!savedCurrent} title={savedCurrent ? 'Remove saved search' : 'Save search'} onClick={() => savedCurrent ? savedSearches.remove(savedCurrent.id) : savedSearches.save({ query: query.trim(), filters }, saveSearchName)}><Bookmark size={16} fill={savedCurrent ? 'currentColor' : 'none'} /></button>}
      {!pathMode && <label><span className={styles.visuallyHidden}>Sort</span><select aria-label="Courseware sort" value={filters.sort} onChange={event => update({ sort: event.target.value })}><option value="relevance">{browsing ? 'Name' : 'Relevance'}</option><option value="recent">Recently modified</option></select></label>}
      </div>
    </div>}
    {savedSearches.error && <p className={styles.savedError} role="alert">{savedSearches.error}</p>}
    <div className={styles.body}>
      <div ref={listRef} hidden={expanded} className={`${styles.list} ${selected && !externalPreview ? styles.withSelection : ''}`} aria-label="Courseware results" onScroll={event => { if (!choosingSource && !expanded && !(mobile && selected && !externalPreview)) workspace.listTop = event.currentTarget.scrollTop; }} onKeyDown={event => {
        if (choosingSource && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeBrowse(); return; }
        if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-material-result]')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
        event.preventDefault(); buttons[next]?.focus();
      }}>
        {choosingSource ? <section id={browseId} className={styles.sourceChooser} aria-label="Courseware folders">
          <div className={styles.sourceHeading}><h2>Browse folders</h2><button type="button" onClick={closeBrowse} aria-label="Back to search"><ArrowLeft size={14} />Back</button></div>
          {sources.error && <p role="alert">Could not load sources. <button type="button" onClick={() => void sources.mutate()}>Retry</button></p>}
          {!sources.error && !sources.isLoading && !sources.data?.sources.length && <p>No courseware sources available.</p>}
          {sources.data?.sources.map(source => <button key={source.id} type="button" data-material-result className={styles.sourceRow} aria-label={`Browse ${source.label}`} onClick={() => browseSource(source.id)}>
            <HardDrive size={20} /><span>{source.label}<CoursewareSourceStatus freshness={source.freshness} indexedFiles={source.coverage?.files} /></span>{source.coverage && <small>{source.coverage.files.toLocaleString()} files</small>}<ChevronRight size={16} />
          </button>)}
          <SavedCoursewareSearches entries={savedSearches.entries} sources={labels} onRecall={entry => { recall(entry); setChoosingSource(false); }} onRename={savedSearches.rename} onRemove={savedSearches.remove} />
          {!!recentFolders.length && <><h3 className={styles.recentFoldersHeading}>Recent folders</h3>{recentFolders.map(folder => <button key={JSON.stringify([folder.share, folder.folder])} type="button" data-material-result
            className={styles.sourceRow} aria-label={`Browse recent folder ${labels[folder.share]} / ${folder.folder}`} onClick={() => browseSource(folder.share, folder.folder)}>
            <FolderOpen size={18} /><span>{folder.folder.split('/').at(-1)}<small className={styles.recentFolderPath}>{labels[folder.share]} / {folder.folder}</small></span><ChevronRight size={16} />
          </button>)}</>}
        </section> : <>
        {active && supportsNavigation && filters.share && filters.folder && !pathMode && <>
          <MaterialFolderPicker id="courseware-folder-contents" scope={scope} share={filters.share} sourceLabel={labels[filters.share] ?? filters.share}
            value={filters.folder} onChange={folder => {
              const prefix = folder === '/' ? '' : `${folder}/`;
              const child = filters.folder.startsWith(prefix) ? prefix + filters.folder.slice(prefix.length).split('/')[0] : undefined;
              setSelection(null); update({ folder }); focusFolder(child);
            }} contents={browsing} breadcrumbsOnly={!browsing} onSources={browseFolders} filesEmpty={browsing && !pending && !pages.error && first?.total === 0} />
          {!browsing && <div className={styles.scopeControls}><label className={styles.subfolderOption}><input type="checkbox" checked={filters.folder_scope !== 'current'}
            onChange={event => update({ folder_scope: event.target.checked ? 'subtree' : 'current' })} />Include subfolders</label><button type="button" onClick={() => update({ share: '', folder: '', folder_scope: 'subtree' })}>Search all courseware</button></div>}
        </>}
        {!positiveSearch(query, filters) && !browsing && !pathMode && onQueryChange && <SavedCoursewareSearches entries={savedSearches.entries} sources={labels} onRecall={recall} onRename={savedSearches.rename} onRemove={savedSearches.remove} />}
        {!positiveSearch(query, filters) && !browsing && !!history.entries.length && onQueryChange && <div role="group" aria-label="Recent courseware searches">
          <div className={styles.historyHeader}><span>Recent searches</span><button onClick={history.clear}>Clear history</button></div>
          {history.entries.map(entry => <div className={styles.historyRow} key={JSON.stringify(entry)}>
            <button data-material-result className={styles.result} onClick={() => recall(entry)} aria-label={`Search courseware for ${entry.query || entry.filters.exact_phrase || entry.filters.any_words || entry.filters.folder}`}><Clock size={16} /><span><strong>{entry.query || entry.filters.exact_phrase || entry.filters.any_words || entry.filters.folder}</strong><small>{filterChips(entry.filters, labels).map(chip => chip.label).concat(entry.filters.folder && entry.filters.folder_scope === 'current' ? ['Current folder only'] : []).concat(entry.filters.sort === 'recent' ? ['Recently modified'] : []).join(' · ') || 'All sources'}</small></span></button>
            <IconButton label={`Remove courseware search ${entry.query || entry.filters.exact_phrase || entry.filters.any_words || entry.filters.folder}`} icon={X} size="sm" onClick={() => history.remove(entry)} />
          </div>)}
        </div>}
        {suggestReady && !!suggested.data?.suggestions.length && onQueryChange && <div className={styles.suggestions} role="group" aria-label="Suggested searches"><span>Did you mean</span>{suggested.data.suggestions.map(value => <button key={value} type="button" onClick={() => { setSelection(null); setTerm(value); onQueryChange(value); }}>{value}</button>)}</div>}
        <SearchProgress busy={pending && !earlyMode} requestKey={JSON.stringify([scope, query.trim(), filters])} label={sources.isLoading ? "Connecting courseware…" : pathMode ? "Opening courseware…" : browsing ? "Loading courseware…" : "Searching courseware…"} placeholders={!first && positiveSearch(query, filters) ? pathMode ? 1 : 3 : 0} />
        {sources.error && <p role="alert">{sources.error.message} <button onClick={() => void sources.mutate()}>Retry connection</button></p>}
        {sources.data && !sources.data.sources.length && <p>Your Knowledge Base account has no courseware sources. Ask an administrator for access.</p>}
        {!!sources.data?.sources.length && !pathMode && !ready && (!!query.trim() || !!filters.any_words || !!filters.exact_phrase) && (!positiveSearch(query, filters) || query.trim().length > 256) && <p>{query.trim().length > 256 ? 'Use a search of 256 characters or fewer.' : 'Enter at least two characters.'}</p>}
        {pathMode && sources.data && !supportsNavigation && <p role="alert">Opening a file path is not available on this service yet.</p>}
        {pathMode && query.trim().length > 2048 && <p role="alert">Use a file path of 2,048 characters or fewer.</p>}
        {pathReady && resolved.error && !isCancelledSearchRequest(resolved.error) && <p role="alert">This file could not be opened. Check the path and your source access. <button onClick={() => void resolved.mutate()}>Retry opening</button></p>}
        {ready && pages.error && !isCancelledSearchRequest(pages.error) && <div role="alert" className={styles.searchFailure}>
          <span>{retrying ? earlyMode ? 'Retrying page-text search…' : 'Retrying search…' : earlyMode ? 'Page-text search could not finish. Filename matches are still available.' : pages.error.message}</span>
          <button type="button" disabled={retrying || pages.isValidating} onClick={() => void retrySearch()}>{retrying ? 'Retrying…' : 'Retry search'}</button>
        </div>}
        {first?.total === 0 && !pending && !pages.error && !browsing && <><p>No courseware matches. Try fewer words or broaden the filters.</p>{limitedSources && <p role="note">Some files in these sources have no searchable text or incomplete extraction. Their page contents may not appear in results.</p>}</>}
        {first?.total === 0 && !pending && !pages.error && !browsing && sources.data?.sources.some(source => source.freshness && (!filters.share || source.id === filters.share)) && <details className={styles.scanDetails}><summary>Source scans</summary>{sources.data.sources.filter(source => !filters.share || source.id === filters.share).map(source => <div key={source.id}><strong>{source.label}</strong><CoursewareSourceStatus freshness={source.freshness} indexedFiles={source.coverage?.files} /></div>)}</details>}
        {!positiveSearch(query, filters) && !browsing && emptyState}
        {rows.map(row => <div key={row.file_id} className={styles.resultRow}>{canAssign && multiple && row.ext === '.pdf' && <input type="checkbox" aria-label={`Select ${row.filename}`} checked={basket.some(entry => entry.material.file_id === row.file_id)} onChange={event => changeBasket(event.target.checked ? [...basket, { material: row, pages: row.page_count ? (row.page_count === 1 ? '1' : `1-${row.page_count}`) : '' }] : basket.filter(entry => entry.material.file_id !== row.file_id))} />}<button id={`material-${row.file_id}`} data-material-result aria-pressed={selected?.file_id === row.file_id} className={styles.result} onClick={() => choose(row)}>
          <FileText size={16} /><span><strong>{row.filename}</strong><small>{labels[row.share] ?? row.share}{row.page_count ? ` · ${row.page_count} ${row.page_count === 1 ? 'page' : 'pages'}` : ''}{row.duplicate_count ? ` · ${row.duplicate_count} other copies` : ''}</small>
            <small className={styles.path}>{row.rel_path}</small>{!row.filename_match && <span className={styles.snippet}><MaterialHighlight text={row.snippet} ranges={row.highlights} /></span>}
            {!row.filename_match && !!row.matched_pages.length && <small>Matches within pages: {row.matched_pages.slice(0, 8).join(', ')}{row.matched_pages.length > 8 ? '…' : ''}</small>}
          </span>
        </button>{canAssign && onAssignResult && row.ext === ".pdf" && <IconButton label={`Assign ${row.filename}`} icon={CalendarPlus} size="sm" onClick={() => onAssignResult(row)} />}</div>)}
        {!earlyMode && first && (visible?.at(-1)?.page ?? 0) * first.page_size < first.total && <button className={styles.more} disabled={pages.isValidating} onClick={() => void pages.setSize(pages.size + 1)}>{pages.isValidating ? 'Loading…' : 'Load more courseware'}</button>}
        </>}
      </div>
      {selected && !externalPreview && <section ref={previewRef} tabIndex={-1} className={styles.preview} aria-label="Courseware preview" onKeyDown={event => { if (event.currentTarget.contains(event.target as Node) && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); back(); } }}>
        <MaterialWorkControls key={`${scope}:${selected.file_id}:${pageJump}`} material={selected} onPick={onPick} searchTerms={coursewarePdfTerms(term, filters)} scope={scope} canAssign={canAssign} expanded={expanded} onExpandedChange={setReaderExpanded} onPageCount={count => changeBasket(basket.map(entry => entry.material.file_id === selected.file_id ? { ...entry, material: { ...entry.material, page_count: count } } : entry))} reading={reading} previewPage={reading?.matchPage} heading={<>
        <div className={styles.previewTitle}><IconButton className={styles.previewBack} label="Back to courseware" icon={ArrowLeft} size="sm" onClick={back} /><h2 title={selected.filename}>{selected.filename}</h2></div>
        </>}>
        {notice && <p role="status">{notice}</p>}
        {!preview.data?.coverage && preview.data?.extraction_metadata?.needs_review && <p role="note">Some pages have uncertain OCR. Check the original before reusing the questions.</p>}
        {preview.isLoading && <p role="status">Loading extracted text…</p>}
        {preview.error && !isCancelledSearchRequest(preview.error) && <p role="alert">The preview could not load. <button onClick={() => void preview.mutate()}>Retry preview</button></p>}
        {shownPreview && !shownPreview.chunks.length && <p>{focusedTextOmitted ? "This page is not included in this text preview. View the original PDF." : reading?.focusPage ? `No searchable text is available on page ${reading.focusPage}. Try the original PDF.` : 'No searchable text was extracted from this document.'}</p>}
        {shownPreview && <ExtractedText key={`${selected.file_id}:${term}:${reading?.focusPage ?? "all"}`} preview={shownPreview} reading={reading!} pageNavigation={textPageNavigation} />}
        {preview.data?.truncated && <p>This text preview is shortened. Open the original for the full document.</p>}
        <details className={styles.fileDetails}><summary>File details</summary><p className={styles.path}>{materialAliasPath(selected.nas_path)}</p><div className={styles.actions}><button onClick={() => void copy(selected.nas_path)}><Copy size={14} />Copy path</button><button onClick={() => void open()}>Open in connected folder</button></div></details>
        {!!selected.duplicate_locations.length && <details><summary>Other copies</summary>{selected.duplicate_locations.map(copy => <p key={`${copy.share}:${copy.rel_path}`}>{labels[copy.share] ?? copy.share}: {copy.rel_path}</p>)}</details>}
        </MaterialWorkControls>
      </section>}
    </div>
    {!expanded && canAssign && basket.length > 0 && <MaterialBasket entries={basket} onChange={changeBasket} onPick={onPick} />}
  </section>;
}

function ExtractedText({ preview, reading, pageNavigation }: { preview: Preview; reading: import("./material-workspace").MaterialReadingPlace; pageNavigation?: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const navigation = useRef<HTMLDivElement>(null);
  const targets = useRef<HTMLElement[]>([]);
  const [position, setPosition] = useState(0), [count, setCount] = useState(0);
  const jump = useCallback((index: number, scroll = true) => {
    const hits = targets.current;
    if (!hits.length) return;
    const next = (index + hits.length) % hits.length;
    hits.forEach((hit, i) => { if (i === next) hit.setAttribute('data-current-match', 'true'); else hit.removeAttribute('data-current-match'); });
    setPosition(next); reading.matchIndex = next;
    const page = Number(hits[next].closest<HTMLElement>('[data-text-chunk]')?.dataset.pageStart);
    reading.matchPage = reading.focusPage ?? (Number.isFinite(page) && page > 0 ? page : null);
    const container = root.current?.closest<HTMLElement>('[data-courseware-scroll]');
    if (scroll && container) {
      const hit = hits[next].getBoundingClientRect();
      const chunk = hits[next].closest<HTMLElement>('[data-text-chunk]')?.getBoundingClientRect();
      const anchor = chunk && hit.top - chunk.top < 120 ? chunk.top : hit.top;
      const clearance = (navigation.current?.getBoundingClientRect().height ?? 0) + 12;
      container.scrollTo?.({ top: container.scrollTop + anchor - container.getBoundingClientRect().top - clearance, behavior: 'auto' });
    }
  }, [reading]);
  useEffect(() => {
    targets.current = [...(root.current?.querySelectorAll<HTMLElement>('[data-text-chunk]') ?? [])].flatMap(chunk => {
      const marks = [...chunk.querySelectorAll<HTMLElement>('mark')];
      return marks;
    });
    setCount(targets.current.length); jump(reading.matchIndex, reading.textTop === null);
    const container = root.current?.closest<HTMLElement>('[data-courseware-scroll]');
    if (container && reading.textTop !== null) container.scrollTop = reading.textTop;
  }, [preview, jump, reading]);
  useEffect(() => {
    const bar = navigation.current;
    if (!bar || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const hit = targets.current[reading.matchIndex]?.getBoundingClientRect();
      const container = root.current?.closest<HTMLElement>('[data-courseware-scroll]');
      if (hit && container && hit.bottom > container.getBoundingClientRect().top && hit.top < bar.getBoundingClientRect().bottom + 12) jump(reading.matchIndex);
    });
    observer.observe(bar);
    return () => observer.disconnect();
  }, [jump, reading]);
  return <div ref={root}>
    <div ref={navigation} className={styles.matchNavigation} role="group" aria-label="Text matches">
      <div className={styles.matchSummary}><span aria-live="polite">{count ? `${position + 1} of ${count} matches` : 'Extracted text'}</span>{preview.coverage && <MaterialCoverageStatus coverage={preview.coverage} />}</div>
      {pageNavigation}
      {count > 0 && <div><IconButton label="Previous text match" icon={ArrowUp} size="sm" onClick={() => jump(position - 1)} /><IconButton label="Next text match" icon={ArrowDown} size="sm" onClick={() => jump(position + 1)} /></div>}
    </div>
    {preview.chunks.map(chunk => <div key={chunk.chunk_index} className={styles.chunk} data-text-chunk data-page-start={chunk.page_start ?? undefined}>
      <h3>{chunk.page_start ? chunk.page_end && chunk.page_end !== chunk.page_start ? `Pages ${chunk.page_start}–${chunk.page_end}` : `Page ${chunk.page_start}` : 'Document text'}{preview.extraction_metadata?.pages.some(page => page.page === chunk.page_start && page.method === 'ocr') && ' · OCR'}</h3>
      <p><MathText text={chunk.content} renderMath={(formula, offset, length) => chunk.highlights.some(([start, end]) => start < offset + length && end > offset) ? <mark className={styles.mathMatch}>{formula}</mark> : formula} renderText={(value, offset) => <MaterialHighlight text={value} ranges={chunk.highlights.map(([start, end]) => [Math.max(0, start - offset), Math.min(Array.from(value).length, end - offset)]).filter(([start, end]) => end > start)} />} /></p>
    </div>)}
  </div>;
}
