"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, Users, ArrowRight, X } from "lucide-react";
import Link from "next/link";
import type { Student } from "@/lib/types";
import { SessionStatus, type SessionStatusValue } from "@/lib/types";
import { getSessionStatusConfig } from "@/lib/session-status-config";
import { formatTimeSlot, gradeBadgeStyle, type ClassMeeting } from "./meeting-utils";
import { DEMO_DAY } from "@/lib/mock-data/sessions";
import { useModalA11y } from "@/lib/useModalA11y";
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
  /** Active tutor filter ("all" or a tutor id). When a single tutor is
   *  selected, the tutor name is dropped from chips (it's redundant). */
  tutorFilter: string;
  /** Drill into the day's list view for a meeting (from the peek popover). */
  onPick: (meeting: ClassMeeting) => void;
};

// Vertical scale of the time grid. 56px/hour keeps a 90-min slot ~84px tall —
// enough for two text lines without the week getting unwieldy on screen.
const HOUR_PX = 56;
const RAIL_W = 52;
// Default visible window for a primary centre (afternoon → early evening).
// Expanded automatically if the week has sessions outside it.
const DEFAULT_START_MIN = 15 * 60;
const DEFAULT_END_MIN = 21 * 60;

export function WeeklyView({
  meetings,
  anchorDate,
  studentById,
  tutorFilter,
  onPick,
}: Props) {
  const weekDays = buildWeek(anchorDate);
  const weekIsoSet = new Set(weekDays.map((d) => d.iso));

  const byDate = new Map<string, ClassMeeting[]>();
  for (const m of meetings) {
    if (!weekIsoSet.has(m.session_date)) continue;
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
  const showTutor = tutorFilter === "all";

  // Day span: start from the default afternoon window, widen to cover any
  // session that falls outside it so nothing is ever clipped.
  let minStart = DEFAULT_START_MIN;
  let maxEnd = DEFAULT_END_MIN;
  for (const list of byDate.values()) {
    for (const m of list) {
      const s = toMinutes(m.start_time);
      minStart = Math.min(minStart, s);
      maxEnd = Math.max(maxEnd, s + m.duration_mins);
    }
  }
  const startHour = Math.floor(minStart / 60);
  const endHour = Math.ceil(maxEnd / 60);
  const gridStartMin = startHour * 60;
  const gridHeight = (endHour - startHour) * HOUR_PX;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  const [peek, setPeek] = useState<PeekState | null>(null);

  const openPeek = (meeting: ClassMeeting, anchorEl: HTMLElement) => {
    const r = anchorEl.getBoundingClientRect();
    setPeek({ meeting, rect: { top: r.top, left: r.left, bottom: r.bottom, right: r.right } });
  };

  return (
    <>
      {/* Desktop: time-axis grid. Hidden on phones where it would need to
       *  horizontally scroll (defeating the at-a-glance week overview). */}
      <div className="surface-mc overflow-hidden hidden sm:block">
        {/* Header row. A spacer the width of the hour rail keeps the 7 day
         *  headers aligned with the columns below. */}
        <div className="flex border-b border-mc-line bg-ink-50">
          <div style={{ width: RAIL_W }} className="shrink-0 border-r border-mc-line" />
          <div className="grid grid-cols-7 flex-1">
            {weekDays.map((day) => (
              <DayHeader
                key={day.iso}
                day={day}
                isToday={day.iso === todayIso}
                isAnchor={day.iso === anchorDate}
                isPast={day.iso < todayIso}
                count={(byDate.get(day.iso) ?? []).length}
              />
            ))}
          </div>
        </div>

        <div className="flex">
          {/* Hour rail */}
          <div
            style={{ width: RAIL_W, height: gridHeight }}
            className="relative shrink-0 border-r border-mc-line bg-white"
          >
            {hours.map((h, i) => {
              // Center labels on their gridline, but top-align the first and
              // bottom-align the last so neither clips at the grid edges.
              const isFirst = i === 0;
              const isLast = i === hours.length - 1;
              const translate = isFirst
                ? "translate-y-0"
                : isLast
                  ? "-translate-y-full"
                  : "-translate-y-1/2";
              return (
                <div
                  key={h}
                  style={{ top: (h - startHour) * HOUR_PX }}
                  className={`absolute right-1.5 ${translate} text-[10px] tabular-nums text-ink-400`}
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              );
            })}
          </div>

          {/* Day columns */}
          <div className="grid grid-cols-7 flex-1">
            {weekDays.map((day) => {
              const dayMeetings = byDate.get(day.iso) ?? [];
              const placed = layoutDay(dayMeetings);
              const isToday = day.iso === todayIso;
              const isPast = day.iso < todayIso;
              return (
                <div
                  key={day.iso}
                  style={{ height: gridHeight }}
                  className={`relative border-r border-mc-line last:border-r-0 ${
                    isToday ? "bg-mc-red-50/20" : isPast ? "bg-ink-50/40" : "bg-white"
                  }`}
                >
                  {/* Hour gridlines */}
                  {hours.slice(1).map((h) => (
                    <div
                      key={h}
                      style={{ top: (h - startHour) * HOUR_PX }}
                      className="absolute inset-x-0 border-t border-mc-line/60"
                    />
                  ))}
                  {placed.map(({ meeting, lane, cols }) => {
                    const top = ((toMinutes(meeting.start_time) - gridStartMin) / 60) * HOUR_PX;
                    const height = Math.max((meeting.duration_mins / 60) * HOUR_PX, 40);
                    return (
                      <div
                        key={meeting.key}
                        style={{
                          position: "absolute",
                          top,
                          height,
                          left: `calc(${(lane / cols) * 100}% + 3px)`,
                          width: `calc(${(1 / cols) * 100}% - 6px)`,
                        }}
                      >
                        <MeetingChip
                          meeting={meeting}
                          studentById={studentById}
                          showTutor={showTutor}
                          onOpen={openPeek}
                          fill
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile: vertical agenda. One section per day, no horizontal scroll so
       *  the whole week stays a single down-swipe. */}
      <div className="space-y-2 sm:hidden">
        {weekDays.map((day) => {
          const dayMeetings = byDate.get(day.iso) ?? [];
          const isToday = day.iso === todayIso;
          const isPast = day.iso < todayIso;
          if (dayMeetings.length === 0) {
            return (
              <div
                key={day.iso}
                className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-ink-400"
              >
                <span className="font-semibold uppercase tracking-wide">{day.weekday}</span>
                <span className="tabular-nums">{day.dayNum}</span>
                <span className="text-ink-300">· no sessions</span>
              </div>
            );
          }
          return (
            <div key={day.iso} className="surface-mc overflow-hidden">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 border-b border-mc-line ${
                  isToday ? "bg-mc-red-50" : isPast ? "bg-ink-50" : "bg-ink-50/70"
                }`}
              >
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wide ${
                    isToday ? "text-mc-red-700" : "text-ink-600"
                  }`}
                >
                  {day.weekday}
                </span>
                <span
                  className={`text-base font-bold tabular-nums ${
                    isToday ? "text-mc-red-700" : "text-ink-900"
                  }`}
                >
                  {day.dayNum}
                </span>
                <span className="text-[11px] text-ink-400">{day.month}</span>
                {isToday && (
                  <span className="ml-auto text-[9px] uppercase font-semibold tracking-wide text-mc-red-600">
                    Today
                  </span>
                )}
              </div>
              <div className="p-2 space-y-1.5">
                {dayMeetings.map((m) => (
                  <MeetingChip
                    key={m.key}
                    meeting={m}
                    studentById={studentById}
                    showTutor={showTutor}
                    onOpen={openPeek}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {peek && (
        <ChipPeekPopover
          state={peek}
          studentById={studentById}
          showTutor={showTutor}
          onClose={() => setPeek(null)}
          onOpenInList={() => {
            const m = peek.meeting;
            setPeek(null);
            onPick(m);
          }}
        />
      )}
    </>
  );
}

function DayHeader({
  day,
  isToday,
  isAnchor,
  isPast,
  count,
}: {
  day: WeekDay;
  isToday: boolean;
  isAnchor: boolean;
  isPast: boolean;
  count: number;
}) {
  return (
    <div
      className={`px-2 py-2 border-r border-mc-line last:border-r-0 ${
        isToday ? "bg-mc-red-50" : ""
      } ${isAnchor && !isToday ? "ring-1 ring-inset ring-ink-300" : ""}`}
    >
      <div
        className={`text-[10px] uppercase tracking-wide font-medium ${
          isToday ? "text-mc-red-600" : isPast ? "text-ink-400" : "text-ink-500"
        }`}
      >
        {day.weekday}
      </div>
      <div className="flex items-baseline gap-1 min-w-0">
        <span
          className={`text-lg font-semibold tabular-nums shrink-0 ${
            isToday ? "text-mc-red-700" : isPast ? "text-ink-500" : "text-ink-900"
          }`}
        >
          {day.dayNum}
        </span>
        <span className="text-[10px] text-ink-400 truncate">{day.month}</span>
        {isToday ? (
          <span className="ml-auto shrink-0 text-[9px] uppercase font-semibold tracking-wide text-mc-red-600">
            Today
          </span>
        ) : count > 0 ? (
          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-ink-400">
            {count}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** One meeting as a clickable card. Used both absolutely-positioned in the
 *  desktop grid (`fill` → fills its wrapper) and in-flow in the mobile agenda. */
function MeetingChip({
  meeting,
  studentById,
  showTutor,
  onOpen,
  fill = false,
}: {
  meeting: ClassMeeting;
  studentById: Map<string, Student>;
  showTutor: boolean;
  onOpen: (meeting: ClassMeeting, anchorEl: HTMLElement) => void;
  fill?: boolean;
}) {
  const slot = formatTimeSlot(meeting.start_time, meeting.duration_mins);
  // In the grid the chip height already encodes duration, and lanes can be
  // narrow, so show just the start time there; the full range stays in the
  // (full-width) agenda and the popover.
  const timeText = fill ? meeting.start_time : slot;
  const attended = meeting.members.filter(
    (m) =>
      m.session_status === SessionStatus.ATTENDED ||
      m.session_status === SessionStatus.ATTENDED_MAKEUP
  ).length;
  const total = meeting.members.length;
  const stripe = meetingStripe(meeting);

  const members = meeting.members
    .map((m) => studentById.get(m.student_id))
    .filter(Boolean) as Student[];
  const aria = `${meeting.start_time} ${meeting.tutor_name}, ${attended} of ${total} attended, ${total} ${
    total === 1 ? "student" : "students"
  }`;

  return (
    <button
      onClick={(e) => onOpen(meeting, e.currentTarget)}
      aria-label={aria}
      className={`group w-full text-left rounded-md border border-mc-line bg-white hover:border-mc-line-strong hover:shadow-sm transition-shadow overflow-hidden ${
        fill ? "h-full" : ""
      }`}
    >
      <div className="flex h-full">
        <span className={`w-1 shrink-0 ${stripe}`} aria-hidden />
        <div className={`flex-1 min-w-0 ${fill ? "px-1 py-0.5" : "px-1.5 py-1"}`}>
          {/* Time gets the full row so it never loses out to the count. In the
           *  grid the clock icon is dropped (everything is time-positioned) to
           *  buy width for the time itself in narrow overlap lanes. */}
          <div className="flex items-center gap-1 text-[10px] text-ink-700 font-semibold tabular-nums min-w-0">
            {!fill && <Clock className="h-2.5 w-2.5 shrink-0" />}
            <span className="truncate">{timeText}</span>
          </div>
          <MemberSummary members={members} attended={attended} total={total} />
          {showTutor && (
            <div className="mt-0.5 text-[10px] text-ink-400 truncate">
              {meeting.tutor_name}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

/** Compact "who's here" line — promotes students over the (often-redundant)
 *  tutor name, and carries the attended/total count as a fixed right-anchor so
 *  it survives even when the lane is narrow. One student → name + grade badge;
 *  several → grade badges that clip cleanly behind a +N overflow. */
function MemberSummary({
  members,
  attended,
  total,
}: {
  members: Student[];
  attended: number;
  total: number;
}) {
  const count = (
    <span
      className={`ml-auto shrink-0 tabular-nums text-[10px] font-medium ${
        attended === total && total > 0 ? "text-good" : "text-ink-400"
      }`}
    >
      {attended}/{total}
    </span>
  );

  if (members.length === 0) {
    return (
      <div className="mt-0.5 flex items-center gap-1 min-w-0">
        <span className="text-[10px] text-ink-300 truncate">No students</span>
        {count}
      </div>
    );
  }

  if (members.length === 1) {
    const s = members[0];
    return (
      <div className="mt-0.5 flex items-center gap-1 min-w-0">
        {/* badge + name share a clipping group so the count (shrink-0) is
         *  never pushed out of a narrow lane. */}
        <div className="flex items-center gap-1 min-w-0 overflow-hidden">
          <span
            className={`text-[9px] font-medium rounded px-1 py-px shrink-0 ${gradeBadgeStyle(
              s.grade
            )}`}
          >
            {s.grade}
          </span>
          <span className="min-w-0 text-[11px] font-medium text-ink-800 truncate">
            {s.name}
          </span>
        </div>
        {count}
      </div>
    );
  }

  // Multiple: show as many grade badges as fit (they clip behind the +N and
  // count, both shrink-0 so they never get pushed out). +N reflects everyone
  // not shown, derived from total so it's correct even mid-clip.
  const shown = members.slice(0, 3);
  const extra = total - shown.length;
  return (
    <div className="mt-0.5 flex items-center gap-1 min-w-0">
      <Users className="h-2.5 w-2.5 text-ink-400 shrink-0" />
      <div className="flex items-center gap-0.5 min-w-0 overflow-hidden">
        {shown.map((s) => (
          <span
            key={s.id}
            title={s.name}
            className={`text-[9px] font-medium rounded px-1 py-px shrink-0 ${gradeBadgeStyle(
              s.grade
            )}`}
          >
            {s.grade}
          </span>
        ))}
      </div>
      {extra > 0 && (
        <span className="text-[9px] text-ink-400 shrink-0">+{extra}</span>
      )}
      {count}
    </div>
  );
}

type PeekState = {
  meeting: ClassMeeting;
  rect: { top: number; left: number; bottom: number; right: number };
};

/** Lightweight detail popover anchored to a clicked chip. Keeps the weekly
 *  context (vs. jumping straight to the list) while still offering a one-click
 *  drill-in. */
function ChipPeekPopover({
  state,
  studentById,
  showTutor,
  onClose,
  onOpenInList,
}: {
  state: PeekState;
  studentById: Map<string, Student>;
  showTutor: boolean;
  onClose: () => void;
  onOpenInList: () => void;
}) {
  const { meeting, rect } = state;
  const { dialogRef, onKeyDownTrap } = useModalA11y({ onClose });
  const slot = formatTimeSlot(meeting.start_time, meeting.duration_mins);

  // Position below the chip, clamped into the viewport. Anchored fixed so it
  // escapes the grid's overflow + any ancestor opacity.
  const WIDTH = 264;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const left = Math.min(Math.max(8, rect.left), vw - WIDTH - 8);
  const top = rect.bottom + 6;

  // Outside-click (the hook handles Escape + focus).
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!dialogRef.current?.contains(e.target as Node)) onClose();
    }
    // Defer so the opening click doesn't immediately close it.
    const id = window.setTimeout(
      () => document.addEventListener("mousedown", onDown),
      0
    );
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
    };
  }, [dialogRef, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${slot} session details`}
      tabIndex={-1}
      onKeyDown={onKeyDownTrap}
      style={{ position: "fixed", top, left, width: WIDTH }}
      className="z-50 bg-white border border-mc-line rounded-lg shadow-xl overflow-hidden"
    >
      <div
        className={`flex items-center gap-2 px-3 py-2 border-b border-mc-line ${
          meeting.is_makeup ? "bg-mc-yellow-50" : "bg-ink-50"
        }`}
      >
        <Clock className="h-3.5 w-3.5 text-ink-500 shrink-0" />
        <span className="text-[13px] font-bold text-ink-900 tabular-nums">{slot}</span>
        {meeting.is_makeup && (
          <span className="text-[9px] rounded bg-mc-yellow-500 text-ink-900 px-1 py-px font-semibold">
            Make-up
          </span>
        )}
        <button
          onClick={onClose}
          className="ml-auto p-1 -mr-1 rounded text-ink-400 hover:text-ink-800 hover:bg-ink-100"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {showTutor && (
        <div className="px-3 pt-2 text-[11px] text-ink-500">{meeting.tutor_name}</div>
      )}

      <div className="px-1 py-1 max-h-64 overflow-y-auto divide-y divide-mc-line/70">
        {meeting.members.map((session) => {
          const student = studentById.get(session.student_id);
          if (!student) return null;
          const cfg = getSessionStatusConfig(session.session_status);
          const Icon = cfg.Icon;
          // Whole row drills into this specific session in the list view via
          // the existing ?session= deep link (SessionsApp scrolls + rings it).
          return (
            <Link
              key={session.id}
              href={`/sessions?session=${session.id}`}
              onClick={onClose}
              style={{ opacity: cfg.opacity ?? 1 }}
              className="flex items-start gap-2 px-2 py-1.5 min-w-0 rounded-md hover:bg-ink-50 focus:bg-ink-50 focus:outline-none"
            >
              <span
                className={`mt-px text-[9px] font-medium rounded px-1 py-px shrink-0 ${gradeBadgeStyle(
                  student.grade
                )}`}
              >
                {student.grade}
              </span>
              {/* Mirror the list view's strikethrough treatment for void /
               *  pending-make-up / no-show statuses (line-through + dimmed
               *  name), driven by the same status config. */}
              <div className="min-w-0 flex-1">
                <div
                  className={`text-[12px] font-medium truncate ${
                    cfg.strikethrough ? "line-through text-ink-500" : "text-ink-900"
                  }`}
                >
                  {student.name}
                </div>
                <div
                  className={`text-[10px] text-ink-400 truncate ${
                    cfg.strikethrough ? "line-through" : ""
                  }`}
                >
                  <span className="tabular-nums">{student.code}</span>
                  <span className="mx-1 text-ink-300">·</span>
                  {student.school}
                </div>
              </div>
              {/* Compact label keeps the common case on one line; the full
               *  status is in the title. max-w + normal wrapping is a safety
               *  net so any long status wraps instead of squeezing the name. */}
              <span
                title={session.session_status}
                className={`inline-flex items-start gap-1 text-right text-[10px] font-medium leading-tight shrink-0 max-w-[44%] ${
                  cfg.textClass
                } ${cfg.strikethrough ? "line-through" : ""}`}
              >
                <Icon className="h-3 w-3 shrink-0 mt-px" />
                <span>{compactStatusLabel(session.session_status)}</span>
              </span>
            </Link>
          );
        })}
      </div>

      <button
        onClick={onOpenInList}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border-t border-mc-line text-[12px] font-medium text-mc-red-700 hover:bg-mc-red-50"
      >
        Open in list
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>,
    document.body
  );
}

/** Meeting stripe colour by the most action-worthy member state, so the cue
 *  is honest for mixed-status meetings (the old code coloured by members[0]).
 *  Priority: pending make-up > no-show/cancelled > all attended > scheduled. */
function meetingStripe(meeting: ClassMeeting): string {
  const statuses = meeting.members.map((m) => m.session_status);
  if (statuses.some(isPendingMakeup)) return "bg-orange-500";
  if (
    statuses.some(
      (s) => s === SessionStatus.NO_SHOW || s === SessionStatus.CANCELLED
    )
  ) {
    return "bg-red-500";
  }
  if (
    statuses.length > 0 &&
    statuses.every(
      (s) =>
        s === SessionStatus.ATTENDED || s === SessionStatus.ATTENDED_MAKEUP
    )
  ) {
    return "bg-green-600";
  }
  if (meeting.is_makeup) return "bg-mc-yellow-500";
  return "bg-sky-400";
}

/** Short label for the peek popover so verbose make-up statuses (e.g.
 *  "Weather Cancelled - Pending Make-up") don't crowd out the student name.
 *  The icon + colour carry the reason; the full status is kept in the row's
 *  title for hover. Other statuses are already short and pass through. */
function compactStatusLabel(status: SessionStatusValue): string {
  if (status.endsWith("- Pending Make-up")) return "Pending make-up";
  if (status.endsWith("- Make-up Booked")) return "Make-up booked";
  if (status === SessionStatus.ATTENDED_MAKEUP) return "Attended";
  return status;
}

function isPendingMakeup(s: SessionStatusValue): boolean {
  return (
    s === SessionStatus.SICK_LEAVE_PENDING ||
    s === SessionStatus.WEATHER_PENDING ||
    s === SessionStatus.RESCHEDULED_PENDING
  );
}

/** "HH:MM" → minutes since midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Pack a day's meetings into side-by-side lanes so overlapping slots (e.g.
 *  two tutors at 16:00 under the "All" filter) don't stack on top of each
 *  other. Overlapping meetings form a cluster that shares a column count;
 *  non-overlapping meetings keep the full width. */
function layoutDay(
  meetings: ClassMeeting[]
): { meeting: ClassMeeting; lane: number; cols: number }[] {
  const items = meetings
    .map((m) => {
      const start = toMinutes(m.start_time);
      return { m, start, end: start + m.duration_mins, lane: 0 };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const out: { meeting: ClassMeeting; lane: number; cols: number }[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    for (const it of cluster) {
      let lane = laneEnds.findIndex((end) => end <= it.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.end);
      } else {
        laneEnds[lane] = it.end;
      }
      it.lane = lane;
    }
    const cols = laneEnds.length;
    for (const it of cluster) out.push({ meeting: it.m, lane: it.lane, cols });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const it of items) {
    if (it.start >= clusterEnd && cluster.length > 0) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return out;
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
