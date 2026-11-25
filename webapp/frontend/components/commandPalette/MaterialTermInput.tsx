"use client";
import { useId, useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { parseMaterialTerms, serializeMaterialTerms } from './material-refinements';
import styles from './MaterialSearch.module.css';

export type TermDraft = { values: string[]; pending: string; editing: number | null };
export const createTermDraft = (raw: string): TermDraft => ({ values: parseMaterialTerms(raw), pending: '', editing: null });
const clean = (term: string) => term.trim().replace(/^["“](.*)["”]$/, '$1');
export function termValues(draft: TermDraft): string[] {
  const values = draft.values.filter((_, index) => index !== draft.editing);
  const pending = draft.pending.split(/[,\n]/).map(clean).filter(Boolean);
  if (draft.editing === null) values.push(...pending);
  else values.splice(draft.editing, 0, ...pending);
  return [...new Set(values)];
}
export function termError(draft: TermDraft): string | null {
  const values = termValues(draft);
  if (values.some(value => value.includes('"'))) return 'Use Exact phrase for text containing quotation marks.';
  if (values.length > 8) return 'Choose up to eight words or phrases.';
  if (serializeMaterialTerms(values).length > 256) return 'Use fewer or shorter words and phrases.';
  return null;
}

export function MaterialTermInput({ label, value, onChange, id }: { label: string; value: TermDraft; onChange: (value: TermDraft) => void; id: string }) {
  const hint = useId(), input = useRef<HTMLInputElement>(null);
  const commit = () => { onChange({ values: termValues(value), pending: '', editing: null }); input.current?.focus(); };
  return <div className={styles.termField}>
    <div className={styles.termValues}>
      {value.values.map((term, index) => index === value.editing ? null : <span key={`${term}:${index}`} className={styles.term}>
        <button type="button" title={`Edit ${term}`} aria-label={`Edit ${label}: ${term}`} onClick={() => { onChange({ ...value, editing: index, pending: term }); input.current?.focus(); }}>{term}</button>
        <button type="button" aria-label={`Remove ${label}: ${term}`} onClick={() => { onChange({ ...value, values: value.values.filter((_, i) => i !== index), editing: value.editing !== null && value.editing > index ? value.editing - 1 : value.editing }); input.current?.focus(); }}><X size={12} /></button>
      </span>)}
      <div className={styles.termEntry}>
        <input ref={input} id={id} aria-label={label} aria-describedby={hint} maxLength={256} value={value.pending} placeholder="Add a word or phrase" enterKeyHint="done"
          onChange={event => onChange({ ...value, pending: event.target.value })}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); event.stopPropagation(); commit(); }
            if (event.key === 'Backspace' && !value.pending && value.editing === null && value.values.length) onChange({ ...value, editing: value.values.length - 1, pending: value.values.at(-1)! });
          }} />
        <button type="button" disabled={!value.pending.trim()} aria-label={`Add ${label.toLowerCase()}`} onClick={commit}><Plus size={16} /></button>
      </div>
    </div>
    <span id={hint} className={styles.visuallyHidden}>Enter or + to add a word or phrase.</span>
  </div>;
}
