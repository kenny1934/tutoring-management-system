"use client";
import { useId, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getMonthCalendarDates, getPreviousMonth, getNextMonth, toDateString } from '@/lib/calendar-utils';
import styles from './MaterialSearch.module.css';

export function MaterialDateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const [month, setMonth] = useState(() => new Date(`${from || to || toDateString(new Date())}T12:00:00`));
  const id = useId();
  const [activeDate, setActiveDate] = useState(from || to || toDateString(new Date()));
  const dates = getMonthCalendarDates(month);
  const tabStop = dates.some(date => toDateString(date) === activeDate) ? activeDate : toDateString(new Date(month.getFullYear(), month.getMonth(), 1));
  const pickingEnd = !!from && !to;
  const select = (value: string) => {
    if (!from || to || value < from) onChange(value, '');
    else onChange(from, value);
  };
  return <div className={styles.dateRange}>
    <div className={styles.rangeInputs}>
      <label>From<input type="date" aria-label="Modified from" value={from} onChange={event => { onChange(event.target.value, to); if (event.target.value) setMonth(new Date(`${event.target.value}T12:00:00`)); }} /></label>
      <label>Through<input type="date" aria-label="Modified through" value={to} onChange={event => { onChange(from, event.target.value); if (event.target.value) setMonth(new Date(`${event.target.value}T12:00:00`)); }} /></label>
    </div>
    <div className={styles.calendarHeader}>
      <button type="button" aria-label="Previous month" onClick={() => setMonth(getPreviousMonth(month))}><ChevronLeft size={16} /></button>
      <span aria-live="polite">{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
      <button type="button" aria-label="Next month" onClick={() => setMonth(getNextMonth(month))}><ChevronRight size={16} /></button>
    </div>
    <div className={styles.rangeCalendar} role="group" aria-label={pickingEnd ? 'Choose end date' : 'Choose start date'} onKeyDown={event => {
      const value = (event.target as HTMLElement).getAttribute('data-date');
      if (!value || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
      event.preventDefault();
      const next = new Date(`${value}T12:00:00`);
      const days = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -next.getDay(), End: 6 - next.getDay() } as Record<string, number>)[event.key];
      if (days !== undefined) next.setDate(next.getDate() + days);
      else {
        const day = next.getDate(); next.setDate(1); next.setMonth(next.getMonth() + (event.key === 'PageUp' ? -1 : 1));
        next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      }
      const nextValue = toDateString(next); setActiveDate(nextValue); setMonth(next);
      requestAnimationFrame(() => document.getElementById(`${id}-${nextValue}`)?.focus());
    }}>
      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span key={day} aria-hidden="true">{day}</span>)}
      {dates.map(date => {
        const value = toDateString(date), selected = value === from || value === to, inside = !!(from && to && value > from && value < to);
        return <button key={value} id={`${id}-${value}`} data-date={value} tabIndex={value === tabStop ? 0 : -1} onFocus={() => setActiveDate(value)} type="button" aria-label={date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          aria-pressed={selected} data-between={inside || undefined} data-outside={date.getMonth() !== month.getMonth() || undefined} onClick={() => select(value)}>{date.getDate()}</button>;
      })}
    </div>
  </div>;
}
