"use client";
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ExternalLink, RotateCw } from 'lucide-react';
import { Button } from '@/components/controls';
import { useCoursewarePdf } from '@/hooks/useCoursewarePdf';
import { extractPagesForPrint } from '@/lib/pdf-utils';
import type { MaterialResult } from './MaterialSearch';
import type { MaterialReadingPlace } from './material-workspace';
import styles from './MaterialSearch.module.css';

const Viewer = dynamic(() => import('@/components/lesson/PdfPageViewer').then(module => module.PdfPageViewer), { ssr: false });

const ALL_PAGES: number[] = [];
export function MaterialOriginal({ material, scope, pages, initialPage, onPageCount, reading }: {
  material: MaterialResult; scope: string; pages: number[]; onPageCount: (count: number) => void; initialPage?: number; reading?: MaterialReadingPlace;
}) {
  const [rotation, setRotation] = useState(reading?.rotation ?? 0);
  const [printing, setPrinting] = useState(false), [notice, setNotice] = useState('');
  const result = useCoursewarePdf(material.nas_path ?? '', material.file_id, scope);
  const print = async () => {
    if (!result.data) return;
    setPrinting(true); setNotice('');
    try {
      const blob = pages.length ? await extractPagesForPrint(result.data.data.slice(0), pages) : new Blob([result.data.data], { type: 'application/pdf' });
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
      <Button variant="secondary" size="sm" icon={RotateCw} disabled={!result.data} aria-label="Rotate original preview" onClick={() => setRotation(value => { const next = (value + 90) % 360; if (reading) reading.rotation = next; return next; })}>Rotate</Button>
      <Button variant="secondary" size="sm" icon={ExternalLink} disabled={!result.data} onClick={openInTab}>Open in new tab</Button>
    </div>
    <div className={styles.viewer}><Viewer previewRotation={rotation} pdfData={result.data?.data ?? null} pageNumbers={ALL_PAGES} initialPage={initialPage || material.matched_pages[0] || 1} viewStates={reading?.pdfViews} viewKey={material.file_id} keyboardNavigation renderConcurrency={2} isLoading={result.isLoading}
      error={result.error} onRetry={result.retry} onPageCount={onPageCount} onDocumentError={result.recoverLocal} exerciseLabel={material.filename}
      onPrint={() => void print()} isPrinting={printing} printTitle={pages.length ? 'Print selected pages' : 'Print original'} /></div>
    {notice && <p role="status">{notice}</p>}
  </div>;
}
