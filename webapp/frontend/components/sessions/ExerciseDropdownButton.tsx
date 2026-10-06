"use client";

import { useState, useRef, useEffect } from "react";
import { PenTool, Home, ChevronDown, Download, Printer, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExerciseDropdownButtonProps {
  exerciseType: "CW" | "HW";
  onAssign: () => void;
  onDownload: () => void;
  onPrint: () => void;
  hasExercises: boolean;
  isProcessing?: boolean;
  dropUp?: boolean;
}

export function ExerciseDropdownButton({
  exerciseType,
  onAssign,
  onDownload,
  onPrint,
  hasExercises,
  isProcessing = false,
  dropUp = false,
}: ExerciseDropdownButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isCW = exerciseType === "CW";
  const Icon = isCW ? PenTool : Home;
  // A small secondary split button. Classwork and homework keep their red and
  // blue on the icon, so the two are still told apart at a glance.
  const iconColour = isCW ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400";

  return (
    <div ref={ref} className="relative">
      <div className="flex h-7 items-stretch rounded border border-line-strong bg-field-fill text-xs font-medium text-gray-800 dark:text-gray-200">
        {/* Main button - Assign */}
        <button
          onClick={onAssign}
          disabled={isProcessing}
          className={cn(
            "flex items-center gap-1 px-2.5 rounded-l transition-colors",
            isProcessing ? "opacity-50 cursor-wait" : "hover:bg-tint"
          )}
          title={`Assign ${exerciseType === "CW" ? "Classwork" : "Homework"}`}
        >
          {isProcessing ? (
            <Loader2 className={cn("h-3.5 w-3.5 animate-spin", iconColour)} />
          ) : (
            <Icon className={cn("h-3.5 w-3.5", iconColour)} />
          )}
          <span className="hidden xs:inline">{exerciseType}</span>
        </button>

        {/* Divider + Chevron */}
        <button
          onClick={() => setOpen(!open)}
          disabled={isProcessing}
          className={cn(
            "flex items-center px-1 rounded-r border-l border-line transition-colors",
            isProcessing ? "opacity-50 cursor-wait" : "hover:bg-tint"
          )}
          title="More actions"
          aria-label="More actions"
        >
          <ChevronDown className="h-3 w-3 text-ink-subtle" />
        </button>
      </div>

      {/* Dropdown menu */}
      {open && (
        <div
          className={cn(
            "absolute z-50 min-w-[140px] rounded-md shadow-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 py-1",
            dropUp ? "bottom-full mb-1" : "top-full mt-1",
            "right-0"
          )}
        >
          <button
            onClick={() => {
              setOpen(false);
              onDownload();
            }}
            disabled={!hasExercises}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-[11px]",
              hasExercises
                ? "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                : "text-gray-500 dark:text-gray-400 cursor-not-allowed"
            )}
          >
            <Download className="h-3 w-3" />
            Download {exerciseType}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onPrint();
            }}
            disabled={!hasExercises}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-[11px]",
              hasExercises
                ? "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                : "text-gray-500 dark:text-gray-400 cursor-not-allowed"
            )}
          >
            <Printer className="h-3 w-3" />
            Print {exerciseType}
          </button>
          <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          <button
            onClick={() => {
              setOpen(false);
              onAssign();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Icon className="h-3 w-3" />
            Assign {exerciseType}
          </button>
        </div>
      )}
    </div>
  );
}
