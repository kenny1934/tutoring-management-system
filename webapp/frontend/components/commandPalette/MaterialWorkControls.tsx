"use client";
import { useRef, useState } from 'react';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import { sessionsAPI } from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { materialAliasPath, type MaterialResult } from './MaterialSearch';
import { materialPages } from './material-pages';
import { MaterialOriginal } from './MaterialOriginal';
import { MaterialLessonPicker } from './MaterialLessonPicker';
import styles from './MaterialSearch.module.css';

const ExerciseModal = dynamic(() => import('@/components/sessions/ExerciseModal').then(module => module.ExerciseModal), { ssr: false });

export function MaterialWorkControls({ material, scope, canAssign, onLocalOpen }: {
  material: MaterialResult; scope: string; canAssign: boolean; onLocalOpen: () => void;
}) {
  const chooseButton = useRef<HTMLButtonElement>(null);
  const [showOriginal, setShowOriginal] = useState(false), [choosing, setChoosing] = useState(false);
  const [count, setCount] = useState(material.page_count), [range, setRange] = useState(material.page_count === 1 ? '1' : '');
  const [exerciseType, setExerciseType] = useState<'CW' | 'HW'>('CW'), [lesson, setLesson] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const selected = materialPages(range, count);
  return <div className={styles.workControls}>
    {material.ext === '.pdf' && <button aria-expanded={showOriginal} onClick={() => setShowOriginal(value => !value)}>{showOriginal ? 'Hide original' : 'View original PDF'}</button>}
    {showOriginal && <MaterialOriginal material={material} scope={scope} pages={selected ?? []} onPageCount={setCount} />}
    {canAssign && material.ext === '.pdf' && <>
      <div className={styles.bar}>
        <label>Pages<input aria-label="Material pages" value={range} placeholder="e.g. 1-3, 5" onChange={event => { setRange(event.target.value); setChoosing(false); }} /></label>
        <label>Assign as<select aria-label="Material exercise type" value={exerciseType} onChange={event => setExerciseType(event.target.value as 'CW' | 'HW')}><option value="CW">Classwork</option><option value="HW">Homework</option></select></label>
      </div>
      {range && !selected && <p role="alert">Enter page numbers within this PDF{count ? ` (1–${count})` : ', after checking its page count'}.</p>}
      <div className={styles.actions}>
        <button disabled={!count} onClick={() => { setRange(count === 1 ? '1' : `1-${count}`); setChoosing(false); }}>Select all {count ?? ''} pages</button>
        <button ref={chooseButton} disabled={!selected} onClick={() => { setChoosing(value => !value); setNotice(''); }}>{choosing ? 'Hide lessons' : 'Choose a lesson'}</button>
      </div>
      {choosing && selected && <MaterialLessonPicker scope={scope} busy={lesson !== null} onChoose={session => setLesson(session.id)} />}
    </>}
    {notice && <p role="status">{notice}</p>}
    <details><summary>Other opening options</summary><button onClick={onLocalOpen}>Open through connected folders or Shelv</button></details>
    {lesson !== null && selected && <MaterialExerciseEditor scope={scope} sessionId={lesson} exerciseType={exerciseType}
      initialExercise={{ pdf_name: materialAliasPath(material.nas_path), pages: range }}
      onClose={() => setLesson(null)} onSave={() => { setChoosing(false); setNotice('Worksheet saved to the lesson.'); requestAnimationFrame(() => chooseButton.current?.focus()); }} />}
  </div>;
}

function MaterialExerciseEditor({ scope, sessionId, exerciseType, initialExercise, onClose, onSave }: {
  scope: string; sessionId: number; exerciseType: 'CW' | 'HW'; initialExercise: { pdf_name: string; pages: string };
  onClose: () => void; onSave: () => void;
}) {
  const session = useSWR(['material-assignment-session', scope, sessionId], () => sessionsAPI.getById(sessionId), { revalidateOnFocus: false, shouldRetryOnError: false });
  if (!session.data || session.isLoading || session.error) return <Modal isOpen onClose={onClose} title="Lesson exercises">
    {session.error ? <p role="alert">This lesson could not load. <button onClick={() => void session.mutate()}>Retry lesson</button></p> : <p role="status">Loading lesson exercises…</p>}
  </Modal>;
  return <ExerciseModal isOpen session={session.data} exerciseType={exerciseType} initialExercise={initialExercise} onClose={onClose} onSave={onSave} />;
}
