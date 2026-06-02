"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, UserPlus } from "lucide-react";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { DEMO_DAY } from "@/lib/mock-data/sessions";
import type { Student } from "@/lib/types";
import { StudentFormModal } from "./StudentFormModal";
import {
  daysAgoLabel,
  formatSessionTime,
  getInitials,
  getLastSession,
  getNextSession,
  getPendingCount,
  sortByCode,
} from "./student-utils";

const HW_LOADS = ["NO", "Little", "Normal", "Many"] as const;

export function StudentsIndex() {
  const { students, sessions, assignments } = usePrimaryStore();

  const [q, setQ] = useState("");
  const [grade, setGrade] = useState<string>("all");
  const [school, setSchool] = useState<string>("all");
  const [hwLoad, setHwLoad] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);

  const grades = useMemo(
    () => Array.from(new Set(students.map((s) => s.grade))).sort(),
    [students]
  );
  const schools = useMemo(
    () => Array.from(new Set(students.map((s) => s.school))).sort(),
    [students]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return students
      .filter((s) => grade === "all" || s.grade === grade)
      .filter((s) => school === "all" || s.school === school)
      .filter((s) => hwLoad === "all" || s.hwLoad === hwLoad)
      .filter(
        (s) =>
          !term ||
          s.name.toLowerCase().includes(term) ||
          s.code.includes(term)
      )
      .sort(sortByCode);
  }, [students, q, grade, school, hwLoad]);

  const hasFilters =
    q !== "" || grade !== "all" || school !== "all" || hwLoad !== "all";

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Students</h1>
          <p className="text-sm text-ink-500 mt-1">
            Pick a student to open their hub — sessions, checktables, comms,
            history all live there.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-mc-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-mc-red-700"
        >
          <UserPlus className="h-4 w-4" />
          Add student
        </button>
      </div>

      <div className="surface p-3 space-y-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or code"
            className="w-full rounded-md border border-ink-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-ink-400"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <FilterSelect
            value={grade}
            onChange={setGrade}
            options={[{ id: "all", label: "All grades" }].concat(
              grades.map((g) => ({ id: g, label: g }))
            )}
          />
          <FilterSelect
            value={school}
            onChange={setSchool}
            options={[{ id: "all", label: "All schools" }].concat(
              schools.map((s) => ({ id: s, label: s }))
            )}
          />
          <FilterSelect
            value={hwLoad}
            onChange={setHwLoad}
            options={[{ id: "all", label: "All HW loads" }].concat(
              HW_LOADS.map((h) => ({ id: h, label: `${h} HW` }))
            )}
          />
          {hasFilters && (
            <button
              onClick={() => {
                setQ("");
                setGrade("all");
                setSchool("all");
                setHwLoad("all");
              }}
              className="text-ink-500 hover:text-ink-800 ml-auto"
            >
              Reset
            </button>
          )}
        </div>
        <div className="text-xs text-ink-500">
          {filtered.length} of {students.length} students
        </div>
      </div>

      <div className="surface divide-y divide-ink-100 overflow-hidden">
        {filtered.map((student) => (
          <StudentRow
            key={student.id}
            student={student}
            todayIso={DEMO_DAY}
            sessions={sessions}
            assignments={assignments}
          />
        ))}
        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-ink-500">
            No students match the current filter.
          </div>
        )}
      </div>

      {showAdd && <StudentFormModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-ink-200 bg-white px-2 py-1 text-xs"
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function StudentRow({
  student,
  todayIso,
  sessions,
  assignments,
}: {
  student: Student;
  todayIso: string;
  sessions: ReturnType<typeof usePrimaryStore>["sessions"];
  assignments: ReturnType<typeof usePrimaryStore>["assignments"];
}) {
  const pending = getPendingCount(student.id, assignments);
  const next = getNextSession(student.id, sessions, todayIso);
  const last = getLastSession(student.id, sessions, todayIso);

  return (
    <Link
      href={`/students/${student.id}`}
      className="block px-4 py-3 hover:bg-ink-50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-ink-100 text-ink-700 grid place-items-center text-xs font-semibold shrink-0">
          {getInitials(student.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-xs text-ink-500 tabular-nums">
              {student.code}
            </span>
            <span className="font-medium text-ink-900 truncate">
              {student.name}
            </span>
            <span className="text-xs text-ink-500">
              {student.grade} · {student.school} · {student.hwLoad} HW
            </span>
          </div>
          <div className="text-xs text-ink-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {next ? (
              <span>Next {formatSessionTime(next)}</span>
            ) : (
              <span className="text-ink-400">No upcoming session</span>
            )}
            {pending > 0 && (
              <span className="text-amber-700">
                ● {pending} pending HW
              </span>
            )}
            {last && (
              <span>Last worked {daysAgoLabel(last.session_date, todayIso)}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
