"use client";

import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Users,
  CalendarDays,
  List,
  CalendarRange,
} from "lucide-react";
import type { SessionStatusValue } from "@/lib/types";

export type ViewMode = "list" | "weekly";

export type TutorOption = { id: string; name: string };

export type StatusFilter = "all" | SessionStatusValue;

type Props = {
  selectedDate: string; // YYYY-MM-DD
  onDateChange: (date: string) => void;
  onJumpToToday: () => void;
  isToday: boolean;
  tutors: TutorOption[];
  tutorFilter: string;
  onTutorChange: (id: string) => void;
  statusFilter: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
  statusOptions: SessionStatusValue[];
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  resultCount: number;
};

export function SessionsToolbar({
  selectedDate,
  onDateChange,
  onJumpToToday,
  isToday,
  tutors,
  tutorFilter,
  onTutorChange,
  statusFilter,
  onStatusChange,
  statusOptions,
  view,
  onViewChange,
  resultCount,
}: Props) {
  const label = formatDateLabel(selectedDate);

  const shiftDate = (deltaDays: number) => {
    const d = new Date(`${selectedDate}T00:00:00+08:00`);
    d.setDate(d.getDate() + deltaDays);
    onDateChange(d.toISOString().slice(0, 10));
  };

  return (
    <div className="sticky top-12 lg:top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-ink-50/95 backdrop-blur border-b border-mc-line">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-md border border-mc-line bg-white">
          <button
            onClick={() => shiftDate(-1)}
            className="p-1.5 text-ink-600 hover:bg-ink-100 rounded-l-md"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <label className="relative flex items-center px-2 py-1 cursor-pointer">
            <CalendarDays className="h-3.5 w-3.5 text-ink-500 mr-1.5" />
            <span className="text-sm font-medium text-ink-900 tabular-nums">
              {label}
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label="Pick date"
            />
          </label>
          <button
            onClick={() => shiftDate(1)}
            className="p-1.5 text-ink-600 hover:bg-ink-100 rounded-r-md"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {!isToday && (
          <button
            onClick={onJumpToToday}
            className="text-xs rounded-md border border-mc-line bg-white text-ink-700 hover:bg-ink-100 px-2 py-1.5 font-medium"
          >
            Today
          </button>
        )}

        <SelectChip Icon={Users} label="Tutor:">
          <select
            value={tutorFilter}
            onChange={(e) => onTutorChange(e.target.value)}
            className="bg-transparent text-sm text-ink-800 focus:outline-none pr-1"
          >
            <option value="all">All</option>
            {tutors.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </SelectChip>

        <SelectChip Icon={Filter} label="Status:">
          <select
            value={statusFilter}
            onChange={(e) =>
              onStatusChange(e.target.value as StatusFilter)
            }
            className="bg-transparent text-sm text-ink-800 focus:outline-none pr-1"
          >
            <option value="all">All</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </SelectChip>

        <div className="text-xs text-ink-500 ml-1">
          {resultCount} {resultCount === 1 ? "meeting" : "meetings"}
        </div>

        <div className="ml-auto inline-flex rounded-md border border-mc-line bg-white p-0.5 text-sm">
          <ViewButton
            active={view === "list"}
            onClick={() => onViewChange("list")}
            Icon={List}
            label="List"
          />
          <ViewButton
            active={view === "weekly"}
            onClick={() => onViewChange("weekly")}
            Icon={CalendarRange}
            label="Weekly"
          />
        </div>
      </div>
    </div>
  );
}

function SelectChip({
  Icon,
  label,
  children,
}: {
  Icon: typeof Filter;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-mc-line bg-white pl-2 pr-1 py-1">
      <Icon className="h-3.5 w-3.5 text-ink-400" />
      <span className="text-xs text-ink-500">{label}</span>
      {children}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof List;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md inline-flex items-center gap-1.5 transition-colors ${
        active
          ? "bg-ink-800 text-white"
          : "text-ink-600 hover:bg-ink-100"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function formatDateLabel(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T00:00:00+08:00`);
  return d.toLocaleDateString("en-HK", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
