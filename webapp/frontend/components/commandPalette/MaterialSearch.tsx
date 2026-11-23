"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";
import { ArrowLeft, Copy, FileText, Filter } from "lucide-react";
import { fetchAPI } from "@/lib/api";
import { MaterialWorkControls } from "./MaterialWorkControls";
import styles from "./MaterialSearch.module.css";

export type MaterialResult = {
  file_id: number; share: string; filename: string; ext: string; rel_path: string; nas_path: string;
  page_count: number | null; matched_pages: number[]; snippet: string; highlights: number[][];
  duplicate_count: number; duplicate_locations: { share: string; rel_path: string; nas_path: string }[];
};
type SearchPage = { total: number; page: number; page_size: number; results: MaterialResult[];
  facets: { share: Record<string, number>; ext: Record<string, number>; modified: Record<string, number>; folder: Record<string, number> } };
type Preview = { file_id: number; filename: string; page_count: number | null; truncated: boolean; extraction_metadata?: { needs_review: boolean; pages: { page: number; method: string; warnings: string[] }[] };
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

export function MaterialSearch({ query, scope, active = true, canAssign = false }: { query: string; scope: string; active?: boolean; canAssign?: boolean }) {
  const [term, setTerm] = useState(query.trim());
  const [filters, setFilters] = useState({ share: '', ext: '', modified: '', folder: '', sort: 'relevance' });
  const [expanded, setExpanded] = useState(false);
  const [selection, setSelection] = useState<{ key: string; row: MaterialResult } | null>(null);
  const [notice, setNotice] = useState('');
  const previewRef = useRef<HTMLElement>(null), listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const timer = setTimeout(() => setTerm(query.trim()), 300); return () => clearTimeout(timer); }, [query]);
  const sources = useSWR(active ? ["material-sources", scope] : null, () => fetchAPI<{ sources: { id: string; label: string }[] }>("/materials/sources"), { revalidateOnFocus: false, shouldRetryOnError: false });
  const key = JSON.stringify([scope, term, filters]);
  const ready = active && !!sources.data?.sources.length && term.length >= 2 && term.length <= 256 && term === query.trim();
  const pages = useSWRInfinite<SearchPage>(
    (index, previous) => !ready || (previous && previous.page * previous.page_size >= previous.total) ? null : ["material-search", key, index + 1],
    ([, , page]: [string, string, number]) => fetchAPI<SearchPage>("/materials/search", { method: 'POST', body: JSON.stringify({ q: term, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), page }) }),
    { revalidateOnFocus: false, shouldRetryOnError: false, persistSize: false }
  );
  const visible = ready ? pages.data : undefined;
  const rows = [...new Map((visible ?? []).flatMap(page => page.results).map(row => [row.file_id, row])).values()];
  const selected = selection?.key === key && term === query.trim() ? selection.row : null;
  const preview = useSWR(active && selected ? ["material-preview", scope, selected.file_id, term] : null,
    () => fetchAPI<Preview>(`/materials/${selected!.file_id}/preview?q=${encodeURIComponent(term)}`), { revalidateOnFocus: false, shouldRetryOnError: false });
  const labels = Object.fromEntries((sources.data?.sources ?? []).map(source => [source.id, source.label]));
  const first = visible?.[0], facets = first?.facets;
  const update = (patch: Partial<typeof filters>) => { setFilters(value => ({ ...value, ...patch })); setNotice(''); listRef.current?.scrollTo?.(0, 0); };
  const choose = (row: MaterialResult) => { setSelection({ key, row }); setNotice(''); requestAnimationFrame(() => previewRef.current?.focus()); };
  const back = () => { const id = selected?.file_id; setSelection(null); requestAnimationFrame(() => document.getElementById(`material-${id}`)?.focus()); };
  const copy = async (path: string) => { try { await navigator.clipboard.writeText(materialAliasPath(path)); setNotice('Material path copied.'); } catch { setNotice('Copy failed. You can select and copy the path below.'); } };
  const open = async () => {
    if (!selected) return;
    setNotice('Opening original…');
    try {
      const [{ openFileFromPathWithFallback }, { searchPaperlessByPath }] = await Promise.all([import('@/lib/file-system'), import('@/lib/paperless-utils')]);
      const error = await openFileFromPathWithFallback(materialAliasPath(selected.nas_path), path => searchPaperlessByPath(path));
      setNotice(error ? 'The original could not be opened. Connect its folder in Settings or check whether it is available in Shelv.' : 'Original opened.');
    } catch { setNotice('The original could not be opened. The extracted text is still available here.'); }
  };
  return <section className={styles.root} aria-label="Material search" style={{ display: active ? undefined : "none" }}>
    <div className={styles.filters}>
      <div className={styles.bar}>
        <label>Source<select aria-label="Material source" value={filters.share} onChange={e => update({ share: e.target.value, folder: '' })}>
          <option value="">All material sources</option>{sources.data?.sources.map(source => <option key={source.id} value={source.id}>{source.label}{facets?.share[source.id] !== undefined ? ` (${facets.share[source.id]})` : ''}</option>)}
        </select></label>
        <label>Sort<select aria-label="Material sort" value={filters.sort} onChange={e => update({ sort: e.target.value })}><option value="relevance">Relevance</option><option value="recent">Recently modified</option></select></label>
        <button aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><Filter size={14} />Filters{(filters.ext || filters.modified || filters.folder) && ' •'}</button>
      </div>
      {expanded && <div className={styles.bar}>
        <label>File type<select aria-label="Material file type" value={filters.ext} onChange={e => update({ ext: e.target.value })}><option value="">All types</option>{[...new Set(['.pdf', '.docx', '.xlsx', '.pptx', ...Object.keys(facets?.ext ?? {})])].sort().map(ext => <option key={ext} value={ext}>{ext.slice(1).toUpperCase()}{facets?.ext[ext] !== undefined ? ` (${facets.ext[ext]})` : ''}</option>)}</select></label>
        <label>Modified<select aria-label="Material modified date" value={filters.modified} onChange={e => update({ modified: e.target.value })}><option value="">Any time</option><option value="week">Past week</option><option value="month">Past month</option><option value="year">Past year</option><option value="older">Older</option></select></label>
        <label>Folder<select aria-label="Material folder" value={filters.folder} onChange={e => update({ folder: e.target.value })}><option value="">All folders</option>{[...new Set([...(filters.folder ? [filters.folder] : []), ...Object.keys(facets?.folder ?? {})])].map(folder => <option key={folder} value={folder}>{folder}{facets?.folder[folder] !== undefined ? ` (${facets.folder[folder]})` : ''}</option>)}</select></label>
        <button onClick={() => update({ share: '', ext: '', modified: '', folder: '', sort: 'relevance' })}>Reset filters</button>
      </div>}
    </div>
    <div className={styles.body}>
      <div ref={listRef} className={`${styles.list} ${selected ? styles.withSelection : ''}`} aria-label="Material results" onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-material-result]')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
        event.preventDefault(); buttons[next]?.focus();
      }}>
        {sources.isLoading && <p role="status">Connecting to materials…</p>}
        {sources.error && <p role="alert">{sources.error.message} <button onClick={() => void sources.mutate()}>Retry connection</button></p>}
        {sources.data && !sources.data.sources.length && <p>Your Knowledge Base account has no material sources. Ask an administrator for access.</p>}
        {!!sources.data?.sources.length && !ready && <p>{query.trim().length > 256 ? 'Use a search of 256 characters or fewer.' : 'Search worksheet names or words inside documents (at least two characters).'}</p>}
        {ready && pages.isLoading && <p role="status">Searching materials…</p>}
        {ready && pages.error && <p role="alert">{pages.error.message} <button onClick={() => void pages.mutate()}>Retry search</button></p>}
        {first && <p className={styles.count}>{first.total.toLocaleString()} materials · Identical copies grouped</p>}
        {first?.total === 0 && <p>No materials match. Try fewer words or broaden the filters.</p>}
        {rows.map(row => <button key={row.file_id} id={`material-${row.file_id}`} data-material-result aria-pressed={selected?.file_id === row.file_id} className={styles.result} onClick={() => choose(row)}>
          <FileText size={16} /><span><strong>{row.filename}</strong><small>{labels[row.share] ?? row.share}{row.page_count ? ` · ${row.page_count} pages` : ''}{row.duplicate_count ? ` · ${row.duplicate_count} other copies` : ''}</small>
            <small className={styles.path}>{row.rel_path}</small><span className={styles.snippet}><MaterialHighlight text={row.snippet} ranges={row.highlights} /></span>
            {!!row.matched_pages.length && <small>Candidate pages: {row.matched_pages.slice(0, 8).join(', ')}{row.matched_pages.length > 8 ? '…' : ''}</small>}
          </span>
        </button>)}
        {first && (visible?.at(-1)?.page ?? 0) * first.page_size < first.total && <button className={styles.more} disabled={pages.isValidating} onClick={() => void pages.setSize(pages.size + 1)}>{pages.isValidating ? 'Loading…' : 'Load more materials'}</button>}
      </div>
      {selected && <section ref={previewRef} tabIndex={-1} className={styles.preview} aria-label="Material preview" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); back(); } }}>
        <button onClick={back}><ArrowLeft size={14} />Back to materials</button><h2>{selected.filename}</h2>
        <div className={styles.actions}><button onClick={() => void copy(selected.nas_path)}><Copy size={14} />Copy path</button></div>
        <p className={styles.path}>{materialAliasPath(selected.nas_path)}</p>
        <MaterialWorkControls key={selected.file_id} material={selected} scope={scope} canAssign={canAssign} onLocalOpen={() => void open()} />
        {notice && <p role="status">{notice}</p>}
        {preview.data?.extraction_metadata?.needs_review && <p role="note">Some pages have uncertain OCR. Check the original before reusing the questions.</p>}
        {preview.isLoading && <p role="status">Loading extracted text…</p>}
        {preview.error && <p role="alert">The preview could not load. <button onClick={() => void preview.mutate()}>Retry preview</button></p>}
        {preview.data && !preview.data.chunks.length && <p>No searchable text was extracted from this document.</p>}
        {!!selected.matched_pages.length && <p>Matches cover candidate page ranges. Check the original before choosing exercise pages.</p>}
        {preview.data?.chunks.map(chunk => <div key={chunk.chunk_index} className={styles.chunk}><h3>{chunk.page_start ? chunk.page_end && chunk.page_end !== chunk.page_start ? `Pages ${chunk.page_start}–${chunk.page_end}` : `Page ${chunk.page_start}` : 'Document text'}{preview.data?.extraction_metadata?.pages.some(page => page.page === chunk.page_start && page.method === 'ocr') && ' · OCR'}</h3><p><MaterialHighlight text={chunk.content} ranges={chunk.highlights} /></p></div>)}
        {preview.data?.truncated && <p>This text preview is shortened. Open the original for the full document.</p>}
        {!!selected.duplicate_locations.length && <details><summary>Other copies</summary>{selected.duplicate_locations.map(copy => <p key={`${copy.share}:${copy.rel_path}`}>{labels[copy.share] ?? copy.share}: {copy.rel_path}</p>)}</details>}
      </section>}
    </div>
  </section>;
}
