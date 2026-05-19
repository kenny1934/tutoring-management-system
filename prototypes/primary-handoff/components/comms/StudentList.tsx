"use client";

import { Search, Plus } from "lucide-react";
import type { ParentContact, Student, ContactStatus } from "@/lib/types";
import { ContactStatusDot } from "./ContactStatusBadge";
import { contactStatusFor } from "@/lib/mock-data/parent-contacts";

type Props = {
  students: Student[];
  contacts: ParentContact[];
  selectedStudentId: string | null;
  onSelectStudent: (id: string) => void;
  onRecord: (id: string) => void;
  search: string;
  onSearch: (v: string) => void;
};

const ORDER: ContactStatus[] = [
  "Contact Needed",
  "Never Contacted",
  "Been a While",
  "Recent",
];

export function StudentList({
  students,
  contacts,
  selectedStudentId,
  onSelectStudent,
  onRecord,
  search,
  onSearch,
}: Props) {
  const filtered = students
    .filter(
      (s) =>
        !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.code.toLowerCase().includes(search.toLowerCase())
    )
    .map((s) => ({
      student: s,
      status: contactStatusFor(s.id, contacts),
      lastContacted: contacts
        .filter((c) => c.studentId === s.id)
        .sort((a, b) => b.contactedAt.localeCompare(a.contactedAt))[0]
        ?.contactedAt,
    }))
    .sort((a, b) => {
      const oa = ORDER.indexOf(a.status);
      const ob = ORDER.indexOf(b.status);
      if (oa !== ob) return oa - ob;
      return a.student.name.localeCompare(b.student.name);
    });

  return (
    <div className="surface flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-ink-100 flex items-center gap-2">
        <Search className="h-4 w-4 text-ink-400" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search students"
          className="flex-1 text-sm focus:outline-none bg-transparent"
        />
      </div>

      <div className="overflow-y-auto flex-1">
        {filtered.length === 0 && (
          <div className="p-4 text-sm text-ink-500 text-center">
            No students match.
          </div>
        )}
        {filtered.map(({ student, status, lastContacted }) => {
          const isActive = student.id === selectedStudentId;
          return (
            <div
              key={student.id}
              className={`px-3 py-2 border-b border-ink-100 cursor-pointer ${
                isActive ? "bg-accent-50" : "hover:bg-ink-50"
              }`}
              onClick={() => onSelectStudent(student.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ContactStatusDot status={status} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-900 truncate">
                      {student.name}
                    </div>
                    <div className="text-xs text-ink-500 truncate">
                      {student.code} · {student.grade}
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRecord(student.id);
                  }}
                  className="text-ink-400 hover:text-accent-600 p-1 -m-1"
                  title="Record contact"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="text-xs text-ink-500 mt-1 flex items-center justify-between gap-2">
                <span>{status}</span>
                {lastContacted && (
                  <span>
                    last{" "}
                    {new Date(lastContacted).toLocaleDateString("en-HK", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
