import type { ChecktableAssignment, Session, Student } from "@/lib/types";

export function getInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  // Whitespace-split first (Romanised names → first letter of given + family).
  // Chinese names like "陳浩賢" carry no spaces; fall back to the first two
  // characters of the name.
  if (parts.length > 1) {
    return parts
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");
  }
  return Array.from(name).slice(0, 2).join("").toUpperCase();
}

export function getPendingCount(
  studentId: string,
  assignments: ChecktableAssignment[]
): number {
  return assignments.filter(
    (a) => a.studentId === studentId && a.status === "assigned"
  ).length;
}

export function getNextSession(
  studentId: string,
  sessions: Session[],
  todayIso: string
): Session | null {
  return (
    sessions
      .filter((s) => s.student_id === studentId && s.session_date >= todayIso)
      .sort((a, b) => {
        if (a.session_date !== b.session_date)
          return a.session_date.localeCompare(b.session_date);
        return a.start_time.localeCompare(b.start_time);
      })[0] ?? null
  );
}

export function getLastSession(
  studentId: string,
  sessions: Session[],
  todayIso: string
): Session | null {
  return (
    sessions
      .filter((s) => s.student_id === studentId && s.session_date < todayIso)
      .sort((a, b) => {
        if (a.session_date !== b.session_date)
          return b.session_date.localeCompare(a.session_date);
        return b.start_time.localeCompare(a.start_time);
      })[0] ?? null
  );
}

/** Coarse human-readable "n days/weeks/months ago" — driven off DEMO_DAY so
 *  the prototype reads consistently regardless of wall-clock. */
export function daysAgoLabel(iso: string, todayIso: string): string {
  const today = new Date(`${todayIso}T00:00:00+08:00`);
  const then = new Date(`${iso}T00:00:00+08:00`);
  const days = Math.round((today.getTime() - then.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const w = Math.round(days / 7);
    return `${w} ${w === 1 ? "week" : "weeks"} ago`;
  }
  const m = Math.round(days / 30);
  return `${m} ${m === 1 ? "month" : "months"} ago`;
}

export function daysUntilLabel(iso: string, todayIso: string): string {
  const today = new Date(`${todayIso}T00:00:00+08:00`);
  const then = new Date(`${iso}T00:00:00+08:00`);
  const days = Math.round((then.getTime() - today.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  const w = Math.round(days / 7);
  return `in ${w} ${w === 1 ? "week" : "weeks"}`;
}

export function formatSessionTime(s: Session): string {
  const d = new Date(`${s.session_date}T${s.start_time}:00+08:00`);
  const weekday = d.toLocaleDateString("en-HK", { weekday: "short" });
  const time = d
    .toLocaleTimeString("en-HK", { hour: "numeric", minute: "2-digit" })
    .toLowerCase();
  return `${weekday} ${time}`;
}

/** Sort by code (string compare is fine for "1001", "1002" style codes). */
export function sortByCode(a: Student, b: Student): number {
  return a.code.localeCompare(b.code);
}
