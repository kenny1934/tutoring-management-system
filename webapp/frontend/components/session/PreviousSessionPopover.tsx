"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Info, X } from "lucide-react";
import type { Session } from "@/types";

interface PreviousSessionPopoverProps {
  previousSession: Session["previous_session"];
}

export function PreviousSessionPopover({ previousSession }: PreviousSessionPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!previousSession) return null;

  return (
    <div className="relative">
      {/* Trigger Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg bg-warning/10 border border-warning/30 hover:bg-warning/20 transition-colors"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Info className="h-5 w-5 text-warning" />
        {/* Badge indicator */}
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-warning rounded-full border-2 border-background" />
      </motion.button>

      {/* Popover */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40"
            />

            {/* Popover Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="absolute top-12 right-0 z-50 w-80 glass border border-warning/30 rounded-lg shadow-2xl p-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-warning" />
                  <h3 className="font-semibold text-sm">Previous Session</h3>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-background/50 rounded transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Content */}
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {new Date(previousSession.session_date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {previousSession.time_slot || "N/A"}
                    </p>
                  </div>
                  <Badge variant="success" className="text-xs">
                    {previousSession.session_status}
                  </Badge>
                </div>

                {previousSession.performance_rating && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Performance</p>
                    <p className="text-lg font-semibold text-warning">
                      {previousSession.performance_rating}
                    </p>
                  </div>
                )}

                {previousSession.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-xs leading-relaxed line-clamp-4 text-foreground/80">
                      {previousSession.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Helper text */}
              <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                💡 Context from the last session to help prepare
              </p>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
