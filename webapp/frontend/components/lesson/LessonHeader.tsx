"use client";

import { Fragment, type ComponentProps, type ReactNode } from "react";
import {
  ArrowLeft, Download, HelpCircle, Loader2, Maximize2, Minimize2, Sigma, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FocusModeState } from "@/hooks/useFocusMode";
import { InkSaveStatus } from "./InkSaveStatus";
import { PrintAllMenu, type PrintAllMenuProps } from "./PrintAllMenu";

/** One of the small details after the lesson's name, such as its date. */
export interface HeaderDetail {
  icon: LucideIcon;
  text: string;
}

interface LessonHeaderProps {
  /** Draws the header that focus mode brings back from the top edge, which floats over the page. */
  overlay?: boolean;
  focus: Pick<FocusModeState, "focusMode" | "exitFocusMode" | "toggleFocusMode">;
  /** The exit button's name when it leaves the lesson. */
  exitLabel: string;
  /** The exit button's tooltip when it leaves the lesson. */
  exitTitle: string;
  onExit: () => void;
  /** Who or what the lesson is for, shown after the exit button. */
  info: ReactNode;
  details: HeaderDetail[];
  syncStatus: ComponentProps<typeof InkSaveStatus>["status"];
  wolframOpen: boolean;
  onWolframToggle: () => void;
  canDownloadAll: boolean;
  savingAll: boolean;
  onDownloadAll: () => void;
  print: Omit<PrintAllMenuProps, "buttonClassName">;
  helpOpen: boolean;
  onHelpToggle: () => void;
}

// Header buttons are 40px, big enough to hit with a finger at the board.
const headerButton = "min-w-10 h-10 px-2 inline-flex items-center justify-center rounded-lg transition-colors";

/**
 * The lesson views' header, drawn as a chalkboard in a wooden frame. Each
 * view says who the lesson is for and how leaving works, and the header
 * brings the buttons both views share. In focus mode the exit button leaves
 * focus mode first.
 */
export function LessonHeader({
  overlay, focus, exitLabel, exitTitle, onExit, info, details, syncStatus,
  wolframOpen, onWolframToggle, canDownloadAll, savingAll, onDownloadAll, print, helpOpen, onHelpToggle,
}: LessonHeaderProps) {
  const { focusMode, exitFocusMode, toggleFocusMode } = focus;

  return (
    <div className={cn(
      "relative rounded-2xl bg-gradient-to-br from-[#b89968] via-[#a67c52] to-[#8b6f47] p-1",
      overlay && "shadow-lg rounded-3xl"
    )}>
      {/* Chalkboard surface */}
      <div className={cn(
        "flex items-center gap-1.5 sm:gap-3 px-2 py-1 sm:px-3 sm:py-1.5",
        "bg-[#2d4739] dark:bg-[#1a2821]",
        "shadow-inner rounded-[12px]",
        overlay && "rounded-[20px]"
      )} style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.4)' }}>
        <button
          onClick={focusMode ? exitFocusMode : onExit}
          className={cn(headerButton, "hover:bg-white/10")}
          title={focusMode ? "Exit focus mode (Esc)" : exitTitle}
          aria-label={focusMode ? "Exit focus mode" : exitLabel}
        >
          <ArrowLeft className="h-5 w-5 text-white/80" />
        </button>

        {info}

        <div className="hidden sm:flex items-center gap-2 text-xs text-white/70 font-medium">
          {details.map(({ icon: Icon, text }, index) => (
            <Fragment key={index}>
              <span className="text-white/40">&bull;</span>
              <div className="flex items-center gap-1">
                <Icon className="h-3 w-3 text-white/80" />
                <span>{text}</span>
              </div>
            </Fragment>
          ))}
        </div>

        <div className="flex-1" />

        <InkSaveStatus status={syncStatus} className="hidden md:inline px-1" />

        <button
          onClick={onWolframToggle}
          className={cn(headerButton, wolframOpen ? "bg-white/20 text-white" : "hover:bg-white/10 text-white/70")}
          title="Wolfram Alpha (W)"
          aria-label="Wolfram Alpha"
          aria-pressed={wolframOpen}
        >
          <Sigma className="h-5 w-5" />
        </button>

        {/* Download All, at any time. Exit only offers it while some ink hasn't reached the server. */}
        <button
          onClick={onDownloadAll}
          disabled={savingAll || !canDownloadAll}
          className={cn(headerButton, "text-white/70 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent")}
          title="Download all ink as PDFs"
          aria-label="Download all ink as PDFs"
        >
          {savingAll ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
        </button>

        <PrintAllMenu {...print} buttonClassName={headerButton} />

        {/* A phone's header leaves out focus mode, which phones don't use, and the help, which is about keys. */}
        <button
          onClick={toggleFocusMode}
          className={cn(headerButton, "hidden md:inline-flex hover:bg-white/10")}
          title={focusMode ? "Exit focus mode (F)" : "Focus mode (F)"}
          aria-label="Focus mode"
          aria-pressed={focusMode}
        >
          {focusMode ? (
            <Minimize2 className="h-5 w-5 text-white/70" />
          ) : (
            <Maximize2 className="h-5 w-5 text-white/70" />
          )}
        </button>

        <button
          onClick={onHelpToggle}
          className={cn(
            headerButton, "hidden md:inline-flex",
            helpOpen ? "bg-white/20 text-white" : "hover:bg-white/10 text-white/40"
          )}
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
          aria-pressed={helpOpen}
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
