"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { History, Star } from "lucide-react";
import type { Session } from "@/types";
import { cn } from "@/lib/utils";

interface BookmarkTabProps {
  previousSession: Session["previous_session"];
}

export function BookmarkTab({ previousSession }: BookmarkTabProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!previousSession) return null;

  // Count star rating
  const starCount = (previousSession.performance_rating || "").split("⭐").length - 1;

  return (
    <div className="fixed right-0 top-1/4 z-40">
      <motion.div
        initial={{ x: 280 }}
        animate={{ x: isExpanded ? 0 : 280 }}
        transition={{ type: "spring", stiffness: 200, damping: 25 }}
        className="flex"
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
      >
        {/* Bookmark Tab (sticks out) */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="relative h-32 w-12 bg-[#d4a574] dark:bg-[#8b6f47] rounded-l-lg shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center border-l-4 border-t-4 border-b-4 border-[#a67c52] dark:border-[#6b5537]"
          style={{
            background: 'linear-gradient(to right, #d4a574, #c9985f)',
          }}
        >
          {/* Tab texture */}
          <div className="absolute inset-0 opacity-20 rounded-l-lg" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04' numOctaves='5' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23paper)' opacity='0.5'/%3E%3C/svg%3E")`,
          }} />

          {/* Vertical text */}
          <div className="relative flex flex-col items-center gap-1">
            <History className="h-5 w-5 text-white/90" />
            <div
              className="text-xs font-semibold text-white/90 tracking-wider"
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                textShadow: '0 1px 2px rgba(0,0,0,0.3)',
              }}
            >
              PREV
            </div>
          </div>

          {/* Notification dot */}
          {previousSession.performance_rating && (
            <span className="absolute top-2 right-2 w-2 h-2 bg-warning rounded-full animate-pulse" />
          )}
        </button>

        {/* Expanded Content Card */}
        <div className="w-72 bg-[#fef9f3] dark:bg-[#2d2618] shadow-2xl border-4 border-[#d4a574] dark:border-[#8b6f47] rounded-r-lg overflow-hidden">
          {/* Paper texture background */}
          <div className="absolute inset-0 opacity-30 pointer-events-none" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04' numOctaves='5' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23paper)' opacity='0.5'/%3E%3C/svg%3E")`,
          }} />

          <div className="relative p-5">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-dashed border-[#d4a574]/30">
              <History className="h-4 w-4 text-[#8b6f47]" />
              <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">Previous Session</h3>
            </div>

            {/* Date and Status */}
            <div className="space-y-3 mb-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Date</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {new Date(previousSession.session_date).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {previousSession.time_slot || "N/A"}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Status</span>
                <Badge variant="success" className="text-xs">
                  {previousSession.session_status}
                </Badge>
              </div>
            </div>

            {/* Performance Rating */}
            {previousSession.performance_rating && (
              <div className="mb-4 p-3 bg-warning/10 rounded-lg border border-warning/20">
                <p className="text-xs text-muted-foreground mb-2">Performance</p>
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          "h-3.5 w-3.5",
                          i < starCount
                            ? "text-warning fill-warning"
                            : "text-muted-foreground/30 fill-muted-foreground/30"
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-semibold text-warning">
                    {starCount}/5
                  </span>
                </div>
              </div>
            )}

            {/* Notes Preview */}
            {previousSession.notes && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Session Notes</p>
                <div className="p-3 bg-background/50 rounded border border-border/50">
                  <p className="text-xs leading-relaxed line-clamp-4 text-foreground/80 italic">
                    {previousSession.notes}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
