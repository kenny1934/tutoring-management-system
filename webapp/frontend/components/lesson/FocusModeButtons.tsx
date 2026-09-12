"use client";

import { Minimize2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonBase = "h-11 px-3 flex flex-none items-center gap-1.5 rounded-lg text-sm font-medium transition-colors";

interface FocusSidebarButtonProps {
  /** The button's icon and word, which say what the sidebar lists. */
  icon: LucideIcon;
  label: string;
  open: boolean;
  onOpen: () => void;
  /** Classes for the word, to hide it on a narrow bar or to leave just the icon. */
  labelClass?: string;
}

/** Brings back the sidebar, which focus mode hides. */
export function FocusSidebarButton({ icon: Icon, label, open, onOpen, labelClass }: FocusSidebarButtonProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={open}
      aria-label={label}
      title={label}
      className={cn(buttonBase, "bg-[#a0704b] text-white hover:bg-[#8b6040]")}
    >
      <Icon className="h-5 w-5 flex-none" />
      <span className={labelClass}>{label}</span>
    </button>
  );
}

/** The way out of focus mode. */
export function LeaveFocusButton({ onLeave, labelClass }: { onLeave: () => void; labelClass?: string }) {
  return (
    <button
      type="button"
      onClick={onLeave}
      aria-label="Leave focus"
      title="Leave focus mode (F)"
      className={cn(buttonBase, "border border-[#a0704b] text-[#6b4c30] dark:text-[#d4a574] hover:bg-[#e8d4b8] dark:hover:bg-[#3a3228]")}
    >
      <Minimize2 className="h-5 w-5 flex-none" />
      <span className={labelClass}>Leave focus</span>
    </button>
  );
}

interface FocusModeButtonsProps {
  icon: LucideIcon;
  label: string;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onLeave: () => void;
  /** Classes for the words on both buttons. "sr-only" leaves just the icons. */
  labelClass?: string;
}

/**
 * In focus mode the header and sidebar are hidden, and the mouse-only edge
 * zones can't bring them back for a finger at the board, so these buttons do.
 *
 * The multi-student view puts them at the two ends of its student strip,
 * which is the top bar in focus mode. The one-student view has no strip, so
 * it puts this pair at the start of the worksheet's toolbar, as icons only so
 * the toolbar keeps its room. While no worksheet is picked, the multi-student
 * view has no strip either, and puts this pair in the toolbar with its words.
 */
export function FocusModeButtons({ icon, label, sidebarOpen, onOpenSidebar, onLeave, labelClass }: FocusModeButtonsProps) {
  return (
    <>
      <FocusSidebarButton icon={icon} label={label} open={sidebarOpen} onOpen={onOpenSidebar} labelClass={labelClass} />
      <LeaveFocusButton onLeave={onLeave} labelClass={labelClass} />
    </>
  );
}
