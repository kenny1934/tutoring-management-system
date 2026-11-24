"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { ArrowLeft, ArrowUp, ArrowDown, Copy, FileText, Filter, Clock, X } from "lucide-react";
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

type MaterialSearchProps = { query: string; scope: string; active?: boolean; canAssign?: boolean; workspace?: MaterialWorkspace; onQueryChange?: (query: string) => void };

export function MaterialSearch(props: MaterialSearchProps) {
  return <MaterialSearchWorkspace key={props.scope} {...props} />;
}

function MaterialSearchWorkspace({ query, scope, active = true, canAssign = false, workspace: saved, onQueryChange }: MaterialSearchProps) {
  const local = useRef(createMaterialWorkspace());
  const workspace = saved ?? local.current;
  const history = useCoursewareHistory(scope);
  const [term, setTerm] = useState(query.trim());
  const [filters, setFilters] = useState(() => workspace.filters);
  const [expanded, setExpanded] = useState(workspace.expanded);
  const [selection, setSelection] = useState(() => workspace.selection);
  const [notice, setNotice] = useState('');
  const [pageJump, setPageJump] = useState(0);
  const previewRef = useRef<HTMLElement>(null), listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const timer = setTimeout(() => setTerm(query.trim()), 300); return () => clearTimeout(timer); }, [query]);
  const sources = useSWR(active ? ["material-sources", scope] : null, () => fetchAPI<{ features?: string[]; sources: { id: string; label: string; coverage?: { files: number; limited_files: number } }[] }>("/materials/sources"), { revalidateOnFocus: false, shouldRetryOnError: false });
  const supportsFocusedPreview = sources.data?.features?.includes("focused_preview") ?? false;
  const key = JSON.stringify([scope, term, filters]);
  const ready = active && !!sources.data?.sources.length && term.length >= 2 && term.length <= 256 && term === query.trim();
  const pages = useSWRInfinite<SearchPage>(
    (index, previous) => !ready || (previous && previous.page * previous.page_size >= previous.total) ? null : ["material-search", key, index + 1],
    ([, , page]: [string, string, number]) => fetchAPI<SearchPage>("/materials/search", { method: 'POST', body: JSON.stringify({ q: term, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), page }) }),
    { revalidateOnFocus: false, shouldRetryOnError: false, persistSize: false, initialSize: workspace.searchKey === key ? workspace.size : 1 }
  );
  const { size: loadedPages, setSize } = pages;
  const visible = ready ? pages.data : undefined;
  const rows = [...new Map((visible ?? []).flatMap(page => page.results).map(row => [row.file_id, row])).values()];
  const selected = selection?.key === key && term === query.trim() ? rows.find(row => row.file_id === selection.id) : undefined;
  const readingKey = `${key}:${selected?.file_id}`;
  if (selected && workspace.reading?.key !== readingKey) workspace.reading = { key: readingKey, place: createMaterialReadingPlace() };
  const reading = selected ? workspace.reading!.place : undefined;
  useLayoutEffect(() => {
    if (workspace.searchKey !== key) {
      workspace.searchKey = key; workspace.listTop = 0; workspace.size = 1;
      if (loadedPages !== 1) void setSize(1);
      setSelection(null); workspace.selection = null;
    } else { workspace.size = loadedPages; workspace.selection = selection; }
    workspace.filters = filters; workspace.expanded = expanded;
    if (listRef.current) listRef.current.scrollTop = workspace.listTop;
  }, [workspace, key, filters, expanded, selection, loadedPages, setSize, visible]);
  const preview = useSWR(active && selected ? ["material-preview", scope, selected.file_id, term, supportsFocusedPreview ? reading?.focusPage ?? null : null] : null,
    () => fetchAPI<Preview>(`/materials/${selected!.file_id}/preview?q=${encodeURIComponent(term)}${supportsFocusedPreview && reading?.focusPage ? `&page=${reading.focusPage}` : ""}`), { revalidateOnFocus: false, shouldRetryOnError: false });
  const shownPreview = preview.data && !supportsFocusedPreview && reading?.focusPage ? {
    ...preview.data, chunks: preview.data.chunks.filter(chunk => chunk.page_start && chunk.page_start <= reading.focusPage! && reading.focusPage! <= (chunk.page_end ?? chunk.page_start)),
  } : preview.data;
  const focusedTextOmitted = reading?.focusPage && !supportsFocusedPreview && preview.data?.truncated && !shownPreview?.chunks.length;
  const labels = Object.fromEntries((sources.data?.sources ?? []).map(source => [source.id, source.label]));
  const limitedSources = (sources.data?.sources ?? []).some(source => (!filters.share || source.id === filters.share) && (source.coverage?.limited_files ?? 0) > 0);
  const first = visible?.[0], facets = first?.facets;
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
    setExpanded(!!(entry.filters.ext || entry.filters.modified || entry.filters.folder));
    onQueryChange?.(entry.query);
  };
  const update = (patch: Partial<typeof filters>) => { setFilters(value => ({ ...value, ...patch })); setNotice(''); listRef.current?.scrollTo?.(0, 0); };
  const choose = (row: MaterialResult) => { saveHistory({ query: term, filters }); setSelection({ key, id: row.file_id }); setNotice(''); requestAnimationFrame(() => previewRef.current?.focus()); };
  const back = () => { const id = selected?.file_id; setSelection(null); requestAnimationFrame(() => document.getElementById(`material-${id}`)?.focus()); };
  const copy = async (path: string) => { try { await navigator.clipboard.writeText(materialAliasPath(path)); setNotice('Path copied.'); } catch { setNotice('Copy failed. You can select and copy the path below.'); } };
  const open = async () => {
    if (!selected) return;
    setNotice('Opening original…');
    try {
      const [{ openFileFromPathWithFallback }, { searchPaperlessByPath }] = await Promise.all([import('@/lib/file-system'), import('@/lib/paperless-utils')]);
      const error = await openFileFromPathWithFallback(materialAliasPath(selected.nas_path), path => searchPaperlessByPath(path));
      setNotice(error ? 'The original could not be opened. Connect its folder in Settings or check whether it is available in Shelv.' : 'Original opened.');
    } catch { setNotice('The original could not be opened. The extracted text is still available here.'); }
  };
  return <section className={styles.root} aria-label="Courseware search" style={{ display: active ? undefined : "none" }}>
    <div className={styles.filters}>
      <div className={styles.bar}>
        <label>Source<select aria-label="Courseware source" value={filters.share} onChange={e => update({ share: e.target.value, folder: '' })}>
          <option value="">All sources</option>{sources.data?.sources.map(source => <option key={source.id} value={source.id}>{source.label}{facets?.share[source.id] !== undefined ? ` (${facets.share[source.id]})` : ''}</option>)}
        </select></label>
        <label>Sort<select aria-label="Courseware sort" value={filters.sort} onChange={e => update({ sort: e.target.value })}><option value="relevance">Relevance</option><option value="recent">Recently modified</option></select></label>
        <button aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><Filter size={14} />Filters{(filters.ext || filters.modified || filters.folder) && ' •'}</button>
      </div>
      {expanded && <div className={styles.bar}>
        <label>File type<select aria-label="Courseware file type" value={filters.ext} onChange={e => update({ ext: e.target.value })}><option value="">All types</option>{[...new Set(['.pdf', '.docx', '.xlsx', '.pptx', ...Object.keys(facets?.ext ?? {})])].sort().map(ext => <option key={ext} value={ext}>{ext.slice(1).toUpperCase()}{facets?.ext[ext] !== undefined ? ` (${facets.ext[ext]})` : ''}</option>)}</select></label>
        <label>Modified<select aria-label="Courseware modified date" value={filters.modified} onChange={e => update({ modified: e.target.value })}><option value="">Any time</option><option value="week">Past week</option><option value="month">Past month</option><option value="year">Past year</option><option value="older">Older</option></select></label>
        <label>Folder<select aria-label="Courseware folder" value={filters.folder} onChange={e => update({ folder: e.target.value })}><option value="">All folders</option>{[...new Set([...(filters.folder ? [filters.folder] : []), ...Object.keys(facets?.folder ?? {})])].map(folder => <option key={folder} value={folder}>{folder}{facets?.folder[folder] !== undefined ? ` (${facets.folder[folder]})` : ''}</option>)}</select></label>
        <button onClick={() => update({ share: '', ext: '', modified: '', folder: '', sort: 'relevance' })}>Reset filters</button>
      </div>}
    </div>
    <div className={styles.body}>
      <div ref={listRef} className={`${styles.list} ${selected ? styles.withSelection : ''}`} aria-label="Courseware results" onScroll={event => { workspace.listTop = event.currentTarget.scrollTop; }} onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-material-result]')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
        event.preventDefault(); buttons[next]?.focus();
      }}>
        {!query.trim() && !!history.entries.length && onQueryChange && <div role="group" aria-label="Recent courseware searches">
          <div className={styles.historyHeader}><span>Recent searches</span><button onClick={history.clear}>Clear history</button></div>
          {history.entries.map(entry => <div className={styles.historyRow} key={JSON.stringify(entry)}>
            <button data-material-result className={styles.result} onClick={() => recall(entry)} aria-label={`Search courseware for ${entry.query}`}><Clock size={16} /><span><strong>{entry.query}</strong><small>{[labels[entry.filters.share] ?? entry.filters.share, entry.filters.folder, entry.filters.ext.slice(1).toUpperCase(), ({ week: 'Past week', month: 'Past month', year: 'Past year', older: 'Older' } as Record<string, string>)[entry.filters.modified], entry.filters.sort === 'recent' ? 'Recently modified' : ''].filter(Boolean).join(' · ') || 'All sources'}</small></span></button>
            <IconButton label={`Remove courseware search ${entry.query}`} icon={X} size="sm" onClick={() => history.remove(entry)} />
          </div>)}
        </div>}
        {sources.isLoading && <p role="status">Connecting…</p>}
        {sources.error && <p role="alert">{sources.error.message} <button onClick={() => void sources.mutate()}>Retry connection</button></p>}
        {sources.data && !sources.data.sources.length && <p>Your Knowledge Base account has no courseware sources. Ask an administrator for access.</p>}
        {!!sources.data?.sources.length && !ready && !!query.trim() && <p>{query.trim().length > 256 ? 'Use a search of 256 characters or fewer.' : 'Enter at least two characters.'}</p>}
        {ready && pages.isLoading && <p role="status">Searching…</p>}
        {ready && pages.error && <p role="alert">{pages.error.message} <button onClick={() => void pages.mutate()}>Retry search</button></p>}
        {first && <p className={styles.count}>{first.total.toLocaleString()} {first.total === 1 ? 'result' : 'results'}</p>}
        {first?.total === 0 && <><p>No courseware matches. Try fewer words or broaden the filters.</p>{limitedSources && <p role="note">Some files in these sources have no searchable text or incomplete extraction. Their page contents may not appear in results.</p>}</>}
        {rows.map(row => <button key={row.file_id} id={`material-${row.file_id}`} data-material-result aria-pressed={selected?.file_id === row.file_id} className={styles.result} onClick={() => choose(row)}>
          <FileText size={16} /><span><strong>{row.filename}</strong><small>{labels[row.share] ?? row.share}{row.page_count ? ` · ${row.page_count} ${row.page_count === 1 ? 'page' : 'pages'}` : ''}{row.duplicate_count ? ` · ${row.duplicate_count} other copies` : ''}</small>
            <small className={styles.path}>{row.rel_path}</small><span className={styles.snippet}><MaterialHighlight text={row.snippet} ranges={row.highlights} /></span>
            {!!row.matched_pages.length && <small>Matches within pages: {row.matched_pages.slice(0, 8).join(', ')}{row.matched_pages.length > 8 ? '…' : ''}</small>}
          </span>
        </button>)}
        {first && (visible?.at(-1)?.page ?? 0) * first.page_size < first.total && <button className={styles.more} disabled={pages.isValidating} onClick={() => void pages.setSize(pages.size + 1)}>{pages.isValidating ? 'Loading…' : 'Load more courseware'}</button>}
      </div>
      {selected && <section ref={previewRef} tabIndex={-1} className={styles.preview} aria-label="Courseware preview" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); back(); } }}>
        <MaterialWorkControls key={`${scope}:${selected.file_id}:${pageJump}`} material={selected} scope={scope} canAssign={canAssign} reading={reading} previewPage={reading?.matchPage} pageNavigation={!!selected.matched_pages.length && <div className={styles.pageLinks} role="group" aria-label="Matching pages">
          <button aria-label="Show all matching text" aria-pressed={!reading?.focusPage} onClick={() => jumpToPage(null)}>All</button>
          {selected.matched_pages.map(page => <button key={page} aria-label={`Show matching page ${page}`} aria-pressed={reading?.focusPage === page} onClick={() => jumpToPage(page)}>p.{page}</button>)}
        </div>} heading={<>
        <div className={styles.previewTitle}><IconButton className={styles.previewBack} label="Back to courseware" icon={ArrowLeft} size="sm" onClick={back} /><h2 title={selected.filename}>{selected.filename}</h2></div>
        </>}>
        {notice && <p role="status">{notice}</p>}
        {!preview.data?.coverage && preview.data?.extraction_metadata?.needs_review && <p role="note">Some pages have uncertain OCR. Check the original before reusing the questions.</p>}
        {preview.isLoading && <p role="status">Loading extracted text…</p>}
        {preview.error && <p role="alert">The preview could not load. <button onClick={() => void preview.mutate()}>Retry preview</button></p>}
        {shownPreview && !shownPreview.chunks.length && <p>{focusedTextOmitted ? "This page is not included in this text preview. View the original PDF." : reading?.focusPage ? `No searchable text is available on page ${reading.focusPage}. Try the original PDF.` : 'No searchable text was extracted from this document.'}</p>}
        {shownPreview && <ExtractedText key={`${selected.file_id}:${term}:${reading?.focusPage ?? "all"}`} preview={shownPreview} reading={reading!} />}
        {preview.data?.truncated && <p>This text preview is shortened. Open the original for the full document.</p>}
        <details className={styles.fileDetails}><summary>File details</summary><p className={styles.path}>{materialAliasPath(selected.nas_path)}</p><div className={styles.actions}><button onClick={() => void copy(selected.nas_path)}><Copy size={14} />Copy path</button><button onClick={() => void open()}>Open in connected folder</button></div></details>
        {!!selected.duplicate_locations.length && <details><summary>Other copies</summary>{selected.duplicate_locations.map(copy => <p key={`${copy.share}:${copy.rel_path}`}>{labels[copy.share] ?? copy.share}: {copy.rel_path}</p>)}</details>}
        </MaterialWorkControls>
      </section>}
    </div>
  </section>;
}

