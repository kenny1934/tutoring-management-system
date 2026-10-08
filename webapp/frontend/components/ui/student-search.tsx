"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader2, Search, X } from "lucide-react";
import { studentsAPI } from "@/lib/api";
import type { Student } from "@/types";
import { IconButton, Input } from "@/components/controls";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";

/**
 * Picks one student by name or ID. Once picked, it shows the student with a
 * button to clear the choice. The enrolment form and the window for a lesson
 * taught but not in CSM yet both use it. With a location, it searches that
 * branch's students only.
 */
interface StudentSearchProps {
  value: Student | null;
  onChange: (student: Student | null) => void;
  disabled?: boolean;
  location?: string;
}

export function StudentSearch({ value, onChange, disabled, location }: StudentSearchProps) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const { data: students = [], isLoading } = useSWR(
    search.length >= 2 ? ["students-search", search, location] : null,
    () => studentsAPI.getAll({ search, location, limit: 10 })
  );

  return (
    <div className="relative">
      {value ? (
        <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
          <div className="flex-1">
            <StudentInfoBadges
              student={{
                student_id: value.id,
                student_name: value.student_name,
                school_student_id: value.school_student_id,
                grade: value.grade,
                lang_stream: value.lang_stream,
                school: value.school,
                home_location: value.home_location,
              }}
              showLocationPrefix={true}
            />
          </div>
          {!disabled && (
            <IconButton label="Clear student" icon={X} size="sm" onClick={() => onChange(null)} />
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-subtle pointer-events-none" aria-hidden="true" />
          <Input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setIsOpen(e.target.value.length >= 2);
            }}
            onFocus={() => search.length >= 2 && setIsOpen(true)}
            onBlur={() => setTimeout(() => setIsOpen(false), 200)}
            placeholder={location ? `Search ${location} students...` : "Search student by name or ID..."}
            aria-label="Search students"
            className="pl-10"
            disabled={disabled}
          />
          {isOpen && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {isLoading ? (
                <div className="p-3 text-center text-foreground/60">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Searching...
                </div>
              ) : students.length === 0 ? (
                <div className="p-3 text-center text-foreground/60">No students found</div>
              ) : (
                students.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => {
                      onChange(student);
                      setSearch("");
                      setIsOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <StudentInfoBadges
                      student={{
                        student_id: student.id,
                        student_name: student.student_name,
                        school_student_id: student.school_student_id,
                        grade: student.grade,
                        lang_stream: student.lang_stream,
                        school: student.school,
                        home_location: student.home_location,
                      }}
                      showLocationPrefix={true}
                    />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
