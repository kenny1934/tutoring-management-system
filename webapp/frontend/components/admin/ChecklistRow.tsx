"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Collapsible workflow-step row for the admin action pane of an application
 * detail modal. Both intakes walk the same shape of workflow, so both render
 * their steps with this: a numbered pill that becomes a tick once the step is
 * done, a one-line summary while collapsed, and the step's controls inside.
 */
export function ChecklistRow({
  index,
  title,
  done,
  summary,
  open,
  onToggle,
  disabled,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  summary?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white dark:bg-gray-900/40 overflow-hidden",
        done
          ? "border-green-200/70 dark:border-green-900/40"
          : "border-gray-200 dark:border-gray-700",
      )}
    >
      <button
        type="button"
        onClick={disabled ? undefined : onToggle}
        disabled={disabled}
        aria-expanded={open}
        className={cn(
          "w-full flex items-center gap-2.5 px-2.5 py-2 text-left",
          disabled
            ? "cursor-default"
            : "hover:bg-gray-50 dark:hover:bg-gray-800/50",
        )}
      >
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
            done
              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
          )}
        >
          {done ? <Check className="h-3 w-3" /> : index + 1}
        </span>
        <span
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wider",
            done ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {title}
        </span>
        <span className="ml-auto flex items-center gap-2 min-w-0">
          {!open && summary ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {summary}
            </span>
          ) : null}
          {!disabled && (
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                open && "rotate-180",
              )}
            />
          )}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="border-t border-gray-100 dark:border-gray-800 p-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
