"use client";

import { useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useActivityFeed } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
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

// Event types and their configurations (aligned with session-status.ts)
const EVENT_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; bgColor: string }> = {
  session_attended: {
    icon: CheckCircle,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50/80 dark:bg-green-900/20",
  },
  makeup_completed: {
    // Attended (Make-up) - yellow icon like session-status.ts
    icon: CheckCircle2,
    color: "text-yellow-400 dark:text-yellow-300",
    bgColor: "bg-green-50/80 dark:bg-green-900/20",
  },
  session_cancelled: {
    icon: XCircle,
    color: "text-red-500 dark:text-red-400",
    bgColor: "bg-red-50/80 dark:bg-red-900/20",
  },
  session_rescheduled: {
    // Pending Make-up status
    icon: AlertTriangle,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50/80 dark:bg-orange-900/20",
  },
  sick_leave: {
    // Pending Make-up status
    icon: AlertTriangle,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50/80 dark:bg-orange-900/20",
  },
  weather_cancelled: {
    // Pending Make-up status
    icon: AlertTriangle,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50/80 dark:bg-orange-900/20",
  },
  makeup_booked: {
    // Make-up Booked status
    icon: Loader2,
    color: "text-gray-500 dark:text-gray-400",
    bgColor: "bg-gray-100/80 dark:bg-gray-800/20",
  },
  payment_received: {
    icon: DollarSign,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50/80 dark:bg-blue-900/20",
  },
  new_enrollment: {
    icon: UserPlus,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50/80 dark:bg-purple-900/20",
  },
};

// Format relative time
const formatRelativeTime = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

interface ActivityFeedProps {
  className?: string;
  isMobile?: boolean;
  tutorId?: number;
}

export function ActivityFeed({ className, isMobile = false, tutorId }: ActivityFeedProps) {
  const { selectedLocation } = useLocation();
  // Pass tutorId to filter for "My View" mode
  const { data: apiEvents, isLoading } = useActivityFeed(selectedLocation, tutorId);

  // Map API events to component format with Date objects
  const events = useMemo(() => {
    if (!apiEvents) return [];
    return apiEvents.map(e => ({
      ...e,
      time: new Date(e.timestamp)
    }));
  }, [apiEvents]);

  // Show loading skeleton
  if (isLoading) {
    return (
      <div
        className={cn(
          "bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden",
          !isMobile && "paper-texture",
          className
        )}
      >
        <div className="px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628]">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f]" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Recent Activity</h3>
          </div>
        </div>
        <div className="p-4 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-6 h-6 rounded-full shimmer-sepia" />
              <div className="flex-1 space-y-2">
                <div className="h-4 shimmer-sepia rounded w-3/4" />
                <div className="h-3 shimmer-sepia rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Show empty state if no events
  if (!events.length) {
    return (
      <div
        className={cn(
          "bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden",
          !isMobile && "paper-texture",
          className
        )}
      >
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
    <div
      className={cn(
        "bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden",
        !isMobile && "paper-texture",
        className
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628]">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f]" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            Recent Activity
          </h3>
        </div>
      </div>

      {/* Timeline */}
      <div className="p-4">
        <div className="relative">
          {/* Connecting line */}
          <div className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-[#e8d4b8] dark:bg-[#6b5a4a]" />

          {/* Events */}
          <div className="space-y-4">
            {events.map((event) => {
              const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.session_attended;
              const Icon = config.icon;

              const content = (
                <div className="relative flex gap-3">
                  {/* Icon */}
                  <div
                    className={cn(
                      "relative z-10 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
                      config.bgColor
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5", config.color)} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {event.title}
                        </p>
                        {event.student && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                            <span className="text-gray-400 dark:text-gray-500">
                              {selectedLocation === "All Locations" && event.location ? `${event.location}-` : ""}
                              {event.school_student_id || "N/A"}
                            </span>
                            {" "}{event.student}
                            {event.description && (
                              <span className="text-gray-400 dark:text-gray-500">
                                {" "}
                                &middot; {event.description}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <span className="flex-shrink-0 text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {formatRelativeTime(event.time)}
                      </span>
                    </div>
                  </div>
                </div>
              );

              return event.link ? (
                <Link
                  key={event.id}
                  href={event.link}
                  className="block hover:bg-[#f5ede3]/50 dark:hover:bg-[#3d3628]/50 hover:translate-x-0.5 -mx-2 px-2 py-1 rounded-lg transition-all cursor-pointer"
                >
                  {content}
                </Link>
              ) : (
                <div key={event.id} className="-mx-2 px-2 py-1 rounded-lg transition-colors hover:bg-[#f5ede3]/30 dark:hover:bg-[#3d3628]/30">{content}</div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
