import type { Session } from "@/lib/types";
import { SessionStatus } from "@/lib/types";

/** UI-only grouping: many per-student Session rows that share
 *  (tutor, date, time_slot) display as one card. CSM has no class entity,
 *  so meeting identity is derived purely from "who is teaching when".
 *  Kept as a derived view; not stored. */
export type ClassMeeting = {
  key: string;
  session_date: string;
  start_time: string;
  duration_mins: number;
  room: string;
  tutor_name: string;
  tutor_id: string;
  lesson_number: number;
  is_makeup: boolean;
  class_wide_note?: string;
  members: Session[];
};

export function groupByMeeting(sessions: Session[]): ClassMeeting[] {
  const map = new Map<string, ClassMeeting>();
  for (const s of sessions) {
    const key = `${s.tutor_id}|${s.session_date}|${s.start_time}`;
    const existing = map.get(key);
    if (existing) {
      existing.members.push(s);
      if (
        s.session_status === SessionStatus.MAKEUP_CLASS ||
        s.session_status === SessionStatus.ATTENDED_MAKEUP
      ) {
        existing.is_makeup = true;
      }
      if (!existing.class_wide_note && s.class_wide_note) {
        existing.class_wide_note = s.class_wide_note;
      }
    } else {
      map.set(key, {
        key,
        session_date: s.session_date,
        start_time: s.start_time,
        duration_mins: s.duration_mins,
        room: s.room,
        tutor_name: s.tutor_name,
        tutor_id: s.tutor_id,
        lesson_number: s.lesson_number,
        is_makeup:
          s.session_status === SessionStatus.MAKEUP_CLASS ||
          s.session_status === SessionStatus.ATTENDED_MAKEUP,
        class_wide_note: s.class_wide_note,
        members: [s],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.session_date !== b.session_date)
      return a.session_date.localeCompare(b.session_date);
    return a.start_time.localeCompare(b.start_time);
  });
}

/** "16:00 - 17:30", 24-hour zero-padded, space-dash-space. Matches CSM's
 *  stored time_slot format (database/seed_summer_2025.py). */
export function formatTimeSlot(
  start_time: string,
  duration_mins: number
): string {
  const [hStr, mStr] = start_time.split(":");
  const startMins = Number(hStr) * 60 + Number(mStr);
  const endMins = startMins + duration_mins;
  const pad = (n: number) => String(n).padStart(2, "0");
  // Wraps past midnight silently, primary sessions all end before 21:00,
  // so this hasn't bitten. If sessions are ever scheduled past midnight,
  // surface the next-day boundary in the label.
  const end = `${pad(Math.floor(endMins / 60) % 24)}:${pad(endMins % 60)}`;
  const start = `${pad(Number(hStr))}:${pad(Number(mStr))}`;
  return `${start} - ${end}`;
}

/** Lightweight color map for primary grade badges. Just enough variety to
 *  visually distinguish grades on the card. */
export function gradeBadgeStyle(grade: string): string {
  switch (grade) {
    case "P1":
    case "P2":
      return "bg-blue-100 text-blue-700";
    case "P3":
    case "P4":
      return "bg-emerald-100 text-emerald-700";
    case "P5":
      return "bg-purple-100 text-purple-700";
    case "P6":
      return "bg-mc-peach-100 text-mc-peach-600";
    default:
      return "bg-ink-100 text-ink-700";
  }
}
