"use client";

import { motion } from "framer-motion";
import { StickyNote, ArrowDownToLine, Eye } from "lucide-react";
import type { TutorMemo } from "@/types";
import { cn } from "@/lib/utils";

interface MemoBannerProps {
  memo: TutorMemo;
  onView: () => void;
  onImport: () => void;
}

export function MemoBanner({ memo, onView, onImport }: MemoBannerProps) {
  const isLinked = memo.status === "linked";
  const exerciseCount = memo.exercises?.length ?? 0;
  const hasNotes = !!memo.notes;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 rounded-lg border-2",
        isLinked
          ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700"
          : "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700"
      )}
    >
      <div className={cn(
        "flex items-center justify-center w-8 h-8 rounded-full shrink-0",
        isLinked
          ? "bg-green-200 dark:bg-green-800"
          : "bg-amber-200 dark:bg-amber-800"
      )}>
        <StickyNote className={cn(
          "h-4 w-4",
          isLinked
            ? "text-green-700 dark:text-green-300"
            : "text-amber-700 dark:text-amber-300"
        )} />
      </div>

      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-medium",
          isLinked
            ? "text-green-800 dark:text-green-200"
            : "text-amber-800 dark:text-amber-200"
        )}>
          {isLinked ? "Memo data imported" : "Session memo available"}
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Recorded by {memo.tutor_name} on {new Date(memo.memo_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          {exerciseCount > 0 && ` \u00B7 ${exerciseCount} exercise${exerciseCount > 1 ? "s" : ""}`}
          {hasNotes && " \u00B7 has notes"}
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onView}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors",
            "border-gray-300 dark:border-gray-600",
            "hover:bg-gray-100 dark:hover:bg-gray-800",
            "text-gray-700 dark:text-gray-300"
          )}
        >
          <Eye className="h-3 w-3" />
          View
        </button>
        {!isLinked && (
          <button
            onClick={onImport}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
              "bg-amber-500 hover:bg-amber-600 text-white"
            )}
          >
            <ArrowDownToLine className="h-3 w-3" />
            Import
          </button>
        )}
      </div>
    </motion.div>
  );
}
