"use client";

import { useEffect, useRef, useState } from "react";
import { X, UserPlus, Pencil } from "lucide-react";
import { usePrimaryStore, type StudentInput } from "@/lib/store/PrimaryStore";
import type { HWLoad, Student } from "@/lib/types";

type Props = {
  /** Omit to add a new student; pass a student to edit it. */
  student?: Student;
  onClose: () => void;
  /** Fired with the student id after a successful add/save. */
  onSaved?: (studentId: string) => void;
};

// Primary-handoff grades. SG/Math/PS run P1–P6; Kindergarten is its own band.
const GRADES = ["K", "P1", "P2", "P3", "P4", "P5", "P6"] as const;
const HW_LOADS: HWLoad[] = ["NO", "Little", "Normal", "Many"];

export function StudentFormModal({ student, onClose, onSaved }: Props) {
  const { addStudent, updateStudent } = usePrimaryStore();
  const isEdit = !!student;

  const [name, setName] = useState(student?.name ?? "");
  const [code, setCode] = useState(student?.code ?? "");
  const [grade, setGrade] = useState<string>(student?.grade ?? "P1");
  const [school, setSchool] = useState(student?.school ?? "");
  const [hwLoad, setHwLoad] = useState<HWLoad>(student?.hwLoad ?? "Normal");

  const dialogRef = useRef<HTMLDivElement>(null);
  // Pristine = nothing changed from the initial values; controls backdrop close.
  const dirty =
    name !== (student?.name ?? "") ||
    code !== (student?.code ?? "") ||
    grade !== (student?.grade ?? "P1") ||
    school !== (student?.school ?? "") ||
    hwLoad !== (student?.hwLoad ?? "Normal");

  // Restore focus to whatever was focused before the modal opened.
  useEffect(() => {
    const prevFocused = document.activeElement as HTMLElement | null;
    return () => prevFocused?.focus?.();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const onBackdrop = () => {
    if (!dirty) onClose();
  };

  const canSave = name.trim() !== "" && code.trim() !== "";

  const submit = () => {
    if (!canSave) return;
    const input: StudentInput = {
      name: name.trim(),
      code: code.trim(),
      grade,
      school: school.trim(),
      hwLoad,
    };
    if (isEdit && student) {
      updateStudent(student.id, input);
      onSaved?.(student.id);
    } else {
      const id = addStudent(input);
      onSaved?.(id);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-ink-900/40 p-0 sm:p-4"
      onClick={onBackdrop}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-form-title"
        className="surface w-full sm:max-w-md bg-white max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-3">
          <div className="flex items-center gap-2">
            {isEdit ? (
              <Pencil className="h-4 w-4 text-mc-red-600" />
            ) : (
              <UserPlus className="h-4 w-4 text-mc-red-600" />
            )}
            <span
              id="student-form-title"
              className="text-lg font-semibold text-ink-900"
            >
              {isEdit ? "Edit student" : "Add student"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 -mr-2 p-2"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="p-5 space-y-3">
          <Field label="Name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chan Ho Yin"
              autoFocus
              className="w-full rounded-md border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:border-ink-400"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Student code">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. 1005"
                className="w-full rounded-md border border-ink-200 px-3 py-2 text-sm font-mono focus:outline-none focus:border-ink-400"
              />
            </Field>
            <Field label="Grade" hint="Determines which worksheets match">
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-ink-400"
              >
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="School">
              <input
                type="text"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                placeholder="e.g. PCMS"
                className="w-full rounded-md border border-ink-200 px-3 py-2 text-sm focus:outline-none focus:border-ink-400"
              />
            </Field>
            <Field label="Homework load">
              <select
                value={hwLoad}
                onChange={(e) => setHwLoad(e.target.value as HWLoad)}
                className="w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-ink-400"
              >
                {HW_LOADS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-ink-200 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSave}
            className="rounded-md bg-mc-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-mc-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isEdit ? "Save changes" : "Add student"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink-700 mb-1">
        {label}
        {hint && <span className="font-normal text-ink-400"> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}
