"use client";

import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import styles from './MaterialSearch.module.css';

export type MaterialCoverage = {
  status: 'searchable' | 'awaiting_ocr' | 'ocr_failed' | 'pending' | 'incomplete' | 'failed' | 'review' | 'no_text' | 'unavailable';
  has_text: boolean;
  total_pages: number | null;
  native: number;
  ocr: number;
  pending_ocr: number;
  failed_ocr: number;
};

export function MaterialCoverageStatus({ coverage }: { coverage: MaterialCoverage }) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (details.current && !details.current.contains(event.target as Node)) details.current.open = false; };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  const pages = (count: number) => `${count} ${count === 1 ? 'page' : 'pages'}`;
  const label = {
    searchable: 'Searchable text', awaiting_ocr: `OCR not run · ${coverage.pending_ocr} ${coverage.pending_ocr === 1 ? 'page' : 'pages'}`,
    ocr_failed: `OCR failed · ${coverage.failed_ocr} ${coverage.failed_ocr === 1 ? 'page' : 'pages'}`,
    pending: 'Text not indexed', incomplete: 'Extraction incomplete', failed: 'Extraction failed', review: 'OCR needs review', no_text: 'No searchable text', unavailable: 'Text extraction unavailable',
  }[coverage.status];
  return <details ref={details} className={styles.coverage} aria-label="Text coverage" onKeyDown={event => { if (event.key === "Escape" && event.currentTarget.open) { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; } }}>
    <summary title={label}><span>{label}</span><ChevronDown size={12} aria-hidden="true" /></summary>
    <p>{coverage.native > 0 && `Native text: ${pages(coverage.native)}. `}{coverage.ocr > 0 && `OCR read: ${pages(coverage.ocr)}. `}
      {coverage.pending_ocr > 0 && `${pages(coverage.pending_ocr)} await OCR assessment; these may include blank or sparse pages. `}
      {coverage.failed_ocr > 0 && `${pages(coverage.failed_ocr)} could not be read by OCR. `}
      {coverage.status === 'review' && 'Check the original before reusing recognised questions. '}
      {coverage.status === 'failed' && 'Text extraction failed. You can still try opening the original. '}
      {coverage.status === 'unavailable' && 'The indexer skipped text extraction for this file. '}
      {coverage.status === 'pending' && 'This file has not been indexed yet. '}
      {coverage.status === 'incomplete' && 'Available text can be searched, but extraction did not complete. '}
      {!coverage.has_text && 'Only the filename and path can match until searchable text is available.'}</p>
  </details>;
}
