import styles from './MaterialSearch.module.css';
export type SourceFreshness = { last_full_scan_at: string | null; latest_status: string | null; latest_started_at: string | null; latest_finished_at: string | null; errors: number };
export type CoursewareSource = { id: string; label: string; coverage?: { files: number; limited_files: number }; freshness?: SourceFreshness };
function date(value: string | null) {
  if (!value) return null;
  const stamp = new Date(value);
  return Number.isNaN(stamp.getTime()) ? null : stamp.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function CoursewareSourceStatus({ freshness, indexedFiles = 0 }: { freshness?: SourceFreshness; indexedFiles?: number }) {
  if (!freshness) return null;
  const last = date(freshness.last_full_scan_at);
  const issue = freshness.latest_status === 'error' ? indexedFiles > 0 ? 'Latest scan failed; indexed files remain available' : 'Latest scan failed' : freshness.latest_status === 'aborted' ? 'Latest scan stopped' : freshness.latest_status === 'running' ? 'Latest scan not completed' : freshness.errors ? `Latest scan reported ${freshness.errors} ${freshness.errors === 1 ? 'error' : 'errors'}` : null;
  return <small className={styles.sourceFreshness}>
    <span>{last ? <>Last full scan <time dateTime={freshness.last_full_scan_at!}>{last}</time></> : indexedFiles > 0 ? 'Files indexed; full scan not yet recorded' : 'No completed full scan recorded'}</span>
    {issue && <span>{issue}{date(freshness.latest_finished_at ?? freshness.latest_started_at) ? ` · ${date(freshness.latest_finished_at ?? freshness.latest_started_at)}` : ''}</span>}
  </small>;
}
