"use client";

import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { FocusModeState } from "@/hooks/useFocusMode";

interface FocusOverlaysProps {
  focus: FocusModeState;
  /** The view's header, drawn as it looks when it slides down over the worksheet. */
  header: ReactNode;
  /** The view's sidebar, which slides in from the left. */
  sidebar: ReactNode;
  sidebarWidth: number;
}

/**
 * What focus mode brings back over the worksheet: the header, which slides
 * down while the mouse rests at the top of the screen, and the sidebar, which
 * slides in from the left edge. useFocusMode watches the mouse, and this only
 * draws what it decides.
 *
 * While the sidebar is out, a tap anywhere off it closes it, because a finger
 * can't simply move away from it the way a mouse does. That layer sits above
 * everything on the worksheet, the folded answer key included.
 */
export function FocusOverlays({ focus, header, sidebar, sidebarWidth }: FocusOverlaysProps) {
  const { hoverHeader, setHoverHeader, hoverSidebar, setHoverSidebar } = focus;
  return (
    <>
      <div
        className="absolute top-0 left-0 right-0 z-50"
        style={{ height: hoverHeader ? "auto" : 0 }}
        onMouseLeave={() => setHoverHeader(false)}
      >
        <AnimatePresence>
          {hoverHeader && (
            <motion.div
              initial={{ y: "-100%" }}
              animate={{ y: 0 }}
              exit={{ y: "-100%" }}
              transition={{ duration: 0.15 }}
            >
              {header}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {hoverSidebar && (
        <div className="absolute inset-0 z-40 bg-black/10" onPointerDown={() => setHoverSidebar(false)} />
      )}

      <div
        className="absolute top-0 left-0 bottom-0 z-50"
        style={{ width: hoverSidebar ? sidebarWidth : 0 }}
        onMouseLeave={() => setHoverSidebar(false)}
      >
        <AnimatePresence>
          {hoverSidebar && (
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.15 }}
              className={cn(
                "h-full flex flex-col border-r shadow-2xl",
                "bg-[#faf5ed] dark:bg-[#1e1a14]",
                "border-[#d4c4a8] dark:border-[#3a3228]"
              )}
              style={{ width: sidebarWidth }}
            >
              {sidebar}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
