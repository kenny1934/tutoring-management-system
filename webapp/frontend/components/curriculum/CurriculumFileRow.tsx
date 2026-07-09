"use client";

import { useState } from "react";
import { Check, Copy, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { ROLE_LABELS, stripExtension } from "@/lib/curriculum-labels";
import type { CurriculumFile } from "@/types";

interface CurriculumFileRowProps {
  file: CurriculumFile;
  onPreview: (file: CurriculumFile) => void;
}

/** The badge cluster every file row shares: school, role, language, usage. */
export function CurriculumFileBadges({ file }: { file: CurriculumFile }) {
  return (
    <>
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
          className="text-[9px] text-gray-400 shrink-0"
          title={`Assigned ${file.assignment_count} times to ${file.unique_student_count} students across all schools`}
        >
          {file.assignment_count}×
        </span>
      )}
    </>
  );
}

/** One worksheet line: name, role/language badges, usage count, preview and copy. */
export function CurriculumFileRow({ file, onPreview }: CurriculumFileRowProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

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
      <span
        className="text-[11px] text-gray-700 dark:text-gray-300 truncate flex-1"
        title={file.file_path}
      >
        {stripExtension(file.file_basename)}
      </span>
      <CurriculumFileBadges file={file} />
      <button
        type="button"
        onClick={() => onPreview(file)}
        title="Preview this worksheet"
        className="p-0.5 rounded shrink-0 text-gray-400 hover:text-teal-600 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors"
      >
        <Eye className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={copyPath}
        title="Copy the file path to paste into an exercise"
        className={cn(
          "p-0.5 rounded shrink-0 transition-colors",
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
