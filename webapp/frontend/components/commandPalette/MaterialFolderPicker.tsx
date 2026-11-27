'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import { ChevronDown, ChevronRight, Folder, Loader2 } from 'lucide-react';
import { fetchAPI } from '@/lib/api';
import { isCancelledSearchRequest, useAbortableRequest } from './useAbortableRequest';
import styles from './MaterialSearch.module.css';

type FolderPage = { share: string; path: string; folders: { name: string; path: string; files: number }[]; next: string | null };
export function MaterialFolderPicker({ id, scope, share, sourceLabel, value, onChange, autoOpen = false, contents = false, breadcrumbsOnly = false, onSources, filesEmpty = false }: {
  id: string; scope: string; share: string; sourceLabel: string; value: string; onChange: (path: string) => void; autoOpen?: boolean; contents?: boolean; breadcrumbsOnly?: boolean; onSources?: () => void; filesEmpty?: boolean;
}) {
  const trail = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(autoOpen);
  const expanded = contents || open;
  const parent = value === '/' ? '' : value;
  const key = JSON.stringify([scope, share, parent]);
  const request = useAbortableRequest(key, expanded && !!share && !breadcrumbsOnly);
  const pages = useSWRInfinite<FolderPage>((index, previous) => !expanded || !share || breadcrumbsOnly || (previous && !previous.next) ? null
    : ['material-folders', key, index ? previous.next : ''],
    ([, , after]: [string, string, string]) => request(signal => fetchAPI<FolderPage>('/materials/folders', {
      method: 'POST', body: JSON.stringify({ share, folder: parent, after }), signal,
    })), { keepPreviousData: false, persistSize: false, revalidateOnFocus: false, shouldRetryOnError: false });
  const visible = pages.data?.[0]?.share === share && pages.data[0].path === parent ? pages.data : undefined;
  const children = visible?.flatMap(page => page.folders) ?? [];
  const parts = value.split('/').filter(Boolean);
  useLayoutEffect(() => {
    const element = trail.current;
    if (element) element.scrollLeft = element.scrollWidth - element.clientWidth;
  }, [value, share, expanded, breadcrumbsOnly]);
  return <div className={contents || breadcrumbsOnly ? styles.folderContents : styles.folderPicker}>
    {!contents && !breadcrumbsOnly && <><span>Folder</span>
    <button id={id} type="button" aria-label="Browse courseware folders" aria-expanded={expanded && !!share} disabled={!share}
      title={value || 'Choose a source to browse folders'} onClick={() => setOpen(previous => !previous)}>
      <Folder size={14} /><span>{!share ? 'Choose a source' : parent || 'All folders'}</span><ChevronDown size={14} />
    </button></>}
    {(expanded || breadcrumbsOnly) && !!share && <div className={contents || breadcrumbsOnly ? undefined : styles.folderBrowser}>
      <nav aria-label="Courseware folder location" className={styles.folderCrumbs}>
        {onSources && <><button type="button" onClick={onSources}>Folders</button><ChevronRight size={12} /></>}
        <div ref={trail} className={styles.folderTrail}>
        <button type="button" title={sourceLabel} aria-current={!parts.length ? 'location' : undefined} onClick={() => onChange('/')}>{sourceLabel}</button>
        {parts.map((part, index) => <span key={index}><ChevronRight size={12} /><button type="button"
          aria-current={index === parts.length - 1 ? 'location' : undefined} title={parts.slice(0, index + 1).join('/')} onClick={() => onChange(parts.slice(0, index + 1).join('/'))}>{part}</button></span>)}
        </div>
      </nav>
      {!breadcrumbsOnly && <>
      {pages.isLoading && <p role="status" className={styles.folderLoading}><Loader2 size={14} aria-hidden="true" />Loading folders…</p>}
      {pages.error && !isCancelledSearchRequest(pages.error) && <p role="alert">Could not load folders. <button type="button" onClick={() => void pages.mutate()}>Retry</button></p>}
      {visible && !children.length && !contents && <p>No subfolders</p>}
      <div className={styles.folderChildren}>
        {children.map(folder => <button key={folder.path} data-material-result={contents || undefined} data-folder-path={folder.path} type="button" onClick={() => onChange(folder.path)} title={folder.name} aria-label={`Open folder ${folder.name}`}>
          <Folder size={14} /><span>{folder.name}</span><small>{folder.files.toLocaleString()} files</small><ChevronRight size={14} />
        </button>)}
      </div>
      {contents && filesEmpty && visible && !pages.isValidating && !pages.error && <p>No files directly in this folder.</p>}
      {visible?.at(-1)?.next && <button type="button" disabled={pages.isValidating} onClick={() => void pages.setSize(pages.size + 1)}>More folders</button>}
      </>}
    </div>}
  </div>;
}
