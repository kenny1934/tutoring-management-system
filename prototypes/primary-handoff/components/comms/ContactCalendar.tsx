"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { ParentContact, ContactType, Student } from "@/lib/types";
import {
  addDaysIso,
  hktDateFromIso,
  hktTimeFromIso,
  parseIsoDateUTC,
} from "@/lib/datetime";

type Props = {
  contacts: ParentContact[];
  studentById: Map<string, Student>;
  selectedContactId: string | null;
  onSelectContact: (id: string) => void;
  activeTypes: Set<ContactType>;
  onToggleType: (t: ContactType) => void;
};

const TYPE_COLOR: Record<ContactType, string> = {
  "Progress Update": "bg-blue-500",
  Concern: "bg-orange-500",
  General: "bg-ink-400",
};

export function ContactCalendar({
  contacts,
  studentById,
  selectedContactId,
  onSelectContact,
  activeTypes,
  onToggleType,
}: Props) {
  // First-of-month as an HKT calendar day (YYYY-MM-DD), kept in UTC-safe form.
  const [monthStart, setMonthStart] = useState("2026-05-01");
  // Day cells that have been expanded to show all their events.
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const days = useMemo(() => buildMonthGrid(monthStart), [monthStart]);

  const byDay = useMemo(() => {
    const map = new Map<string, ParentContact[]>();
    for (const c of contacts) {
      if (!activeTypes.has(c.type)) continue;
      const day = hktDateFromIso(c.contactedAt);
      const arr = map.get(day) ?? [];
      arr.push(c);
      map.set(day, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.contactedAt.localeCompare(b.contactedAt));
    }
    return map;
  }, [contacts, activeTypes]);

  const monthDate = parseIsoDateUTC(monthStart);
  const monthLabel = monthDate.toLocaleDateString("en-HK", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const prev = () => {
    setExpandedDays(new Set());
    setMonthStart(addMonthsIso(monthStart, -1));
  };
  const next = () => {
    setExpandedDays(new Set());
    setMonthStart(addMonthsIso(monthStart, 1));
  };

  const toggleExpanded = (dayStr: string) =>
    setExpandedDays((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(dayStr)) nextSet.delete(dayStr);
      else nextSet.add(dayStr);
      return nextSet;
    });

  return (
    <div className="surface flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-ink-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={prev}
            className="p-1 hover:bg-ink-100 rounded-md text-ink-600"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-sm font-semibold text-ink-900 min-w-[120px] text-center">
            {monthLabel}
          </div>
          <button
            onClick={next}
            className="p-1 hover:bg-ink-100 rounded-md text-ink-600"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          {(["Progress Update", "Concern", "General"] as ContactType[]).map(
            (t) => {
              const active = activeTypes.has(t);
              return (
                <button
                  key={t}
                  onClick={() => onToggleType(t)}
                  className={`text-xs rounded-md px-2 py-0.5 border flex items-center gap-1 ${
                    active
                      ? "bg-white border-ink-300 text-ink-700"
                      : "bg-ink-50 border-ink-200 text-ink-400 line-through"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${TYPE_COLOR[t]}`}
                  />
                  {t}
                </button>
              );
            }
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-ink-100 bg-ink-50 text-xs text-ink-500 font-medium">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 py-1 text-center">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 flex-1 overflow-y-auto">
        {days.map((day) => {
          const dayStr = day.iso;
          const items = byDay.get(dayStr) ?? [];
          const expanded = expandedDays.has(dayStr);
          const visible = expanded ? items : items.slice(0, 3);
          const hidden = items.length - visible.length;
          return (
            <div
              key={dayStr}
              className={`min-h-[80px] border-b border-r border-ink-100 p-1 ${
                day.inMonth ? "bg-white" : "bg-ink-50/50 text-ink-300"
              }`}
            >
              <div className="text-xs text-ink-500 mb-1">{day.dayNum}</div>
              <div className="space-y-0.5">
                {visible.map((c) => {
                  const student = studentById.get(c.studentId);
                  const name = student?.name ?? "Unknown student";
                  const time = hktTimeFromIso(c.contactedAt);
                  const snippet = c.briefNotes
                    ? `: ${c.briefNotes.slice(0, 80)}${
                        c.briefNotes.length > 80 ? "…" : ""
                      }`
                    : "";
                  return (
                    <button
                      key={c.id}
                      onClick={() => onSelectContact(c.id)}
                      title={`${name} · ${c.type}${snippet}`}
                      className={`w-full text-left text-xs rounded px-1 py-0.5 ${
                        selectedContactId === c.id
                          ? "bg-mc-red-600 text-white"
                          : "bg-ink-100 hover:bg-ink-200 text-ink-700"
                      }`}
                    >
                      <span className="flex items-center gap-1 min-w-0">
                        <span
                          className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${TYPE_COLOR[c.type]}`}
                        />
                        <span className="truncate font-medium">{name}</span>
                      </span>
                      <span
                        className={`block truncate text-[10px] ${
                          selectedContactId === c.id
                            ? "text-white/80"
                            : "text-ink-500"
                        }`}
                      >
                        {time}
                      </span>
                    </button>
                  );
                })}
                {hidden > 0 && (
                  <button
                    onClick={() => toggleExpanded(dayStr)}
                    className="w-full text-left text-xs text-ink-500 hover:text-ink-800 px-1 rounded hover:bg-ink-100"
                  >
                    +{hidden} more
                  </button>
                )}
                {expanded && items.length > 3 && (
                  <button
                    onClick={() => toggleExpanded(dayStr)}
                    className="w-full text-left text-xs text-ink-500 hover:text-ink-800 px-1 rounded hover:bg-ink-100"
                  >
                    Show less
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type GridDay = { iso: string; dayNum: number; inMonth: boolean };

/** Shift a YYYY-MM-01 month-start by `delta` months (UTC-safe). */
function addMonthsIso(monthStartIso: string, delta: number): string {
  const d = parseIsoDateUTC(monthStartIso);
  d.setUTCMonth(d.getUTCMonth() + delta, 1);
  return d.toISOString().slice(0, 10);
}

/** Build a 6-week (42-cell) grid for the month starting at `monthStartIso`,
 *  doing all date arithmetic in UTC so HKT calendar days never drift. */
function buildMonthGrid(monthStartIso: string): GridDay[] {
  const first = parseIsoDateUTC(monthStartIso);
  const monthIndex = first.getUTCMonth();
  // Grid starts on the Sunday on/before the 1st (getUTCDay: Sun=0..Sat=6).
  const start = addDaysIso(monthStartIso, -first.getUTCDay());
  const days: GridDay[] = [];
  for (let i = 0; i < 42; i++) {
    const iso = addDaysIso(start, i);
    const d = parseIsoDateUTC(iso);
    days.push({
      iso,
      dayNum: d.getUTCDate(),
      inMonth: d.getUTCMonth() === monthIndex,
    });
  }
  return days;
}
