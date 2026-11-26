"use client";
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { CoursewarePreviewState } from './CoursewarePreviewState';
import styles from './CoursewarePreview.module.css';
const Viewer = dynamic(() => import('@/components/lesson/PdfPageViewer').then(module => module.PdfPageViewer), { ssr: false, loading: () => <CoursewarePreviewState /> });
const ALL_PAGES: number[] = [];
/** Render PDF bytes ourselves, including browsers without an embedded PDF plugin. */
export function CanvasPdfPreview({ data, src, title, path, onRetry, onDocumentError, onPageCount, error }: {
  error?: string | null; data?: ArrayBuffer; src?: string; title?: string; path?: string; onRetry?: () => void; onDocumentError?: () => void; onPageCount?: (count: number) => void;
}) {
  const [state, setState] = useState<{ src?: string; data?: ArrayBuffer; error?: string }>({});
  useEffect(() => {
    if (data || !src) return;
    const controller = new AbortController();
    void fetch(src, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('The processed PDF could not load.');
      return response.arrayBuffer();
    }).then(bytes => { if (!controller.signal.aborted) setState({ src, data: bytes }); }, () => { if (!controller.signal.aborted) setState({ src, error: 'The processed PDF could not load.' }); });
    return () => controller.abort();
  }, [data, src]);
  const current = state.src === src ? state : undefined;
  const bytes = data ?? current?.data;
  if (error || !bytes) return <CoursewarePreviewState error={error ?? current?.error} title={title} path={path} onRetry={onRetry} />;
  const fail = (message: string) => <CoursewarePreviewState error={message} title={title} path={path} onRetry={onRetry} />;
  return <div className={styles.viewer}><Viewer pdfData={bytes ?? null} pageNumbers={ALL_PAGES} progressive renderConcurrency={2} keyboardNavigation exerciseLabel={title}
    isLoading={!bytes && !current?.error} error={current?.error ?? null} onRetry={onRetry} onDocumentError={onDocumentError} onPageCount={onPageCount} renderError={fail} renderLoading={() => <CoursewarePreviewState />} /></div>;
}
