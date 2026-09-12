"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, ChevronDown, Loader2, PenTool, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPrintButtonTitle, type PrintingState } from "@/lib/lesson-utils";

interface PrintAllMenuProps {
  /** The button's name, which is also its title while nothing is printing. */
  label: string;
  printing: PrintingState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrint: (type: "CW" | "HW") => void;
  /** The header's button class, so this button matches the ones beside it. */
  buttonClassName: string;
}

const itemClass = "w-full flex items-center gap-2 px-3 py-2 text-xs text-white/80 hover:bg-white/10 transition-colors";

/**
 * The header's print button, with its menu for printing all the classwork or
 * all the homework. The view holds whether the menu is open, because Escape
 * closes it as well. While anything prints, the button shows a spinner and
 * can't be pressed.
 */
export function PrintAllMenu({ label, printing, open, onOpenChange, onPrint, buttonClassName }: PrintAllMenuProps) {
  const busy = printing.id !== null;
  const choose = (type: "CW" | "HW") => {
    onOpenChange(false);
    onPrint(type);
  };

  return (
    <div className="relative">
      <button
        onClick={() => { if (!busy) onOpenChange(!open); }}
        disabled={busy}
        className={cn(
          buttonClassName, "gap-0.5",
          busy || open ? "bg-white/20 text-white" : "hover:bg-white/10 text-white/70"
        )}
        title={getPrintButtonTitle(busy, printing.progress, label)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60]"
              onClick={() => onOpenChange(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.1 }}
              className="absolute right-0 top-full mt-1 z-[61] bg-[#2d4739] dark:bg-[#1a2821] border border-white/10 rounded-lg shadow-xl overflow-hidden min-w-[140px]"
            >
              <button onClick={() => choose("CW")} className={itemClass}>
                <PenTool className="h-3 w-3 text-rose-400" /> Print all CW
              </button>
              <button onClick={() => choose("HW")} className={itemClass}>
                <BookOpen className="h-3 w-3 text-blue-400" /> Print all HW
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
