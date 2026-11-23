"use client";
import { useEffect, useRef, useState } from 'react';
import { Calendar, BookOpen, Phone, User, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useLocation } from '@/contexts/LocationContext';
import { searchDate, type SearchCategory } from './search-filters';
import styles from './SearchSurface.module.css';

export function StudentSearchShortcuts({ student, onNavigate, onRecords, onSession, tutorId }: {
  student: { id: number; student_name: string }; tutorId?: number; onNavigate: (href: string) => void;
  onRecords: (category: SearchCategory, student: { id: number; name: string }) => void; onSession: (id: number) => void;
}) {
  const { selectedLocation } = useLocation();
  const alive = useRef(true);
  const requestScope = `${student.id}:${selectedLocation}:${tutorId ?? "centre"}`;
  const currentScope = useRef(requestScope); currentScope.current = requestScope;
  useEffect(() => { alive.current = true; setState('idle'); return () => { alive.current = false; }; }, [student.id, selectedLocation, tutorId]);
  const [state, setState] = useState<'idle' | 'loading' | 'empty' | 'error'>('idle');
  const nextLesson = async () => {
    setState('loading');
    try {
      const results = await api.stats.search('', selectedLocation, 1, true, { category: 'sessions', student_id: student.id, from_date: searchDate(), status: 'upcoming', ...(tutorId ? { tutor_id: tutorId } : {}) });
      if (!alive.current || currentScope.current !== requestScope) return;
      if (results.sessions.length) { setState('idle'); onSession(results.sessions[0].id); }
      else setState('empty');
    } catch { if (alive.current && currentScope.current === requestScope) setState('error'); }
  };
  return <div className={styles.studentActions} aria-label="Student shortcuts">
    <button disabled={state === 'loading'} onClick={() => void nextLesson()}><Calendar size={14} /><span>{state === 'loading' ? 'Finding next lesson...' : tutorId ? 'Your next lesson' : 'Next lesson'}</span><ArrowRight size={12} /></button>
    {state === 'empty' && <p role="status">No upcoming lesson at {selectedLocation === 'All Locations' ? 'any centre' : selectedLocation}.</p>}
    {state === 'error' && <p role="alert">Could not find the next lesson. Try again.</p>}
    <button onClick={() => onRecords('sessions', { id: student.id, name: student.student_name })}><Calendar size={14} /><span>{tutorId ? "Your lesson history" : "Lesson history"}</span><ArrowRight size={12} /></button>
    <button onClick={() => onRecords('enrollments', { id: student.id, name: student.student_name })}><BookOpen size={14} /><span>Enrolments</span><ArrowRight size={12} /></button>
    <button onClick={() => onNavigate(`/students/${student.id}?tab=contacts`)}><Phone size={14} /><span>Parent contacts</span><ArrowRight size={12} /></button>
    <button onClick={() => onNavigate(`/students/${student.id}`)}><User size={14} /><span>Open student profile</span><ArrowRight size={12} /></button>
  </div>;
}
