"use client";
import { FileText, Loader2, RefreshCw, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/controls';
import styles from './CoursewarePreview.module.css';

export function CoursewarePreviewState({ error, title, path, onRetry }: { error?: string | null; title?: string; path?: string; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);
  const detail = !error ? '' : /More than one/i.test(error) ? 'Several files share this saved path. Select the right copy through courseware search.' : /path cannot|missing.*folder/i.test(error) ? 'The saved path does not include a supported shared folder. Find this file through courseware search.'
    : /no longer|not found|404/i.test(error) ? 'The file could not be found at its saved location. It may have moved or been renamed.'
    : /access|permission|403/i.test(error) ? 'Your account does not have access to this courseware source.'
    : /parse|invalid|PDF|document/i.test(error) ? 'This file could not be displayed as a PDF. Try loading a fresh copy.'
    : 'The courseware service could not open this file. Check your connection, then try again.';
  return <div className={styles.state} aria-busy={!error}>
    <div className={styles.paper}>
      <span className={styles.icon}>{error ? <FileText size={25} aria-hidden /> : <Loader2 size={25} className={styles.spinner} aria-hidden />}</span>
      <h3 role={error ? 'alert' : 'status'}>{error ? 'PDF unavailable' : 'Opening PDF…'}</h3>
      {error && title && <p className={styles.filename} title={title}>{title}</p>}
      {error && <p className={styles.detail}>{detail}</p>}
      {error && <div className={styles.actions}>
        {onRetry && <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>Retry preview</Button>}
        {path && <Button variant="quiet" size="sm" icon={Copy} onClick={() => { void navigator.clipboard?.writeText(path).then(() => setCopied(true), () => setCopied(false)); }}>{copied ? 'Path copied' : 'Copy path'}</Button>}
      </div>}
    </div>
  </div>;
}
