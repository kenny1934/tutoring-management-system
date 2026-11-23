"use client";
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { Download, RotateCw } from 'lucide-react';
import { fetchResponse } from '@/lib/api';
import { extractPagesForPrint, getPageCount } from '@/lib/pdf-utils';
import type { MaterialResult } from './MaterialSearch';
import styles from './MaterialSearch.module.css';

const Viewer = dynamic(() => import('@/components/lesson/PdfPageViewer').then(module => module.PdfPageViewer), { ssr: false });

export function MaterialOriginal({ material, scope, pages, onPageCount }: {
  material: MaterialResult; scope: string; pages: number[]; onPageCount: (count: number) => void;
}) {
  const [rotation, setRotation] = useState(0);
  const [page, setPage] = useState(material.matched_pages[0] || 1), [printing, setPrinting] = useState(false), [notice, setNotice] = useState('');
  const result = useSWR(['material-original', scope, material.file_id], async () => {
    const response = await fetchResponse(`/materials/${material.file_id}/raw`);
    const data = await response.arrayBuffer();
    if (String.fromCharCode(...new Uint8Array(data, 0, Math.min(5, data.byteLength))) !== '%PDF-') throw new Error('The original did not return a PDF.');
    return { data, count: await getPageCount(data.slice(0)) };
  }, { revalidateOnFocus: false, shouldRetryOnError: false });
  useEffect(() => { if (result.data) onPageCount(result.data.count); }, [result.data, onPageCount]);
  const count = result.data?.count ?? material.page_count ?? 1;
  const current = Math.max(1, Math.min(page, count));
  const visiblePages = useMemo(() => [current], [current]);
  const print = async () => {
    if (!result.data) return;
    setPrinting(true); setNotice('');
    try {
      const blob = await extractPagesForPrint(result.data.data.slice(0), pages.length ? pages : [current]);
      const { printPdfBlob } = await import('@/lib/file-system');
      if (!printPdfBlob(blob)) setNotice('Allow the print window, then try again.');
    } catch { setNotice('The selected pages could not be prepared for printing.'); }
    finally { setPrinting(false); }
  };
  const download = async () => {
    if (!result.data) return;
    try {
      const blob = pages.length ? await extractPagesForPrint(result.data.data.slice(0), pages) : new Blob([result.data.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = material.filename; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch { setNotice('The PDF could not be downloaded.'); }
  };
  return <div className={styles.original}>
    <div className={styles.actions}>
      <label>Page <input aria-label="Original PDF page" type="number" min={1} max={count} value={current} onChange={event => setPage(Number(event.target.value) || 1)} /> of {count}</label>
      <button disabled={!result.data} aria-label="Rotate original preview" onClick={() => setRotation(value => (value + 90) % 360)}><RotateCw size={14} />Rotate</button>
      <button disabled={!result.data} onClick={() => void download()}><Download size={14} />{pages.length ? 'Download selected pages' : 'Download original'}</button>
    </div>
    <div className={styles.viewer}><Viewer previewRotation={rotation} pdfData={result.data?.data ?? null} pageNumbers={visiblePages} isLoading={result.isLoading}
      error={result.error?.message ?? null} onRetry={() => void result.mutate()} exerciseLabel={material.filename}
      onPrint={() => void print()} isPrinting={printing} printTitle={pages.length ? 'Print selected pages' : 'Print this page'} /></div>
    {notice && <p role="status">{notice}</p>}
  </div>;
}
