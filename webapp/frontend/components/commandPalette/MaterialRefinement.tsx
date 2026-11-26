"use client";
import { useEffect, useId, useLayoutEffect, useState } from 'react';
import { autoUpdate, flip, FloatingFocusManager, FloatingOverlay, FloatingPortal, offset, shift, size, useClick, useDismiss, useFloating, useInteractions, useRole } from '@floating-ui/react';
import { Filter, Plus, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useOverlayLayer } from '@/hooks/useOverlayLayer';
import { defaultMaterialFilters, type MaterialFilters } from './material-workspace';
import { filterChips, serializeMaterialTerms } from './material-refinements';
import { MaterialTermInput, createTermDraft, termError, termValues } from './MaterialTermInput';
import { MaterialDateRange } from './MaterialDateRange';
import styles from './MaterialSearch.module.css';

type Rule = 'any_words' | 'exclude_words' | 'exact_phrase';
const ruleLabels: Record<Rule, string> = { any_words: 'Must include one of', exclude_words: 'Must not include', exact_phrase: 'Must include phrase' };
export type MaterialRefinementProps = {
  sources?: { id: string; label: string }[]; filters: MaterialFilters; onApply: (patch: Partial<MaterialFilters>) => void;
  isOpen: boolean; onOpenChange: (open: boolean) => void; edit?: keyof MaterialFilters;
  supportsRefinements: boolean; facets?: { ext: Record<string, number>; folder: Record<string, number> };
};

export function MaterialRefinement({ isOpen, onOpenChange, ...props }: MaterialRefinementProps) {
  const countDescription = useId();
  const mobile = useIsMobile(768), layer = useOverlayLayer(isOpen, { lockScroll: mobile });
  const { refs, floatingStyles, context } = useFloating({ open: isOpen, onOpenChange, placement: 'bottom-end', strategy: 'fixed',
    middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 }), size({ padding: 12, apply: ({ availableHeight, elements }) => { elements.floating.style.setProperty('--filter-available-height', `${availableHeight}px`); } })], whileElementsMounted: autoUpdate });
  const { getReferenceProps, getFloatingProps } = useInteractions([useClick(context), useDismiss(context, { enabled: layer.isTopmost, capture: { escapeKey: true }, bubbles: { escapeKey: false } }), useRole(context)]);
  const count = filterChips(props.filters).length;
  const close = () => onOpenChange(false);
  return <>
    <button ref={refs.setReference} {...getReferenceProps()} className={styles.filterTrigger} aria-label="Filters" aria-describedby={count ? countDescription : undefined} aria-expanded={isOpen}><Filter size={14} />Filters{count > 0 && <span aria-hidden="true">{count}</span>}</button>
    {count > 0 && <span id={countDescription} className={styles.visuallyHidden}>{count} filters applied</span>}
    {isOpen && <FloatingPortal>
      {mobile && <FloatingOverlay lockScroll={false} className={styles.filterBackdrop} style={{ zIndex: layer.zIndex }} />}
      <FloatingFocusManager context={context} modal={mobile} closeOnFocusOut={false} initialFocus={mobile && !props.edit ? 0 : -1} returnFocus>
        <div ref={refs.setFloating} {...getFloatingProps()} aria-label="Courseware filters" data-filter-surface aria-modal={mobile || undefined} className={`${styles.filterFloating} ${mobile ? styles.filterSheet : ''}`} style={{ ...(mobile ? {} : floatingStyles), zIndex: layer.zIndex }}
          onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
          <RefinementForm mobile={mobile} key={`${JSON.stringify(props.filters)}:${props.edit}`} {...props} onCancel={close} onApply={patch => { props.onApply(patch); close(); }} />
        </div>
      </FloatingFocusManager>
    </FloatingPortal>}
  </>;
}

