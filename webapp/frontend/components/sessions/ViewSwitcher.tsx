"use client";

import { List, CalendarDays, Calendar as CalendarIcon, Grid3x3 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type ViewMode = "list" | "weekly" | "daily" | "monthly";

interface ViewSwitcherProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function ViewSwitcher({ currentView, onViewChange }: ViewSwitcherProps) {
  const views: { mode: ViewMode; icon: typeof List; label: string }[] = [
    { mode: "list", icon: List, label: "List" },
    { mode: "weekly", icon: Grid3x3, label: "Week" },
    { mode: "daily", icon: CalendarDays, label: "Day" },
    { mode: "monthly", icon: CalendarIcon, label: "Month" },
  ];

  return (
    <div className="inline-flex bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg p-1">
      {views.map(({ mode, icon: Icon, label }) => (
        <motion.button
          key={mode}
          onClick={() => onViewChange(mode)}
          className={cn(
            "relative px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
            currentView === mode
              ? "text-white"
              : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
          )}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {currentView === mode && (
            <motion.div
              layoutId="activeView"
              className="absolute inset-0 bg-[#a0704b] dark:bg-[#cd853f] rounded-md"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
          <Icon className="h-4 w-4 relative z-10" />
          <span className="relative z-10">{label}</span>
        </motion.button>
      ))}
    </div>
  );
}
