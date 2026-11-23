"use client";
import { useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { CalendarPlus, FileText } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/controls';
import { materialAliasPath, type MaterialResult } from './MaterialSearch';
import { materialPages } from './material-pages';
import { MaterialOriginal } from './MaterialOriginal';
import styles from './MaterialSearch.module.css';

const SessionSelectorModal = dynamic(() => import('@/components/sessions/SessionSelectorModal').then(module => module.SessionSelectorModal), { ssr: false });

export function MaterialWorkControls({ material, scope, canAssign, heading, children }: {
  material: MaterialResult; scope: string; canAssign: boolean; heading?: ReactNode; children?: ReactNode;
}) {
  const assignButton = useRef<HTMLButtonElement>(null);
  const [showOriginal, setShowOriginal] = useState(false), [assigning, setAssigning] = useState(false), [selectingSessions, setSelectingSessions] = useState(false);
  const [count, setCount] = useState(material.page_count), [range, setRange] = useState(material.page_count === 1 ? '1' : '');
  const [notice, setNotice] = useState('');
  const selected = materialPages(range, count);
  const closePages = () => { setAssigning(false); requestAnimationFrame(() => assignButton.current?.focus()); };
  const returnToAssignment = () => { setSelectingSessions(false); requestAnimationFrame(() => assignButton.current?.focus()); };
  return <div className={styles.previewLayout}>
    <div className={styles.previewHeader}>{heading}
    {material.ext === '.pdf' && <div className={styles.actions}>
      <Button variant="secondary" size="sm" icon={FileText} aria-label={showOriginal ? 'Hide original' : 'View original PDF'} aria-expanded={showOriginal} onClick={() => setShowOriginal(value => !value)}>{showOriginal ? 'Hide PDF' : 'View PDF'}</Button>
      {canAssign && <Button variant="secondary" size="sm" icon={CalendarPlus} aria-label="Assign to sessions" ref={assignButton} aria-haspopup="dialog" onClick={() => { setAssigning(true); setNotice(''); }}>Assign</Button>}
    </div>}
    </div>
    <div className={styles.previewContent} data-courseware-scroll>
    {showOriginal && <MaterialOriginal material={material} scope={scope} pages={selected ?? []} onPageCount={setCount} />}
    {notice && <p role="status">{notice}</p>}
    {children}
    </div>
    {canAssign && assigning && <Modal isOpen title="Assign courseware" size="sm" onClose={closePages} footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={closePages}>Cancel</Button><Button disabled={!selected} onClick={() => { setAssigning(false); setSelectingSessions(true); }}>Choose sessions</Button></div>}>
      <p className="text-sm font-medium text-ink-heading mb-4 break-words">{material.filename}</p>
      <div className="flex items-end gap-3">
        <label className="flex-1 text-sm text-ink-heading">Pages<input className="mt-1 w-full rounded border border-line bg-paper px-3 py-2 text-ink-heading" aria-label="Courseware pages" value={range} placeholder="e.g. 1-3, 5" onChange={event => setRange(event.target.value)} /></label>
        <Button variant="quiet" disabled={!count} onClick={() => setRange(count === 1 ? '1' : `1-${count}`)}>All pages{count ? ` (${count})` : ''}</Button>
      </div>
      {range && !selected && <p role="alert">Enter page numbers within this PDF{count ? ` (1–${count})` : ', after checking its page count'}.</p>}
    </Modal>}
    {selectingSessions && selected && canAssign && <SessionSelectorModal isOpen
      files={[{ path: materialAliasPath(material.nas_path), pages: range, pageCount: count ?? undefined }]}
      onClose={returnToAssignment} onAssignComplete={() => { setAssigning(false); setNotice('Courseware assigned.'); returnToAssignment(); }} />}
  </div>;
}