function RefinementForm({ filters, onApply, onCancel, supportsRefinements, facets, edit, mobile, sources }: Omit<MaterialRefinementProps, 'isOpen' | 'onOpenChange'> & { onCancel: () => void; mobile: boolean }) {
  const [draft, setDraft] = useState(filters);
  const [visible, setVisible] = useState<Rule[]>(() => (Object.keys(ruleLabels) as Rule[]).filter(key => !!filters[key] || key === edit));
  const [words, setWords] = useState(() => ({ any_words: createTermDraft(filters.any_words), exclude_words: createTermDraft(filters.exclude_words) }));
  const [customDates, setCustomDates] = useState(!!(filters.modified_from || filters.modified_to));
  const id = useId(), [focus, setFocus] = useState<keyof MaterialFilters | undefined>(edit || (mobile ? undefined : 'ext'));
  const invalidDates = !!(draft.modified_from && draft.modified_to && draft.modified_from > draft.modified_to);
  const errors = { any_words: termError(words.any_words), exclude_words: termError(words.exclude_words) };
  const invalid = invalidDates || !!errors.any_words || !!errors.exclude_words;
  const update = (key: keyof MaterialFilters, value: string) => setDraft(previous => ({ ...previous, [key]: value }));
  useEffect(() => { if (!focus) return; document.getElementById(`${id}-${focus}`)?.focus(); }, [focus, id]);
  useLayoutEffect(() => {
    const panel = document.getElementById(`${id}-form`);
    const viewport = window.visualViewport;
    const fit = () => {
      panel?.style.setProperty('--filter-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      panel?.parentElement?.style.setProperty('--filter-keyboard-inset', `${Math.max(0, window.innerHeight - ((viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0)))}px`);
    };
    fit(); viewport?.addEventListener('resize', fit); viewport?.addEventListener('scroll', fit);
    return () => { viewport?.removeEventListener('resize', fit); viewport?.removeEventListener('scroll', fit); };
  }, [id]);
  const remove = (rule: Rule) => {
    setVisible(previous => previous.filter(key => key !== rule)); update(rule, '');
    if (rule !== 'exact_phrase') setWords(previous => ({ ...previous, [rule]: createTermDraft('') }));
    setFocus(undefined);
    requestAnimationFrame(() => document.getElementById(`${id}-add`)?.focus());
  };
  const clear = () => {
    setDraft({ ...defaultMaterialFilters(), share: filters.share, search_in: filters.search_in, sort: filters.sort });
    setWords({ any_words: createTermDraft(''), exclude_words: createTermDraft('') }); setVisible([]); setCustomDates(false);
  };
  return <form id={`${id}-form`} className={styles.refinementForm} aria-label="Courseware filter settings" onSubmit={event => {
    event.preventDefault(); if (invalid) return;
    onApply({ ...draft, any_words: serializeMaterialTerms(termValues(words.any_words)), exclude_words: serializeMaterialTerms(termValues(words.exclude_words)), exact_phrase: draft.exact_phrase.trim() });
  }}>
    <div className={styles.filterHeading}><h2>Filters</h2><button type="button" aria-label="Close filters" onClick={onCancel}><X size={18} /></button></div>
    <div className={styles.filterScroll}>
      <fieldset className={styles.fileFilters}><legend>Files</legend>
        {sources && <label>Source<select id={`${id}-share`} aria-label="Filter courseware source" value={draft.share} onChange={event => setDraft(previous => ({ ...previous, share: event.target.value, folder: '' }))}><option value="">All sources</option>{sources.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}</select></label>}
        {supportsRefinements && <label>Search in<select id={`${id}-search_in`} aria-label="Courseware search scope" value={draft.search_in} onChange={event => update('search_in', event.target.value)}><option value="both">Name &amp; text</option><option value="filename">Filename only</option><option value="content">Contents only</option></select></label>}
        <label>File type<select id={`${id}-ext`} aria-label="Courseware file type" value={draft.ext} onChange={event => update('ext', event.target.value)}><option value="">All types</option>{[...new Set(['.pdf', '.docx', '.xlsx', '.pptx', ...Object.keys(facets?.ext ?? {})])].sort().map(ext => <option key={ext} value={ext}>{ext.slice(1).toUpperCase()}</option>)}</select></label>
        <label>Folder<select id={`${id}-folder`} aria-label="Courseware folder" value={draft.folder} onChange={event => update('folder', event.target.value)}><option value="">All folders</option>{[...new Set([...(draft.folder ? [draft.folder] : []), ...Object.keys(facets?.folder ?? {})])].map(folder => <option key={folder} value={folder}>{folder}{facets?.folder[folder] !== undefined ? ` (${facets.folder[folder]})` : ''}</option>)}</select></label>
        <label>Modified<select id={`${id}-modified`} aria-label="Courseware modified date" value={customDates ? 'custom' : draft.modified} onChange={event => {
          setCustomDates(event.target.value === 'custom'); setDraft(previous => ({ ...previous, modified: event.target.value === 'custom' ? '' : event.target.value, modified_from: '', modified_to: '' }));
        }}><option value="">Any time</option><option value="week">Past week</option><option value="month">Past month</option><option value="year">Past year</option><option value="older">Older than a year</option>{supportsRefinements && <option value="custom">Custom range…</option>}</select></label>
        {customDates && <MaterialDateRange from={draft.modified_from} to={draft.modified_to} onChange={(from, to) => setDraft(previous => ({ ...previous, modified_from: from, modified_to: to }))} />}
        {invalidDates && <p role="alert">The start date must be on or before the end date.</p>}
      </fieldset>
      {supportsRefinements && <fieldset className={styles.wordFilters}><legend>Words</legend>
        <label className={styles.searchWordMode}>Search box matches<select id={`${id}-match`} aria-label="Search word matching" value={draft.match} onChange={event => update('match', event.target.value)}><option value="all">All words</option><option value="any">Any word</option></select></label>
        {visible.map(rule => <div className={styles.wordRule} key={rule}>
          <div className={styles.ruleHeading}><label htmlFor={`${id}-${rule}`}>{ruleLabels[rule]}</label><button type="button" aria-label={`Remove condition: ${ruleLabels[rule]}`} onClick={() => remove(rule)}><X size={14} /></button></div>
          {rule === 'exact_phrase' ? <input id={`${id}-${rule}`} aria-label="Exact phrase" maxLength={256} value={draft.exact_phrase} onChange={event => update('exact_phrase', event.target.value)} /> : <MaterialTermInput id={`${id}-${rule}`} label={rule === 'any_words' ? 'Alternatives' : 'Excluded words'} value={words[rule]} onChange={value => setWords(previous => ({ ...previous, [rule]: value }))} />}
          {rule !== 'exact_phrase' && errors[rule] && <p role="alert">{errors[rule]}</p>}
        </div>)}
        {visible.length < 3 && <label className={styles.addCondition}><Plus size={14} /><span>Add condition</span><select id={`${id}-add`} aria-label="Add condition" value="" onChange={event => { const rule = event.target.value as Rule; setVisible(previous => [...previous, rule]); setFocus(rule); }}>
          <option value="" disabled>Add condition</option>{!visible.includes('any_words') && <option value="any_words">Must include one of…</option>}{!visible.includes('exclude_words') && <option value="exclude_words">Exclude words…</option>}{!visible.includes('exact_phrase') && <option value="exact_phrase">Exact phrase…</option>}
        </select></label>}
      </fieldset>}
    </div>
    <div className={styles.refinementActions}><button type="button" onClick={clear}>Clear filters</button><span /><button type="button" onClick={onCancel}>Cancel</button><button type="submit" className={styles.applyFilters} disabled={invalid}>Apply</button></div>
  </form>;
}
