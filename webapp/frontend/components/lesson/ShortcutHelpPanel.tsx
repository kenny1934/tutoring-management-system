"use client";

import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** One row of the help panel: the key or keys, then what they do. */
export type ShortcutRow = readonly [keys: string, description: string];

interface ShortcutHelpPanelProps {
  open: boolean;
  onClose: () => void;
  rows: readonly ShortcutRow[];
}

/**
 * The lesson views' list of keyboard shortcuts, which drops down below the
 * header. Each view passes its own rows, because a few keys exist in only one
 * of them. A tap anywhere off the panel closes it.
 */
export function ShortcutHelpPanel({ open, onClose, rows }: ShortcutHelpPanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute right-2 z-[61]",
              "bg-[#2d4739] text-white rounded-lg shadow-xl border border-white/10",
              "px-4 py-3 w-56"
            )}
            style={{ top: 52, textShadow: '1px 1px 3px rgba(0,0,0,0.4)' }}
          >
            <h4 className="text-xs font-bold text-white/80 mb-2 uppercase tracking-wider">Keyboard Shortcuts</h4>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
              {rows.map(([keys, description]) => (
                <div key={keys} className="contents">
                  <kbd className="text-white/90 font-mono bg-white/10 px-1.5 py-0.5 rounded text-[10px] text-center">{keys}</kbd>
                  <span className="text-white/60 py-0.5">{description}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
