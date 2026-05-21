"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Plus,
  Search,
} from "lucide-react";
import type { ParentContact, Student, ContactStatus } from "@/lib/types";
import { ContactStatusDot } from "./ContactStatusBadge";
import {
  contactStatusFor,
  DEMO_NOW,
} from "@/lib/mock-data/parent-contacts";

type Props = {
  students: Student[];
  contacts: ParentContact[];
  selectedStudentId: string | null;
  onSelectStudent: (id: string) => void;
  onRecord: (id: string) => void;
  search: string;
  onSearch: (v: string) => void;
};

type GroupMode = "urgency" | "grade";
type WithinSort = "name" | "code" | "urgency";

const URGENCY_ORDER: ContactStatus[] = [
  "Contact Needed",
  "Never Contacted",
  "Been a While",
  "Recent",
];

const GRADE_ORDER = ["P1", "P2", "P3", "P4", "P5", "P6"];

type Row = {
  student: Student;
  status: ContactStatus;
  daysSince: number | null;
  lastContacted?: string;
};

type Group = {
  key: string;
  label: string;
  rows: Row[];
};

export function StudentList({
  students,
  contacts,
  selectedStudentId,
  onSelectStudent,
  onRecord,
  search,
  onSearch,
}: Props) {
  const [groupMode, setGroupMode] = useState<GroupMode>("urgency");
  const [withinSort, setWithinSort] = useState<WithinSort>("urgency");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const rows: Row[] = useMemo(() => {
    const now = new Date(DEMO_NOW).getTime();
    return students
      .filter(
        (s) =>
          !search ||
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.code.toLowerCase().includes(search.toLowerCase())
      )
      .map((s) => {
        const studentContacts = contacts
          .filter((c) => c.studentId === s.id)
          .sort((a, b) => b.contactedAt.localeCompare(a.contactedAt));
        const last = studentContacts[0];
        const daysSince = last
          ? Math.floor(
              (now - new Date(last.contactedAt).getTime()) / 86400000
            )
          : null;
        return {
          student: s,
          status: contactStatusFor(s.id, contacts),
          daysSince,
          lastContacted: last?.contactedAt,
        };
      });
  }, [students, contacts, search]);

  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const key =
        groupMode === "urgency" ? r.status : r.student.grade || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    const out: Group[] = [];
    for (const [key, list] of map.entries()) {
      const sorted = [...list].sort((a, b) => {
        if (withinSort === "name") return a.student.name.localeCompare(b.student.name);
        if (withinSort === "code") return a.student.code.localeCompare(b.student.code);
        // urgency within group: never contacted first, then by days desc
        const da = a.daysSince ?? Infinity;
        const db = b.daysSince ?? Infinity;
        return db - da;
      });
      out.push({ key, label: key, rows: sorted });
    }
    // Order groups
    if (groupMode === "urgency") {
      out.sort(
        (a, b) =>
          URGENCY_ORDER.indexOf(a.key as ContactStatus) -
          URGENCY_ORDER.indexOf(b.key as ContactStatus)
      );
    } else {
      out.sort((a, b) => {
        const ia = GRADE_ORDER.indexOf(a.key);
        const ib = GRADE_ORDER.indexOf(b.key);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
    }
    return out;
  }, [rows, groupMode, withinSort]);

  // Auto-expand behavior
  useEffect(() => {
    if (search) {
      setExpandedGroups(new Set(groups.map((g) => g.key)));
    } else if (groupMode === "urgency") {
      setExpandedGroups(new Set(["Contact Needed", "Never Contacted"]));
    } else {
      setExpandedGroups(new Set(groups.map((g) => g.key)));
    }
  }, [groupMode, search, groups]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const urgentCount = (rows: Row[]) =>
    rows.filter(
      (r) => r.status === "Contact Needed" || r.status === "Never Contacted"
    ).length;

  const renderGroupIcon = (key: string) => {
    if (groupMode === "grade") {
      return <GraduationCap className="h-3.5 w-3.5 text-mc-red-700" />;
    }
    if (key === "Contact Needed" || key === "Never Contacted") {
      return <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />;
    }
    return <ContactStatusDot status={key as ContactStatus} />;
  };

  return (
    <div className="surface flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-ink-100 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">
            Students ({rows.length})
          </span>
          <div className="flex items-center gap-1.5">
            <div className="inline-flex rounded-md bg-ink-100 p-0.5">
              <button
                onClick={() => {
                  setGroupMode("urgency");
                  if (withinSort === "urgency") setWithinSort("urgency");
                }}
                className={`p-1 rounded ${
                  groupMode === "urgency"
                    ? "bg-white text-rose-600 shadow-sm"
                    : "text-ink-500 hover:text-ink-700"
                }`}
                title="Group by urgency"
                aria-label="Group by urgency"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setGroupMode("grade")}
                className={`p-1 rounded ${
                  groupMode === "grade"
                    ? "bg-white text-mc-red-700 shadow-sm"
                    : "text-ink-500 hover:text-ink-700"
                }`}
                title="Group by grade"
                aria-label="Group by grade"
              >
                <GraduationCap className="h-3.5 w-3.5" />
              </button>
            </div>
            <select
              value={withinSort}
              onChange={(e) => setWithinSort(e.target.value as WithinSort)}
              className="text-xs rounded-md border border-ink-200 bg-white px-1 py-0.5 text-ink-600 focus:outline-none focus:ring-1 focus:ring-mc-red-500"
              title="Sort within groups"
            >
              {groupMode !== "urgency" && (
                <option value="urgency">Urgency</option>
              )}
              <option value="name">Name</option>
              <option value="code">ID</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-ink-400" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search students"
            className="flex-1 text-sm focus:outline-none bg-transparent"
          />
        </div>
      </div>

      <div className="overflow-y-auto flex-1">
        {groups.length === 0 && (
          <div className="p-4 text-sm text-ink-500 text-center">
            No students match.
          </div>
        )}
        {groups.map((group) => {
          const expanded = expandedGroups.has(group.key);
          const groupUrgent = urgentCount(group.rows);
          return (
            <div
              key={group.key}
              className="border-b border-ink-100 last:border-b-0"
            >
              <button
                onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-ink-50"
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-ink-400" />
                )}
                {renderGroupIcon(group.key)}
                <span className="flex-1 text-sm font-medium text-ink-800">
                  {group.label}
                </span>
                <span className="text-xs text-ink-500">{group.rows.length}</span>
                {groupMode === "grade" && groupUrgent > 0 && (
                  <span className="px-1.5 py-0.5 text-xs bg-rose-100 text-rose-700 rounded-full">
                    {groupUrgent}
                  </span>
                )}
              </button>

              {expanded && (
                <div className="pb-1">
                  {group.rows.map(({ student, status, daysSince, lastContacted }) => {
                    const isActive = student.id === selectedStudentId;
                    return (
                      <div
                        key={student.id}
                        className={`mx-1 rounded-md flex items-stretch ${
                          isActive ? "bg-mc-red-50" : "hover:bg-ink-50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectStudent(student.id)}
                          className="flex-1 min-w-0 text-left px-3 py-2 rounded-l-md focus:outline-none focus:ring-1 focus:ring-mc-red-500"
                        >
                          <div className="flex items-center gap-2">
                            <ContactStatusDot status={status} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-ink-900 truncate">
                                {student.name}
                              </div>
                              <div className="text-xs text-ink-500 truncate">
                                {student.code} · {student.grade}
                              </div>
                            </div>
                            {daysSince !== null && (
                              <span className="text-[10px] text-ink-500 whitespace-nowrap">
                                {daysSince}d ago
                              </span>
                            )}
                          </div>
                          {!lastContacted && (
                            <div className="text-xs text-rose-600 mt-0.5 ml-4">
                              Never contacted
                            </div>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRecord(student.id)}
                          className="text-ink-400 hover:text-mc-red-600 px-2 rounded-r-md"
                          title="Record contact"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
