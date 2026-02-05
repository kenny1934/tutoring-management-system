"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useActivityFeed } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
import type { ActivityEvent } from "@/types";
import {
  CheckCircle,
  CheckCircle2,
  DollarSign,
  UserPlus,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  X,
  ChevronDown,
} from "lucide-react";

// Event types with styling for colored strip with integrated icon
const EVENT_CONFIG: Record<string, {
  icon: typeof CheckCircle;
  borderColor: string;
  stripBg: string;
  stripBgDark: string;
  iconColor: string;
  iconColorDark: string;
}> = {
  session_attended: {
    icon: CheckCircle,
    borderColor: "border-l-green-500",
    stripBg: "bg-green-100/40",
    stripBgDark: "dark:bg-green-900/30",
    iconColor: "text-green-600",
    iconColorDark: "dark:text-green-400",
  },
  makeup_completed: {
    icon: CheckCircle2,
    borderColor: "border-l-yellow-500",
    stripBg: "bg-yellow-100/40",
    stripBgDark: "dark:bg-yellow-900/30",
    iconColor: "text-yellow-500",
    iconColorDark: "dark:text-yellow-400",
  },
  session_cancelled: {
    icon: XCircle,
    borderColor: "border-l-red-500",
    stripBg: "bg-red-100/40",
    stripBgDark: "dark:bg-red-900/30",
    iconColor: "text-red-500",
    iconColorDark: "dark:text-red-400",
  },
  session_rescheduled: {
    icon: AlertTriangle,
    borderColor: "border-l-orange-500",
    stripBg: "bg-orange-100/40",
    stripBgDark: "dark:bg-orange-900/30",
    iconColor: "text-orange-600",
    iconColorDark: "dark:text-orange-400",
  },
  sick_leave: {
    icon: AlertTriangle,
    borderColor: "border-l-orange-500",
    stripBg: "bg-orange-100/40",
    stripBgDark: "dark:bg-orange-900/30",
    iconColor: "text-orange-600",
    iconColorDark: "dark:text-orange-400",
  },
  weather_cancelled: {
    icon: AlertTriangle,
    borderColor: "border-l-orange-500",
    stripBg: "bg-orange-100/40",
    stripBgDark: "dark:bg-orange-900/30",
    iconColor: "text-orange-600",
    iconColorDark: "dark:text-orange-400",
  },
  makeup_booked: {
    icon: Loader2,
    borderColor: "border-l-gray-400",
    stripBg: "bg-gray-100/40",
    stripBgDark: "dark:bg-gray-800/30",
    iconColor: "text-gray-500",
    iconColorDark: "dark:text-gray-400",
  },
  payment_received: {
    icon: DollarSign,
    borderColor: "border-l-blue-500",
    stripBg: "bg-blue-100/40",
    stripBgDark: "dark:bg-blue-900/30",
    iconColor: "text-blue-600",
    iconColorDark: "dark:text-blue-400",
  },
  new_enrollment: {
    icon: UserPlus,
    borderColor: "border-l-purple-500",
    stripBg: "bg-purple-100/40",
    stripBgDark: "dark:bg-purple-900/30",
    iconColor: "text-purple-600",
    iconColorDark: "dark:text-purple-400",
  },
};

const BATCH_SIZE = 50;

const formatTime = (date: Date): string => {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  if (isToday) {
    // Today: just show time "10:30 AM"
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } else {
    // Other days: show "Jan 15, 10:30 AM"
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  }
};

const formatDate = (date: Date): string => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

// Format full timestamp for tooltip
const formatFullTimestamp = (date: Date): string => {
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
};

// Extract username from email
const extractUsername = (email?: string): string | undefined => {
  if (!email) return undefined;
  return email.includes('@') ? email.split('@')[0] : email;
};

interface ActivityFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  tutorId?: number;
}

