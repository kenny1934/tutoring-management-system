"use client";
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { ExternalLink, RotateCw } from 'lucide-react';
import { Button, IconButton } from '@/components/controls';
import { useIsMobile } from '@/hooks/useIsMobile';
import { CoursewarePreviewState } from '@/components/courseware/CoursewarePreviewState';
import { useCoursewarePdf } from '@/hooks/useCoursewarePdf';
import { extractPagesForPrint } from '@/lib/pdf-utils';
import type { MaterialResult } from './MaterialSearch';
import type { MaterialReadingPlace } from './material-workspace';
import type { PdfFindTerm } from "@/lib/pdf-text-search";
import styles from './MaterialSearch.module.css';

const Viewer = dynamic(() => import('@/components/lesson/PdfPageViewer').then(module => module.PdfPageViewer), { ssr: false, loading: () => <CoursewarePreviewState /> });

const ALL_PAGES: number[] = [];
export function MaterialOriginal({ material, scope, pages, initialPage, onPageCount, reading, searchTerms }: {
  searchTerms?: PdfFindTerm[]; material: MaterialResult; scope: string; pages: number[]; onPageCount: (count: number) => void; initialPage?: number; reading?: MaterialReadingPlace;
}) {
  const mobile = useIsMobile(768);
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
  const rotate = () => setRotation(value => { const next = (value + 90) % 360; if (reading) reading.rotation = next; return next; });
  const mobileTools = mobile ? <>
    <IconButton label="Rotate original preview" icon={RotateCw} disabled={!result.data} onClick={rotate} />
    <IconButton label="Open in new tab" icon={ExternalLink} disabled={!result.data} onClick={openInTab} />
  </> : undefined;
  return <div className={styles.original}>
    {!mobile && <div className={styles.actions}>
      <Button variant="secondary" size="sm" icon={RotateCw} disabled={!result.data} aria-label="Rotate original preview" onClick={rotate}>Rotate</Button>
      <Button variant="secondary" size="sm" icon={ExternalLink} disabled={!result.data} onClick={openInTab}>Open in new tab</Button>
    </div>}
    <div className={styles.viewer}><Viewer compactToolbar={mobile} toolbarStart={mobileTools} searchTerms={searchTerms} previewRotation={rotation} pdfData={result.data?.data ?? null} pageNumbers={ALL_PAGES} initialPage={initialPage || material.matched_pages[0] || 1} viewStates={reading?.pdfViews} viewKey={material.file_id} keyboardNavigation progressive renderConcurrency={2} isLoading={result.isLoading}
      renderLoading={() => <CoursewarePreviewState />} renderError={message => <CoursewarePreviewState error={message} title={material.filename} path={material.nas_path} onRetry={result.retry} />} error={result.error} onRetry={result.retry} onPageCount={onPageCount} onDocumentError={result.recoverLocal} exerciseLabel={material.filename}
      onPrint={() => void print()} isPrinting={printing} printTitle={pages.length ? 'Print selected pages' : 'Print original'} /></div>
    {notice && <p role="status">{notice}</p>}
  </div>;
}
