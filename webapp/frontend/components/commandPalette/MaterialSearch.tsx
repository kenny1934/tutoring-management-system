"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { createPortal } from "react-dom";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { SearchProgress } from "./SearchProgress";
import { MaterialRefinement } from './MaterialRefinement';
import { searchRefinement, coursewarePdfTerms, positiveSearch, refinementKeys, filterChips } from './material-refinements';
import { defaultMaterialFilters } from './material-workspace';
import { MaterialBasket } from './MaterialBasket';
import { useAbortableRequest } from './useAbortableRequest';
import { ArrowLeft, ArrowUp, ArrowDown, Copy, FileText, Clock, X, CalendarPlus } from "lucide-react";
import { fetchAPI } from "@/lib/api";
import { IconButton } from '@/components/controls';
import { MathText } from "@/components/ui/math-text";
import { MaterialWorkControls } from "./MaterialWorkControls";
import { createMaterialWorkspace, createMaterialReadingPlace, type MaterialWorkspace } from "./material-workspace";
import { useCoursewareHistory, type CoursewareHistoryEntry } from "./useCoursewareHistory";
import { MaterialCoverageStatus, type MaterialCoverage } from "./MaterialCoverage";
import styles from "./MaterialSearch.module.css";

export type MaterialResult = {
  file_id: number; share: string; filename: string; ext: string; rel_path: string; nas_path: string;
  page_count: number | null; matched_pages: number[]; snippet: string; highlights: number[][];
  duplicate_count: number; duplicate_locations: { share: string; rel_path: string; nas_path: string }[];
};
type SearchPage = { total: number; page: number; page_size: number; results: MaterialResult[];
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
  const [term, setTerm] = useState(query.trim());
  const [filters, setFilters] = useState(() => workspace.filters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [editFilter, setEditFilter] = useState<keyof typeof filters>();
  useEffect(() => { if (!active) setFilterOpen(false); }, [active]);
  const [selection, setSelection] = useState(() => workspace.selection);
  const [basket, setBasket] = useState(workspace.basket);
  const changeBasket = (entries: typeof basket) => { workspace.basket = entries; setBasket(entries); };
  const [notice, setNotice] = useState('');
  const [pageJump, setPageJump] = useState(0);
  const [readerExpanded, setReaderExpanded] = useState(false);
  const previewRef = useRef<HTMLElement>(null), listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const timer = setTimeout(() => setTerm(query.trim()), 300); return () => clearTimeout(timer); }, [query]);
  const sources = useSWR(active || prefetchSources ? ["material-sources", scope] : null, () => fetchAPI<{ features?: string[]; sources: { id: string; label: string; coverage?: { files: number; limited_files: number } }[] }>("/materials/sources"), { revalidateOnFocus: false, shouldRetryOnError: false });
  const supportsFocusedPreview = sources.data?.features?.includes("focused_preview") ?? false;
  const supportsRefinements = sources.data?.features?.includes("search_refinements") ?? false;
  const refine = searchRefinement(filters) ?? (supportsRefinements ? {} : undefined);
  const refineKey = JSON.stringify(refine ?? null);
  const requestFilters = Object.fromEntries(Object.entries(filters).filter(([key, value]) => value && !refinementKeys.includes(key as typeof refinementKeys[number])));
  const key = JSON.stringify([scope, term, filters]);
  const ready = active && !!sources.data?.sources.length && positiveSearch(term, filters) && term.length <= 256 && term === query.trim() && (!refine || supportsRefinements);
  const searchRequest = useAbortableRequest(key, ready);
  const pages = useSWRInfinite<SearchPage>(
    (index, previous) => !ready || (previous && previous.page * previous.page_size >= previous.total) ? null : ["material-search", key, index + 1],
    ([, , page]: [string, string, number]) => searchRequest(signal => fetchAPI<SearchPage>("/materials/search", { method: 'POST', body: JSON.stringify({ q: term, ...requestFilters, ...(refine ? { refine } : {}), page }), signal })),
    { revalidateOnFocus: false, shouldRetryOnError: false, persistSize: false, revalidateFirstPage: false, initialSize: workspace.searchKey === key ? workspace.size : 1 }
  );
  const { size: loadedPages, setSize } = pages;
  const visible = ready ? pages.data : undefined;
  const rows = [...new Map((visible ?? []).flatMap(page => page.results).map(row => [row.file_id, row])).values()];
  const selected = selection?.key === key && term === query.trim() ? rows.find(row => row.file_id === selection.id) : undefined;
  useEffect(() => { if (!selected || !active) setReaderExpanded(false); }, [selected, active]);
  const expanded = !!selected && readerExpanded;
  const readingKey = `${key}:${selected?.file_id}`;
  if (selected && workspace.reading?.key !== readingKey) workspace.reading = { key: readingKey, place: createMaterialReadingPlace() };
  const reading = selected ? workspace.reading!.place : undefined;
  useLayoutEffect(() => {
    if (workspace.searchKey !== key) {
      workspace.searchKey = key; workspace.listTop = 0; workspace.size = 1;
      if (loadedPages !== 1) void setSize(1);
      setSelection(null); workspace.selection = null;
    } else { workspace.size = loadedPages; workspace.selection = selection; }
    workspace.filters = filters;
    if (listRef.current) listRef.current.scrollTop = workspace.listTop;
  }, [workspace, key, filters, selection, loadedPages, setSize, visible]);
  const previewRequest = useAbortableRequest(JSON.stringify([scope, selected?.file_id, term, reading?.focusPage, refineKey]), active && !!selected);
  const preview = useSWR(active && selected ? ["material-preview", scope, selected.file_id, term, supportsFocusedPreview ? reading?.focusPage ?? null : null, refineKey] : null,
    () => previewRequest(signal => fetchAPI<Preview>(`/materials/${selected!.file_id}/preview?q=${encodeURIComponent(term)}${supportsFocusedPreview && reading?.focusPage ? `&page=${reading.focusPage}` : ""}${refine ? `&refine=${encodeURIComponent(refineKey)}` : ""}`, { signal })), { revalidateOnFocus: false, shouldRetryOnError: false });
  const shownPreview = preview.data && !supportsFocusedPreview && reading?.focusPage ? {
    ...preview.data, chunks: preview.data.chunks.filter(chunk => chunk.page_start && chunk.page_start <= reading.focusPage! && reading.focusPage! <= (chunk.page_end ?? chunk.page_start)),
  } : preview.data;
  const focusedTextOmitted = reading?.focusPage && !supportsFocusedPreview && preview.data?.truncated && !shownPreview?.chunks.length;
  const labels = Object.fromEntries((sources.data?.sources ?? []).map(source => [source.id, source.label]));
  const visibleChips = filterChips(filters, labels).filter(chip => chip.key !== 'share' || (!!toolbarHost && mobile));
  const limitedSources = (sources.data?.sources ?? []).some(source => (!filters.share || source.id === filters.share) && (source.coverage?.limited_files ?? 0) > 0);
  const first = visible?.[0], facets = first?.facets;
  const pending = active && !sources.error && (sources.isLoading || (
    !!sources.data?.sources.length && positiveSearch(query, filters) && query.trim().length <= 256 && (!refine || supportsRefinements) &&
    (term !== query.trim() || (ready && (pages.isLoading || (pages.isValidating && pages.size === 1))))
  ));
  const jumpToPage = (page: number | null) => {
    if (!reading) return;
    reading.focusPage = page; reading.matchIndex = 0; reading.textTop = null; reading.matchPage = page;
    if (page !== null) { reading.pdfStartPage = page; reading.pdfViews.clear(); }
    setPageJump(value => value + 1);
  };
  const { save: saveHistory } = history;
  useEffect(() => {
    if (!active || !first || pages.error || !ready) return;
    // Avoid saving every intermediate query while the tutor types.
    const timer = setTimeout(() => saveHistory({ query: term, filters }), 1500);
    return () => clearTimeout(timer);
  }, [active, first, pages.error, ready, term, filters, saveHistory]);
  const recall = (entry: CoursewareHistoryEntry) => {
    setFilters(entry.filters); setSelection(null); workspace.reading = null; workspace.listTop = 0;
    onQueryChange?.(entry.query);
  };
  const update = (patch: Partial<typeof filters>) => { setFilters(value => ({ ...value, ...patch })); setNotice(''); listRef.current?.scrollTo?.(0, 0); };
  const choose = (row: MaterialResult) => { onPreview?.(row); saveHistory({ query: term, filters }); setSelection({ key, id: row.file_id }); setNotice(''); requestAnimationFrame(() => previewRef.current?.focus()); };
  const back = () => { const id = selected?.file_id; setSelection(null); requestAnimationFrame(() => document.getElementById(`material-${id}`)?.focus()); };
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
        <label><span className={styles.visuallyHidden}>Source</span><select aria-label="Courseware source" title={labels[filters.share] || 'All sources'} value={filters.share} onChange={event => update({ share: event.target.value, folder: '' })}>
          <option value="">All sources</option>{sources.data?.sources.map(source => <option key={source.id} value={source.id}>{source.label}{facets?.share[source.id] !== undefined ? ` (${facets.share[source.id]})` : ''}</option>)}
        </select></label>

        {active && <MaterialRefinement sources={sources.data?.sources} filters={filters} onApply={update} facets={facets} supportsRefinements={supportsRefinements} isOpen={filterOpen} edit={editFilter} onOpenChange={open => { setFilterOpen(open); if (!open) setEditFilter(undefined); }} />}
      </div>
  );
  const textPageNavigation = selected && (!!selected.matched_pages.length && <label className={styles.textPages}>
          <span className={styles.visuallyHidden}>Matching text pages</span>
          <select aria-label="Matching text pages" value={reading?.focusPage ?? 'all'} onChange={event => jumpToPage(event.target.value === 'all' ? null : Number(event.target.value))}>
            <option value="all">All matching text</option>
            {selected.matched_pages.map(page => <option key={page} value={page}>Page {page}</option>)}
          </select>
        </label>);
  return <section className={`${styles.root} ${expanded ? styles.readerExpanded : ""}`} aria-label="Courseware search" data-courseware-detail={!!selected && !externalPreview || undefined} style={{ display: active ? undefined : "none" }}>
    {active && toolbarHost && !expanded && createPortal(toolbarControls, toolbarHost)}
    <div className={styles.filters} hidden={expanded || (!!toolbarHost && !visibleChips.length && !(refine && sources.data && !supportsRefinements))}>
      {!toolbarHost && toolbarControls}
      {!!visibleChips.length && <div className={styles.filterChips} role="group" aria-label="Applied courseware filters">{visibleChips.map(chip => <span key={chip.key} className={styles.appliedFilter}>
        <button title={chip.label} aria-label={`Edit ${chip.label}`} onClick={() => { setEditFilter(chip.key); setFilterOpen(true); }}><span>{chip.label}</span></button>
        <button aria-label={`Remove ${chip.label}`} onClick={() => update(chip.clear)}><X size={12} /></button>
      </span>)}</div>}
      {refine && sources.data && !supportsRefinements && <p role="alert">Search refinements are unavailable on this service. <button onClick={() => update(Object.fromEntries(refinementKeys.map(key => [key, defaultMaterialFilters()[key]])))}>Clear refinements</button></p>}
    </div>
    {!expanded && (first || positiveSearch(query, filters)) && <div className={styles.resultTools}><span className={styles.count} aria-live="polite">{first ? `${first.total.toLocaleString()} ${first.total === 1 ? 'result' : 'results'}` : ''}</span>
      <label><span className={styles.visuallyHidden}>Sort</span><select aria-label="Courseware sort" value={filters.sort} onChange={event => update({ sort: event.target.value })}><option value="relevance">Relevance</option><option value="recent">Recently modified</option></select></label>
    </div>}
    <div className={styles.body}>
      <div ref={listRef} hidden={expanded} className={`${styles.list} ${selected && !externalPreview ? styles.withSelection : ''}`} aria-label="Courseware results" onScroll={event => { workspace.listTop = event.currentTarget.scrollTop; }} onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-material-result]')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
        event.preventDefault(); buttons[next]?.focus();
      }}>
        {!positiveSearch(query, filters) && !!history.entries.length && onQueryChange && <div role="group" aria-label="Recent courseware searches">
          <div className={styles.historyHeader}><span>Recent searches</span><button onClick={history.clear}>Clear history</button></div>
          {history.entries.map(entry => <div className={styles.historyRow} key={JSON.stringify(entry)}>
            <button data-material-result className={styles.result} onClick={() => recall(entry)} aria-label={`Search courseware for ${entry.query || entry.filters.exact_phrase || entry.filters.any_words}`}><Clock size={16} /><span><strong>{entry.query || entry.filters.exact_phrase || entry.filters.any_words}</strong><small>{filterChips(entry.filters, labels).map(chip => chip.label).concat(entry.filters.sort === 'recent' ? ['Recently modified'] : []).join(' · ') || 'All sources'}</small></span></button>
            <IconButton label={`Remove courseware search ${entry.query || entry.filters.exact_phrase || entry.filters.any_words}`} icon={X} size="sm" onClick={() => history.remove(entry)} />
          </div>)}
        </div>}
        <SearchProgress busy={pending} requestKey={JSON.stringify([scope, query.trim(), filters])} label={sources.isLoading ? "Connecting courseware…" : "Searching courseware…"} placeholders={!first && positiveSearch(query, filters) ? 3 : 0} />
        {sources.error && <p role="alert">{sources.error.message} <button onClick={() => void sources.mutate()}>Retry connection</button></p>}
        {sources.data && !sources.data.sources.length && <p>Your Knowledge Base account has no courseware sources. Ask an administrator for access.</p>}
        {!!sources.data?.sources.length && !ready && (!!query.trim() || !!filters.any_words || !!filters.exact_phrase) && (!positiveSearch(query, filters) || query.trim().length > 256) && <p>{query.trim().length > 256 ? 'Use a search of 256 characters or fewer.' : 'Enter at least two characters.'}</p>}
        {ready && pages.error && <p role="alert">{pages.error.message} <button onClick={() => void pages.mutate()}>Retry search</button></p>}
        {first?.total === 0 && <><p>No courseware matches. Try fewer words or broaden the filters.</p>{limitedSources && <p role="note">Some files in these sources have no searchable text or incomplete extraction. Their page contents may not appear in results.</p>}</>}
        {!positiveSearch(query, filters) && emptyState}
        {rows.map(row => <div key={row.file_id} className={styles.resultRow}>{canAssign && multiple && row.ext === '.pdf' && <input type="checkbox" aria-label={`Select ${row.filename}`} checked={basket.some(entry => entry.material.file_id === row.file_id)} onChange={event => changeBasket(event.target.checked ? [...basket, { material: row, pages: row.page_count ? (row.page_count === 1 ? '1' : `1-${row.page_count}`) : '' }] : basket.filter(entry => entry.material.file_id !== row.file_id))} />}<button id={`material-${row.file_id}`} data-material-result aria-pressed={selected?.file_id === row.file_id} className={styles.result} onClick={() => choose(row)}>
          <FileText size={16} /><span><strong>{row.filename}</strong><small>{labels[row.share] ?? row.share}{row.page_count ? ` · ${row.page_count} ${row.page_count === 1 ? 'page' : 'pages'}` : ''}{row.duplicate_count ? ` · ${row.duplicate_count} other copies` : ''}</small>
            <small className={styles.path}>{row.rel_path}</small><span className={styles.snippet}><MaterialHighlight text={row.snippet} ranges={row.highlights} /></span>
            {!!row.matched_pages.length && <small>Matches within pages: {row.matched_pages.slice(0, 8).join(', ')}{row.matched_pages.length > 8 ? '…' : ''}</small>}
          </span>
        </button>{canAssign && onAssignResult && row.ext === ".pdf" && <IconButton label={`Assign ${row.filename}`} icon={CalendarPlus} size="sm" onClick={() => onAssignResult(row)} />}</div>)}
        {first && (visible?.at(-1)?.page ?? 0) * first.page_size < first.total && <button className={styles.more} disabled={pages.isValidating} onClick={() => void pages.setSize(pages.size + 1)}>{pages.isValidating ? 'Loading…' : 'Load more courseware'}</button>}
      </div>
      {selected && !externalPreview && <section ref={previewRef} tabIndex={-1} className={styles.preview} aria-label="Courseware preview" onKeyDown={event => { if (event.currentTarget.contains(event.target as Node) && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); back(); } }}>
        <MaterialWorkControls key={`${scope}:${selected.file_id}:${pageJump}`} material={selected} onPick={onPick} searchTerms={coursewarePdfTerms(term, filters)} scope={scope} canAssign={canAssign} expanded={expanded} onExpandedChange={setReaderExpanded} onPageCount={count => changeBasket(basket.map(entry => entry.material.file_id === selected.file_id ? { ...entry, material: { ...entry.material, page_count: count } } : entry))} reading={reading} previewPage={reading?.matchPage} heading={<>
        <div className={styles.previewTitle}><IconButton className={styles.previewBack} label="Back to courseware" icon={ArrowLeft} size="sm" onClick={back} /><h2 title={selected.filename}>{selected.filename}</h2></div>
        </>}>
        {notice && <p role="status">{notice}</p>}
        {!preview.data?.coverage && preview.data?.extraction_metadata?.needs_review && <p role="note">Some pages have uncertain OCR. Check the original before reusing the questions.</p>}
        {preview.isLoading && <p role="status">Loading extracted text…</p>}
        {preview.error && <p role="alert">The preview could not load. <button onClick={() => void preview.mutate()}>Retry preview</button></p>}
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
