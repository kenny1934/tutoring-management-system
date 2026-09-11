"use client";

import { Minimize2, type LucideIcon } from "lucide-react";

interface FocusModeButtonsProps {
  /** The sidebar button's icon and label, which say what the sidebar lists. */
  icon: LucideIcon;
  label: string;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onLeave: () => void;
}

/**
 * In focus mode the header and sidebar are hidden, and the mouse-only edge
 * zones can't bring them back for a finger at the board. These two buttons
 * sit at the start of the worksheet's toolbar instead, in both lesson views.
 */
export function FocusModeButtons({ icon: Icon, label, sidebarOpen, onOpenSidebar, onLeave }: FocusModeButtonsProps) {
  return (
    <>
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-expanded={sidebarOpen}
        className="h-11 px-3 flex flex-none items-center gap-1.5 rounded-lg text-sm font-medium bg-[#a0704b] text-white hover:bg-[#8b6040] transition-colors"
      >
        <Icon className="h-5 w-5" />
        {label}
      </button>
      <button
        type="button"
        onClick={onLeave}
        title="Leave focus mode (F)"
        className="h-11 px-3 flex flex-none items-center gap-1.5 rounded-lg text-sm font-medium border border-[#a0704b] text-[#6b4c30] dark:text-[#d4a574] hover:bg-[#e8d4b8] dark:hover:bg-[#3a3228] transition-colors"
      >
        <Minimize2 className="h-5 w-5" />
        Leave focus
      </button>
    </>
  );
}
