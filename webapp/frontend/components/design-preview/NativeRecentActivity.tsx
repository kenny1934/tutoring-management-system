"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { useActivityFeed, useTutors } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
import { NativeActivityRows } from "./NativeActivityRows";
import { NativeActivityHistory } from "./NativeActivityHistory";
import styles from "./NativePreview.module.css";

export function NativeRecentActivity({ tutorId, className }: { tutorId?: number; className?: string }) {
  const { selectedLocation } = useLocation();
  const scope = `${selectedLocation}:${tutorId ?? "all"}`;
  return <Activity key={scope} scope={scope} tutorId={tutorId} location={selectedLocation} className={className} />;
}

function Activity({ scope, tutorId, location, className }: { scope: string; tutorId?: number; location: string; className?: string }) {
  const { data: events, isLoading, error, mutate } = useActivityFeed(location, tutorId, 10);
  const { data: tutors } = useTutors();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    // The phone background becomes inert while opening, which can blur the
    // source before the shared sheet captures focus. The caller owns this return.
    if (wasOpen.current && !open && document.activeElement === document.body) trigger.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);
  return <div data-native-activity-panel className={className}>
    <header className={styles.activityHeading}>
      <h3><Clock aria-hidden="true" />Recent activity</h3>
      <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setOpen(true); }}>View all</button>
    </header>
    {error && <div className={styles.activityError} role="status">Couldn’t load activity. <button type="button" onClick={() => void mutate()}>Try again</button></div>}
    {isLoading && !events ? <div className={styles.activitySkeleton} aria-label="Loading activity">{[0, 1, 2, 3].map(id => <div key={id} className="shimmer-sepia" />)}</div>
      : events?.length ? <NativeActivityRows events={events} tutors={tutors} location={location} arrivalKey={scope} />
        : !error && <p className={styles.activityEmpty}>No recent activity</p>}
    {open && <NativeActivityHistory scope={scope} tutorId={tutorId} location={location} onClose={() => setOpen(false)} />}
  </div>;
}
