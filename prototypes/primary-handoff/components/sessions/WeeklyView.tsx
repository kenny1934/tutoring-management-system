"use client";

import { Clock, Users } from "lucide-react";
import type { Student } from "@/lib/types";
import { SessionStatus } from "@/lib/types";
import { getSessionStatusConfig } from "@/lib/session-status-config";
import { formatTimeSlot, type ClassMeeting } from "./meeting-utils";
import { DEMO_DAY } from "@/lib/mock-data/sessions";
import {
  addDaysIso,
  isoMondayOf,
  parseIsoDateUTC,
} from "@/lib/datetime";

type Props = {
  meetings: ClassMeeting[];
  /** Day used to choose which week to display. The week shown is the
   *  Mon-Sun range containing this date. */
  anchorDate: string;
  studentById: Map<string, Student>;
  onPick: (meeting: ClassMeeting) => void;
};

export function WeeklyView({ meetings, anchorDate, studentById, onPick }: Props) {
  const weekDays = buildWeek(anchorDate);
  const byDate = new Map<string, ClassMeeting[]>();
  for (const m of meetings) {
    const list = byDate.get(m.session_date) ?? [];
    list.push(m);
    byDate.set(m.session_date, list);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  // Anchor "Today" to the demo day so the marker matches the rest of the
  // prototype (which seeds around DEMO_DAY), not the host machine's clock.
  const todayIso = DEMO_DAY;

  return (
    <div className="surface-mc overflow-hidden">
      {/* Horizontal scroll on narrow screens so the 7 day-columns keep a
       *  usable width instead of crushing to ~50px on phones. Header and
       *  body share one scroll container so they stay aligned. */}
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
      <div className="grid grid-cols-7 border-b border-mc-line bg-ink-50">
        {weekDays.map((day) => {
          const isAnchor = day.iso === anchorDate;
          const isToday = day.iso === todayIso;
          return (
            <div
              key={day.iso}
              className={`px-2 py-2 border-r border-mc-line last:border-r-0 ${
                isAnchor ? "bg-mc-red-50" : ""
              }`}
            >
              <div className="text-[10px] uppercase tracking-wide text-ink-500 font-medium">
                {day.weekday}
              </div>
              <div className="flex items-baseline gap-1 min-w-0">
                <span
                  className={`text-lg font-semibold tabular-nums shrink-0 ${
                    isAnchor ? "text-mc-red-700" : "text-ink-900"
                  }`}
                >
                  {day.dayNum}
                </span>
                <span className="text-[10px] text-ink-400 truncate">
                  {day.month}
                </span>
                {isToday && (
                  <span className="ml-auto shrink-0 text-[9px] uppercase font-semibold tracking-wide text-mc-red-600">
                    Today
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-7 min-h-[420px]">
        {weekDays.map((day) => {
          const dayMeetings = byDate.get(day.iso) ?? [];
          const isAnchor = day.iso === anchorDate;
          return (
            <div
              key={day.iso}
              className={`p-2 space-y-1.5 border-r border-mc-line last:border-r-0 ${
                isAnchor ? "bg-mc-red-50/30" : "bg-white"
              }`}
            >
              {dayMeetings.length === 0 && (
                <div className="text-[10px] text-ink-300 text-center pt-4">
                  —
                </div>
              )}
              {dayMeetings.map((m) => (
                <MeetingChip
                  key={m.key}
                  meeting={m}
                  studentById={studentById}
                  onClick={() => onPick(m)}
                />
              ))}
            </div>
          );
        })}
      </div>
        </div>
      </div>
    </div>
  );
}

function MeetingChip({
  meeting,
  studentById,
  onClick,
}: {
  meeting: ClassMeeting;
  studentById: Map<string, Student>;
  onClick: () => void;
}) {
  const slot = formatTimeSlot(meeting.start_time, meeting.duration_mins);
  const attended = meeting.members.filter(
    (m) =>
      m.session_status === SessionStatus.ATTENDED ||
      m.session_status === SessionStatus.ATTENDED_MAKEUP
  ).length;
  const total = meeting.members.length;
  // Use the first member's status to colour the chip stripe — gives a
  // quick visual read of how the meeting is going. Mixed-status meetings
  // are rare enough in the seed that this is fine.
  const headStatus = meeting.members[0]?.session_status;
  const cfg = headStatus ? getSessionStatusConfig(headStatus) : null;
  const stripeCls = meeting.is_makeup
    ? "bg-mc-yellow-500"
    : cfg?.stripeClass ?? "bg-ink-300";

  // Compact list of student initials for at-a-glance "who's here today".
  const initials = meeting.members
    .map((m) => studentById.get(m.student_id))
    .filter(Boolean)
    .slice(0, 3)
    .map((s) =>
      s!.name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    );

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-md border border-mc-line bg-white hover:border-mc-line-strong hover:shadow-sm transition-shadow overflow-hidden"
    >
      <div className="flex">
        <span className={`w-1 ${stripeCls}`} aria-hidden />
        <div className="flex-1 px-2 py-1.5 min-w-0">
          <div className="flex items-center gap-1 text-[10px] text-ink-700 font-medium tabular-nums">
            <Clock className="h-2.5 w-2.5" />
            {slot}
          </div>
          <div className="text-[11px] font-semibold text-ink-900 truncate">
            {meeting.tutor_name}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-500">
            <Users className="h-2.5 w-2.5" />
            <span className="tabular-nums">
              {attended}/{total}
            </span>
            <span className="ml-1 text-ink-400 truncate">
              {initials.join(" · ")}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

type WeekDay = {
  iso: string;
  weekday: string;
  dayNum: string;
  month: string;
};

/** Mon-Sun week containing `anchor`. UTC arithmetic so the displayed week
 *  doesn't drift when the host browser isn't in HKT. */
function buildWeek(anchor: string): WeekDay[] {
  const monday = isoMondayOf(anchor);
  const out: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const iso = addDaysIso(monday, i);
    const d = parseIsoDateUTC(iso);
    out.push({
      iso,
      weekday: d.toLocaleDateString("en-HK", {
        weekday: "short",
        timeZone: "UTC",
      }),
      dayNum: String(d.getUTCDate()),
      month: d.toLocaleDateString("en-HK", {
        month: "short",
        timeZone: "UTC",
      }),
    });
  }
  return out;
}
