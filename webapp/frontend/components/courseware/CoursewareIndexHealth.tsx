"use client";
import { useState } from 'react';
import useSWR from 'swr';
import { Activity, Copy, Eye, Loader2 } from 'lucide-react';
import { fetchAPI } from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { PdfPreviewModal } from '@/components/ui/pdf-preview-modal';
import { materialAliasPath } from '@/components/commandPalette/MaterialSearch';
import styles from './CoursewareIndexHealth.module.css';

type Source = { id: string; label: string };
type FileIssue = { file_id: number; share: string; filename: string; nas_path: string; status: 'error' | 'pending'; reason: string; guidance: string };
type Health = { total: number; failed: number; queued: number; results: FileIssue[] };

export function CoursewareIndexHealth({ scope }: { scope: string }) {
  const sources = useSWR(['material-sources', scope], () => fetchAPI<{ can_manage_index?: boolean; sources: Source[] }>('/materials/sources'), { revalidateOnFocus: false });
  const [open, setOpen] = useState(false);
  if (!sources.data?.can_manage_index) return null;
  return <><button className={styles.entry} onClick={() => setOpen(true)}><Activity size={16} aria-hidden />Index health</button>
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Courseware index health" size="lg">
      {open && <HealthContent scope={scope} sources={sources.data.sources} />}
    </Modal></>;
}
export function HealthContent({ scope, sources }: { scope: string; sources: Source[] }) {
  const [share, setShare] = useState(''), [page, setPage] = useState(1);
  const [busy, setBusy] = useState<number | null>(null), [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<FileIssue | null>(null);
  const health = useSWR(['courseware-index-health', scope, share, page], () => fetchAPI<Health>('/materials/index-health', { method: 'POST', body: JSON.stringify({ share: share || null, page, page_size: 20 }) }), { revalidateOnFocus: false, shouldRetryOnError: false });
  async function retry(file: FileIssue) {
    setBusy(file.file_id); setNotice('');
    try {
      await fetchAPI('/materials/retry-extraction', { method: 'POST', body: JSON.stringify({ file_id: file.file_id }) });
      await health.mutate(); setNotice(`${file.filename} queued for the next scan.`);
    } catch { setNotice('Could not queue this file. Refresh the list and try again.'); }
    finally { setBusy(null); }
  }
  return <div className={styles.health}>
    <div className={styles.summary}>
      <label>Source<select value={share} onChange={event => { setShare(event.target.value); setPage(1); setNotice(''); }}><option value="">All available sources</option>{sources.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}</select></label>
      <button onClick={() => void health.mutate()} disabled={health.isValidating}>Refresh</button>
    </div>
    {health.data && <p className={styles.counts}>{health.data.failed} failed · {health.data.queued} awaiting extraction</p>}
    <p className={styles.help}>Retries run during the next scheduled scan. Existing indexed text stays available. A damaged or locked original may need fixing first.</p>
    <p role="status" className={styles.notice}>{notice || (health.isLoading ? 'Checking the index…' : '')}</p>
    {health.error ? <div role="alert">Could not load index health. <button onClick={() => void health.mutate()}>Try again</button></div> : health.data?.total === 0 ? <p>No failed or queued files in this source.</p> :
      <ul className={styles.files}>{health.data?.results.map(file => <li key={file.file_id}>
        <strong>{file.filename}</strong><p className={styles.path}>{materialAliasPath(file.nas_path)}</p>
        <p>{file.status === 'pending' ? 'Awaiting extraction' : file.reason}</p><p className={styles.help}>{file.guidance}</p>
        <div className={styles.actions}>
          <button onClick={() => setPreview(file)}><Eye size={15} aria-hidden />Open original</button>
          <button onClick={async () => { try { await navigator.clipboard.writeText(materialAliasPath(file.nas_path)); setNotice('Path copied.'); } catch { setNotice('Could not copy the path.'); } }}><Copy size={15} aria-hidden />Copy path</button>
          <button disabled={busy !== null || file.status === 'pending'} onClick={() => void retry(file)}>{busy === file.file_id && <Loader2 size={15} className="animate-spin" aria-hidden />}{file.status === 'pending' ? 'Queued' : 'Retry on next scan'}</button>
        </div>
      </li>)}</ul>}
    {health.data && health.data.total > 20 && <nav aria-label="Index health pages" className={styles.pagination}><button disabled={page === 1 || health.isLoading} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.ceil(health.data.total / 20)}</span><button disabled={page * 20 >= health.data.total || health.isLoading} onClick={() => setPage(page + 1)}>Next</button></nav>}
    <PdfPreviewModal isOpen={!!preview} onClose={() => setPreview(null)} documentId={null} sourcePath={preview ? materialAliasPath(preview.nas_path) : undefined} documentTitle={preview?.filename} />
  </div>;
}
