"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { ParentContact, ContactType } from "@/lib/types";

type Props = {
  contacts: ParentContact[];
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
  selectedContactId,
  onSelectContact,
  activeTypes,
  onToggleType,
}: Props) {
  const [cursor, setCursor] = useState(() => new Date("2026-05-01T00:00:00+08:00"));

  const days = useMemo(() => buildMonthGrid(cursor), [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, ParentContact[]>();
    for (const c of contacts) {
      if (!activeTypes.has(c.type)) continue;
      const day = c.contactedAt.slice(0, 10);
      const arr = map.get(day) ?? [];
      arr.push(c);
      map.set(day, arr);
    }
    return map;
  }, [contacts, activeTypes]);

  const prev = () =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const next = () =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));

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
            {cursor.toLocaleDateString("en-HK", {
              month: "long",
              year: "numeric",
            })}
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
          const dayStr = day.date.toISOString().slice(0, 10);
          const items = byDay.get(dayStr) ?? [];
          return (
            <div
              key={dayStr}
              className={`min-h-[80px] border-b border-r border-ink-100 p-1 ${
                day.inMonth ? "bg-white" : "bg-ink-50/50 text-ink-300"
              }`}
            >
              <div className="text-xs text-ink-500 mb-1">{day.date.getDate()}</div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onSelectContact(c.id)}
                    className={`w-full text-left text-xs rounded px-1 py-0.5 truncate ${
                      selectedContactId === c.id
                        ? "bg-accent-600 text-white"
                        : "bg-ink-100 hover:bg-ink-200 text-ink-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${TYPE_COLOR[c.type]}`}
                    />
                    {new Date(c.contactedAt)
                      .toLocaleTimeString("en-HK", {
                        hour: "numeric",
                        minute: "2-digit",
                      })
                      .padStart(2, "0")}
                  </button>
                ))}
                {items.length > 3 && (
                  <div className="text-xs text-ink-500 px-1">
                    +{items.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildMonthGrid(cursor: Date) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay();
  const start = new Date(year, month, 1 - startDay);
  const days: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push({ date: d, inMonth: d.getMonth() === month });
  }
  return days;
}
