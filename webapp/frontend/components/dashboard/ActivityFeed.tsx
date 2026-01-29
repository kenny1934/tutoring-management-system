"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useActivityFeed } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
import { ActivityFeedModal } from "./ActivityFeedModal";
import {
  CheckCircle,
  CheckCircle2,
  DollarSign,
  UserPlus,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
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

const formatTime = (date: Date): string => {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  if (isToday) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  } else {
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
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

interface ActivityFeedProps {
  className?: string;
  isMobile?: boolean;
  tutorId?: number;
}

export function ActivityFeed({ className, isMobile = false, tutorId }: ActivityFeedProps) {
  const { selectedLocation } = useLocation();
  const { data: apiEvents, isLoading } = useActivityFeed(selectedLocation, tutorId, 10);
  const [showModal, setShowModal] = useState(false);

  const events = useMemo(() => {
    if (!apiEvents) return [];
    return apiEvents.map(e => ({
      ...e,
      time: new Date(e.timestamp)
    }));
  }, [apiEvents]);

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

  if (isLoading) {
    return (
      <div className={cn(
        "bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden",
        !isMobile && "paper-texture",
        className
      )}>
        <div className="px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628]">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f]" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Recent Activity</h3>
          </div>
        </div>
        <div className="p-4 space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 shimmer-sepia rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className={cn(
        "bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden",
        !isMobile && "paper-texture",
        className
      )}>
        <div className="px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628]">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f]" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Recent Activity</h3>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Clock className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No recent activity</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Session updates will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden",
      !isMobile && "paper-texture",
      className
    )}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f]" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Recent Activity</h3>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="text-xs text-[#a0704b] dark:text-[#cd853f] hover:underline"
          >
            View All
          </button>
        </div>
      </div>

      {/* Journal entries with ruled lines */}
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

                      {/* Content area - responsive single line on desktop */}
                      <div className="flex-1 py-1.5 px-3 min-w-0 flex items-baseline justify-between gap-2">
                        {/* Left: Title + student info (inline on md+) */}
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

                        {/* Right: Time */}
                        <span className="flex-shrink-0 text-[10px] font-mono text-gray-400 dark:text-gray-500 whitespace-nowrap">
                          {formatTime(event.time)}
                        </span>
                      </div>
                    </div>
                  );

                  return event.link ? (
                    <Link key={event.id} href={event.link} className="block">
                      {content}
                    </Link>
                  ) : (
                    <div key={event.id}>{content}</div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* View All Modal */}
      <ActivityFeedModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        tutorId={tutorId}
      />
    </div>
  );
}