function ExtractedText({ preview, reading }: { preview: Preview; reading: import("./material-workspace").MaterialReadingPlace }) {
  const root = useRef<HTMLDivElement>(null);
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
    if (scroll && container) container.scrollTo?.({ top: container.scrollTop + hits[next].getBoundingClientRect().top - container.getBoundingClientRect().top - 52, behavior: 'auto' });
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
  return <div ref={root}>
    <div className={styles.matchNavigation} role="group" aria-label="Text matches">
      <div className={styles.matchSummary}><span aria-live="polite">{count ? `${position + 1} of ${count} matches` : 'Extracted text'}</span>{preview.coverage && <MaterialCoverageStatus coverage={preview.coverage} />}</div>
      {count > 0 && <div><IconButton label="Previous text match" icon={ArrowUp} size="sm" onClick={() => jump(position - 1)} /><IconButton label="Next text match" icon={ArrowDown} size="sm" onClick={() => jump(position + 1)} /></div>}
    </div>
    {preview.chunks.map(chunk => <div key={chunk.chunk_index} className={styles.chunk} data-text-chunk data-page-start={chunk.page_start ?? undefined}>
      <h3>{chunk.page_start ? chunk.page_end && chunk.page_end !== chunk.page_start ? `Pages ${chunk.page_start}–${chunk.page_end}` : `Page ${chunk.page_start}` : 'Document text'}{preview.extraction_metadata?.pages.some(page => page.page === chunk.page_start && page.method === 'ocr') && ' · OCR'}</h3>
      <p><MathText text={chunk.content} renderMath={(formula, offset, length) => chunk.highlights.some(([start, end]) => start < offset + length && end > offset) ? <mark className={styles.mathMatch}>{formula}</mark> : formula} renderText={(value, offset) => <MaterialHighlight text={value} ranges={chunk.highlights.map(([start, end]) => [Math.max(0, start - offset), Math.min(Array.from(value).length, end - offset)]).filter(([start, end]) => end > start)} />} /></p>
    </div>)}
  </div>;
}
