"use client";

import { useState } from "react";
import { Check, Copy, Eye, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { ROLE_LABELS, stripExtension } from "@/lib/curriculum-labels";
import { iconHitArea, useCoarsePointer } from "@/hooks/useCoarsePointer";
import type { CurriculumFile } from "@/types";

interface CurriculumFileRowProps {
  file: CurriculumFile;
  onPreview: (file: CurriculumFile) => void;
  /** When set (the exercise modal case), the row leads with an add button —
   *  same shape as CurriculumPastPaperRow. */
  onAdd?: () => void;
  /** School the list is scoped to; lights up the usage badge for files its
   *  own students have been assigned. */
  scopeSchool?: string | null;
}

/** The badge cluster every file row shares: school, role, language, usage. */
export function CurriculumFileBadges({
  file,
  scopeSchool,
}: {
  file: CurriculumFile;
  scopeSchool?: string | null;
}) {
  const schoolCount = file.school_assignment_count || 0;
  const schoolStudents = file.school_student_count || 0;
  const times = (n: number) => (n === 1 ? "time" : "times");
  const students = (n: number) => (n === 1 ? "student" : "students");
  const usageTitle =
    `Assigned ${file.assignment_count} ${times(file.assignment_count)} to ` +
    `${file.unique_student_count} ${students(file.unique_student_count)} across all schools` +
    (scopeSchool
      ? schoolCount > 0
        ? `, including ${schoolCount} ${times(schoolCount)} to ${schoolStudents} ${scopeSchool} ${students(schoolStudents)}`
        : `, none to ${scopeSchool} students yet`
      : "");
  return (
    <>
      {/* Student-scoped lists (the exercise modal) carry assignment history
          for the session's student; other lists omit the fields entirely. */}
      {(file.student_assigned_count ?? 0) > 0 && (
        <span
          className="text-[9px] px-1 py-px rounded bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 shrink-0"
          title={`Already assigned to this student ${file.student_assigned_count} ${times(file.student_assigned_count ?? 0)}${
            file.student_last_assigned
              ? `, last on ${new Date(file.student_last_assigned).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
              : ""
          }`}
        >
          Done
          {file.student_last_assigned
            ? ` · ${new Date(file.student_last_assigned).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
            : ""}
        </span>
      )}
      {file.school_code && (
        <span
          className={cn(
            "text-[9px] px-1 py-px rounded shrink-0",
            file.from_school
              ? "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-medium"
              : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
          )}
          title={
            file.from_school
              ? "This school's own material"
              : `From ${file.school_code}'s materials`
          }
        >
          {file.school_code}
        </span>
      )}
      <span className="text-[9px] px-1 py-px rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 shrink-0">
        {file.role ? ROLE_LABELS[file.role] || file.role : "Worksheet"}
      </span>
      {file.lang && (
        <span
          className="text-[9px] px-1 py-px rounded bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 shrink-0"
          title={file.lang === "e" ? "English version" : "Chinese version"}
        >
          {file.lang === "e" ? "EN" : "中"}
        </span>
      )}
      {file.assignment_count > 0 && (
        <span
          className={cn(
            "text-[9px] shrink-0",
            schoolCount > 0
              ? "text-teal-600 dark:text-teal-400 font-medium"
              : "text-gray-400"
          )}
          title={usageTitle}
        >
          {file.assignment_count}×
        </span>
      )}
    </>
  );
}

/** One worksheet line: name, role/language badges, usage count, preview and copy. */
export function CurriculumFileRow({
  file,
  onPreview,
  onAdd,
  scopeSchool,
}: CurriculumFileRowProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const hitArea = iconHitArea(useCoarsePointer());

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(file.file_path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Could not copy the path.", "error");
    }
  };

  return (
    <div className="flex items-center gap-1.5 group rounded px-1 py-0.5 hover:bg-teal-50/60 dark:hover:bg-teal-900/10">
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          title="Add to the session"
          className={cn(
            hitArea,
            "rounded text-teal-600 hover:bg-teal-100 dark:hover:bg-teal-900/30 shrink-0"
          )}
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
      {/* Name click previews: the row's biggest target does the safe,
          read-only thing; adding stays on the explicit plus button. */}
      <span
        className="text-[11px] text-gray-700 dark:text-gray-300 truncate flex-1 cursor-pointer"
        title={file.file_path}
        onClick={() => onPreview(file)}
      >
        {stripExtension(file.file_basename)}
      </span>
      <CurriculumFileBadges file={file} scopeSchool={scopeSchool} />
      <button
        type="button"
        onClick={() => onPreview(file)}
        title="Preview this worksheet"
        className={cn(
          hitArea,
          "rounded shrink-0 text-gray-400 hover:text-teal-600 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors"
        )}
      >
        <Eye className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={copyPath}
        title="Copy the file path to paste into an exercise"
        className={cn(
          hitArea,
          "rounded shrink-0 transition-colors",
          copied
            ? "text-teal-600"
            : "text-gray-400 hover:text-teal-600 hover:bg-teal-100 dark:hover:bg-teal-900/30"
        )}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}
