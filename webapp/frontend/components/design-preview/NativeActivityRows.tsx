"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, DollarSign, UserPlus, XCircle } from "lucide-react";
import { formatActivityDate, formatActivityTime, formatFullTimestamp } from "@/lib/formatters";
import { getAppScroller } from "@/lib/scroll";
import type { ActivityEvent, Tutor } from "@/types";
import { useNativeNavigationMemory } from "./NativeNavigationMemory";
import styles from "./NativePreview.module.css";

const icons = {
  session_attended: CheckCircle2, makeup_completed: CheckCircle2,
  payment_received: DollarSign, new_enrollment: UserPlus,
  session_cancelled: XCircle, session_rescheduled: CalendarClock,
  sick_leave: AlertTriangle, weather_cancelled: AlertTriangle, makeup_booked: Clock,
};

type ReadActivity = { ids: string[]; latest: number };

export function NativeActivityRows({ events, tutors = [], location, arrivalKey, onNavigate }: {
  events: ActivityEvent[];
  tutors?: Tutor[];
  location: string;
  /** Only the recent feed animates new updates. Loading older history stays still. */
  arrivalKey?: string;
  onNavigate?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const memory = useNativeNavigationMemory();
  const local = useRef<ReadActivity | undefined>(undefined);
  useLayoutEffect(() => {
    if (!arrivalKey || !events.length) return;
    const key = `dashboard:activity-read:${arrivalKey}`;
    const before = memory?.get<ReadActivity>(key) ?? local.current;
    const seen = new Set(before?.ids);
    const latest = Math.max(before?.latest ?? 0, ...events.map(event => Date.parse(event.timestamp) || 0));
    const fresh = events.filter(event => !seen.has(event.id) && Date.parse(event.timestamp) >= (before?.latest ?? 0));
    events.forEach(event => seen.add(event.id));
    const next = { ids: [...seen].slice(-500), latest };
    local.current = next; memory?.set(key, next);
    const main = getAppScroller();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!before || reduced.matches || main?.inert || main?.dataset.nativeSessionOpen) return;
    const ids = new Set(fresh.map(event => event.id));
    const viewport = main?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const animations: Animation[] = [];
    for (const row of root.current?.querySelectorAll<HTMLElement>("[data-activity-row]") ?? []) {
      const rect = row.getBoundingClientRect();
      if (ids.has(row.dataset.activityRow!) && rect.bottom > viewport.top && rect.top < viewport.bottom && row.animate) {
        animations.push(row.animate([{ opacity: .55, translate: "0 -4px" }, { opacity: 1, translate: "0 0" }], { duration: 180, easing: "ease-out" }));
      }
    }
    const cancel = () => animations.forEach(animation => animation.cancel());
    const motionChanged = () => { if (reduced.matches) cancel(); };
    reduced.addEventListener("change", motionChanged);
    return () => { cancel(); reduced.removeEventListener("change", motionChanged); };
  }, [events, arrivalKey, memory]);

  const groups = new Map<string, ActivityEvent[]>();
  events.forEach(event => {
    const date = formatActivityDate(new Date(event.timestamp));
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date)!.push(event);
  });
  const actorName = (email: string) => tutors.find(tutor => tutor.user_email === email)?.tutor_name ?? email.split("@")[0];

  return <div ref={root} className={styles.activityList} data-activity-history={!!onNavigate || undefined} data-activity-actors={events.some(event => event.modified_by) || undefined}>
    {[...groups].map(([date, rows]) => <section key={date} className={styles.activityDay} aria-label={date}>
      <h4>{date}</h4>
      <ol>
        {rows.map(event => {
          const Icon = icons[event.type] ?? Clock;
          const time = new Date(event.timestamp);
          const id = event.school_student_id ? `${location === "All Locations" && event.location ? `${event.location}-` : ""}${event.school_student_id}` : "";
          const content = <>
            <Icon className={styles.activityIcon} data-activity-type={event.type} aria-hidden="true" />
            <div className={styles.activityIdentity}>
              <span>{event.student || event.title}</span>
              {id && <span className={styles.activityStudentId}>{id}</span>}
            </div>
            <div className={styles.activityDescription}>
              {event.student && <span>{event.title}</span>}
              {event.description && <span>{event.description}</span>}
            </div>
            <div className={styles.activityMeta}>
              <time dateTime={event.timestamp} title={formatFullTimestamp(time)}>{formatActivityTime(time)}</time>
              {event.modified_by && <span>{actorName(event.modified_by)}</span>}
            </div>
          </>;
          return <li key={event.id} data-activity-row={event.id}>
            {event.link ? <Link href={event.link} className={styles.activityEntry} onClick={onNavigate}>{content}</Link>
              : <div className={styles.activityEntry}>{content}</div>}
          </li>;
        })}
      </ol>
    </section>)}
  </div>;
}
