"use client";

import { Coffee, CalendarCheck, SearchX, Users, Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface IllustrationProps {
  className?: string;
}

// The empty states used to be drawn illustrations (a coffee cup, a cloud with
// rosy cheeks and so on), which read as a classroom toy and turned into bright
// blobs in dark mode. They are now one plain grey line icon, the same quiet
// empty state the inbox, settings and curriculum already use. The names stay
// so the screens that use them don't change. Width and height classes from
// the old drawings are dropped, so every empty state icon is the same size.
function EmptyIcon({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  const rest = className?.split(/\s+/).filter((c) => !/^(w|h)-/.test(c)).join(" ");
  return <Icon className={cn("h-8 w-8 text-ink-subtle", rest)} strokeWidth={1.5} aria-hidden="true" />;
}

/** "No sessions today". */
export function NoSessionsToday({ className }: IllustrationProps) {
  return <EmptyIcon icon={Coffee} className={className} />;
}

/** "No tests coming up". */
export function NoUpcomingTests({ className }: IllustrationProps) {
  return <EmptyIcon icon={CalendarCheck} className={className} />;
}

/** A search that found nothing. */
export function SearchNoResults({ className }: IllustrationProps) {
  return <EmptyIcon icon={SearchX} className={className} />;
}

/** No students match. */
export function NoStudentsFound({ className }: IllustrationProps) {
  return <EmptyIcon icon={Users} className={className} />;
}

/** Any other "nothing here" list. */
export function EmptyCloud({ className }: IllustrationProps) {
  return <EmptyIcon icon={Inbox} className={className} />;
}
