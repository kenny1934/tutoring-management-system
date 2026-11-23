"use client";
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import useSWR from 'swr';
import { ExternalLink, RotateCw } from 'lucide-react';
import { Button } from '@/components/controls';
import { fetchResponse } from '@/lib/api';
import { extractPagesForPrint, getPageCount } from '@/lib/pdf-utils';
import type { MaterialResult } from './MaterialSearch';
import styles from './MaterialSearch.module.css';

const Viewer = dynamic(() => import('@/components/lesson/PdfPageViewer').then(module => module.PdfPageViewer), { ssr: false });

const ALL_PAGES: number[] = [];

export function MaterialOriginal({ material, scope, pages, onPageCount }: {
  material: MaterialResult; scope: string; pages: number[]; onPageCount: (count: number) => void;
}) {
  const [rotation, setRotation] = useState(0);
  const [printing, setPrinting] = useState(false), [notice, setNotice] = useState('');
  const result = useSWR(['material-original', scope, material.file_id], async () => {
    const response = await fetchResponse(`/materials/${material.file_id}/raw`);
    const data = await response.arrayBuffer();
    if (String.fromCharCode(...new Uint8Array(data, 0, Math.min(5, data.byteLength))) !== '%PDF-') throw new Error('The original did not return a PDF.');
    return { data, count: await getPageCount(data.slice(0)) };
  }, { revalidateOnFocus: false, shouldRetryOnError: false });
  useEffect(() => { if (result.data) onPageCount(result.data.count); }, [result.data, onPageCount]);
  const print = async () => {
    if (!result.data) return;
    setPrinting(true); setNotice('');
    try {
      const blob = await extractPagesForPrint(result.data.data.slice(0), pages.length ? pages : Array.from({ length: result.data.count }, (_, index) => index + 1));
      const { printPdfBlob } = await import('@/lib/file-system');
      if (!printPdfBlob(blob)) setNotice('Allow the print window, then try again.');
    } catch { setNotice('The selected pages could not be prepared for printing.'); }
    finally { setPrinting(false); }
  };
  const openInTab = () => {
    if (!result.data) return;
    const url = URL.createObjectURL(new Blob([result.data.data], { type: 'application/pdf' }));
    const tab = window.open(url, '_blank');
    if (tab) tab.opener = null;
    else setNotice('Allow the new tab, then try again.');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  return <div className={styles.original}>
    <div className={styles.actions}>
      <Button variant="secondary" size="sm" icon={RotateCw} disabled={!result.data} aria-label="Rotate original preview" onClick={() => setRotation(value => (value + 90) % 360)}>Rotate</Button>
      <Button variant="secondary" size="sm" icon={ExternalLink} disabled={!result.data} onClick={openInTab}>Open in new tab</Button>
    </div>
    <div className={styles.viewer}><Viewer previewRotation={rotation} pdfData={result.data?.data ?? null} pageNumbers={ALL_PAGES} initialPage={material.matched_pages[0] || 1} keyboardNavigation renderConcurrency={2} isLoading={result.isLoading}
      error={result.error?.message ?? null} onRetry={() => void result.mutate()} exerciseLabel={material.filename}
      onPrint={() => void print()} isPrinting={printing} printTitle={pages.length ? 'Print selected pages' : 'Print original'} /></div>
    {notice && <p role="status">{notice}</p>}
  </div>;
}