export function ActivityFeedModal({ isOpen, onClose, tutorId }: ActivityFeedModalProps) {
  const { selectedLocation } = useLocation();
  const [mounted, setMounted] = useState(false);
  const [offset, setOffset] = useState(0);
  const [allEvents, setAllEvents] = useState<ActivityEvent[]>([]);
  const [hasMore, setHasMore] = useState(true);

  // Fetch current batch
  const { data: newBatch, isLoading } = useActivityFeed(
    selectedLocation,
    tutorId,
    BATCH_SIZE,
    offset
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setOffset(0);
      setAllEvents([]);
      setHasMore(true);
    }
  }, [isOpen]);

  // Derived values for stable dependency array (avoids React array size error)
  const batchLength = newBatch?.length ?? 0;
  const firstBatchId = newBatch?.[0]?.id ?? '';

  // Append new batch to accumulated events
  useEffect(() => {
    if (newBatch && isOpen) {
      if (offset === 0) {
        setAllEvents(newBatch);
      } else {
        // Deduplicate by event id to avoid React key warnings
        setAllEvents(prev => {
          const existingIds = new Set(prev.map(e => e.id));
          const uniqueNew = newBatch.filter(e => !existingIds.has(e.id));
          return [...prev, ...uniqueNew];
        });
      }
      // If we got less than a full batch, there's no more
      setHasMore(newBatch.length === BATCH_SIZE);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchLength, firstBatchId, offset, isOpen]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleLoadMore = useCallback(() => {
    setOffset(prev => prev + BATCH_SIZE);
  }, []);

  // Transform events with Date objects
  const events = useMemo(() => {
    return allEvents.map(e => ({
      ...e,
      time: new Date(e.timestamp)
    }));
  }, [allEvents]);

  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups: Record<string, typeof events> = {};
    events.forEach(event => {
      const dateKey = formatDate(event.time);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(event);
    });
    return groups;
  }, [events]);

  // Loading more (not initial load)
  const isLoadingMore = isLoading && offset > 0;
  const isInitialLoading = isLoading && offset === 0;

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        style={{ width: "100%", maxWidth: "42rem" }}
        className={cn(
          "relative",
          "bg-[#fef9f3] dark:bg-[#2d2618]",
          "border-2 border-[#d4a574] dark:border-[#8b6f47]",
          "rounded-xl shadow-xl",
          "paper-texture",
          "max-h-[85vh] flex flex-col"
        )}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628] rounded-t-xl">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f]" />
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">All Activity</h2>
            {events.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({events.length} events)
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[#e8d4b8]/50 dark:hover:bg-[#6b5a4a]/50 transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isInitialLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-12 shimmer-sepia rounded" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No activity found</p>
            </div>
          ) : (
            <div className="relative">
              {/* Red margin line */}
              <div className="absolute left-10 top-0 bottom-0 w-px bg-red-300/50 dark:bg-red-700/30" />

              <div className="p-4 pl-2 ruled-lines">
                {Object.entries(groupedEvents).map(([dateLabel, dateEvents]) => (
                  <div key={dateLabel} className="mb-4">
                    {/* Date header */}
                    <div className="flex items-center gap-2 mb-2 pl-2">
                      <span
                        className="text-xs font-bold text-[#a0704b] dark:text-[#cd853f] uppercase tracking-wide"
                        style={{ fontFamily: "'Permanent Marker', cursive" }}
                      >
                        {dateLabel}
                      </span>
                      <div className="flex-1 h-px bg-[#e8d4b8] dark:bg-[#6b5a4a]" />
                    </div>

                    {/* Events for this date */}
                    <div className="space-y-1">
                      {dateEvents.map((event) => {
                        const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.session_attended;
                        const Icon = config.icon;

                        const content = (
                          <div className="flex rounded-r overflow-hidden hover:bg-[#f5ede3]/50 dark:hover:bg-[#3d3628]/50 transition-colors">
                            {/* Colored strip with icon */}
                            <div className={cn(
                              "w-9 flex-shrink-0 border-l-3 flex items-center justify-center",
                              config.borderColor,
                              config.stripBg,
                              config.stripBgDark
                            )}>
                              <Icon className={cn("h-3.5 w-3.5", config.iconColor, config.iconColorDark)} />
                            </div>

                            {/* Content area */}
                            <div className="flex-1 py-1.5 px-3 min-w-0 flex items-baseline justify-between gap-2">
                              {/* Left: Title + student info */}
                              <div className="min-w-0 flex flex-wrap md:flex-nowrap items-baseline gap-x-1.5">
                                <span className="text-sm text-gray-900 dark:text-gray-100">
                                  {event.title}
                                </span>
                                {event.student && (
                                  <>
                                    <span className="hidden md:inline text-gray-400 dark:text-gray-500">&middot;</span>
                                    <span className="w-full md:w-auto text-xs text-gray-600 dark:text-gray-400 truncate">
                                      <span className="text-gray-400 dark:text-gray-500">
                                        {selectedLocation === "All Locations" && event.location ? `${event.location}-` : ""}
                                        {event.school_student_id || "N/A"}
                                      </span>
                                      {" "}{event.student}
                                      {event.description && (
                                        <span className="text-gray-400 dark:text-gray-500">
                                          {" "}&middot; {event.description}
                                        </span>
                                      )}
                                    </span>
                                  </>
                                )}
                              </div>

                              {/* Right: Modified by + Time */}
                              <span
                                className="flex-shrink-0 text-[10px] font-mono text-gray-400 dark:text-gray-500 whitespace-nowrap"
                                title={formatFullTimestamp(event.time)}
                              >
                                {event.modified_by && (
                                  <span className="text-gray-500 dark:text-gray-400 mr-1">
                                    {extractUsername(event.modified_by)}
                                  </span>
                                )}
                                {formatTime(event.time)}
                              </span>
                            </div>
                          </div>
                        );

                        return event.link ? (
                          <Link key={event.id} href={event.link} className="block" onClick={onClose}>
                            {content}
                          </Link>
                        ) : (
                          <div key={event.id}>{content}</div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Load More Button */}
                {hasMore && (
                  <div className="pt-4 pb-2 flex justify-center">
                    <button
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                        "bg-[#e8d4b8]/50 dark:bg-[#6b5a4a]/50",
                        "hover:bg-[#e8d4b8] dark:hover:bg-[#6b5a4a]",
                        "text-[#5c4934] dark:text-[#e8d4b8]",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      {isLoadingMore ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4" />
                          Load More
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
