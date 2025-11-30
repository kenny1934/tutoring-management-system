"use client";

import { List, CalendarDays, Calendar as CalendarIcon, Grid3x3 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type ViewMode = "list" | "weekly" | "daily" | "monthly";

interface ViewSwitcherProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  compact?: boolean;
}

export function ViewSwitcher({ currentView, onViewChange, compact = false }: ViewSwitcherProps) {
  const views: { mode: ViewMode; icon: typeof List; label: string }[] = [
    { mode: "list", icon: List, label: "List" },
    { mode: "weekly", icon: Grid3x3, label: "Week" },
    { mode: "daily", icon: CalendarDays, label: "Day" },
    { mode: "monthly", icon: CalendarIcon, label: "Month" },
  ];

  return (
    <div className={cn(
      "inline-flex rounded-lg",
      compact
        ? "bg-transparent p-0 gap-0.5"
        : "bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] p-1"
    )}>
      {views.map(({ mode, icon: Icon, label }) => (
        <motion.button
          key={mode}
          onClick={() => onViewChange(mode)}
          className={cn(
            "relative rounded-md font-medium transition-colors flex items-center",
            compact ? "px-2 py-1 text-xs gap-1" : "px-3 py-2 text-sm gap-2",
            currentView === mode
              ? "text-white"
              : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
          )}
          whileHover={{ scale: compact ? 1.02 : 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {currentView === mode && (
            <motion.div
              layoutId={compact ? "activeViewCompact" : "activeView"}
              className="absolute inset-0 bg-[#a0704b] dark:bg-[#cd853f] rounded-md"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
          <Icon className={cn("relative z-10", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
          <span className={cn("relative z-10", compact && "hidden sm:inline")}>{label}</span>
        </motion.button>
      ))}
    </div>
  );
}
