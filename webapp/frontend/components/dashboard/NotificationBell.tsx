"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCalendarEvents } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Bell, CreditCard, BookOpen, ChevronRight } from "lucide-react";
import {
  useFloating,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useInteractions,
  FloatingPortal,
} from "@floating-ui/react";

interface NotificationBellProps {
  pendingPayments: number;
}

interface NotificationItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  severity: "danger" | "warning";
  href: string;
}

export function NotificationBell({ pendingPayments }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Fetch calendar events for upcoming tests
  const { data: events = [] } = useCalendarEvents(7);

  // Count tests this week
  const testsThisWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return events.filter((event) => {
      const eventDate = new Date(event.start_date + "T00:00:00");
      const daysUntil = Math.ceil(
        (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysUntil >= 0 && daysUntil <= 7;
    }).length;
  }, [events]);

  // Build notification items
  const notifications = useMemo(() => {
    const items: NotificationItem[] = [];

    if (pendingPayments > 0) {
      items.push({
        id: "payments",
        icon: <CreditCard className="h-4 w-4" />,
        label: "Overdue Payments",
        count: pendingPayments,
        severity: "danger",
        href: "/enrollments?status=pending",
      });
    }

    if (testsThisWeek > 0) {
      items.push({
        id: "tests",
        icon: <BookOpen className="h-4 w-4" />,
        label: "Tests This Week",
        count: testsThisWeek,
        severity: "warning",
        href: "#tests-calendar",
      });
    }

    return items;
  }, [pendingPayments, testsThisWeek]);

  const totalCount = notifications.reduce((sum, n) => sum + n.count, 0);

  // Floating UI
  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [
      offset(8),
      flip({ fallbackAxisSideDirection: "end" }),
      shift({ padding: 8 }),
    ],
    placement: "bottom-end",
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
  ]);

  const severityStyles = {
    danger: {
      bg: "bg-red-50 dark:bg-red-900/20",
      border: "border-red-200 dark:border-red-800",
      icon: "text-red-500",
      text: "text-red-700 dark:text-red-300",
      badge: "bg-red-500 text-white",
    },
    warning: {
      bg: "bg-orange-50 dark:bg-orange-900/20",
      border: "border-orange-200 dark:border-orange-800",
      icon: "text-orange-500",
      text: "text-orange-700 dark:text-orange-300",
      badge: "bg-orange-500 text-white",
    },
  };

  // Hide completely if no notifications
  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        className={cn(
          "relative p-2 rounded-full transition-all",
          "hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]",
          isOpen && "bg-[#f5ede3] dark:bg-[#3d3628]"
        )}
        aria-label={`${totalCount} notifications`}
      >
        <Bell className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
        {/* Badge */}
        <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
          {totalCount > 99 ? "99+" : totalCount}
        </span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className={cn(
              "z-50 w-72 py-2",
              "bg-white dark:bg-[#1a1a1a] rounded-lg shadow-lg",
              "border border-[#e8d4b8] dark:border-[#6b5a4a]"
            )}
          >
            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-[#e8d4b8] dark:border-[#6b5a4a] mb-1">
              Notifications
            </div>

            <div className="px-2 space-y-1">
              {notifications.map((item) => {
                const styles = severityStyles[item.severity];
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all",
                      "hover:scale-[1.01]",
                      styles.bg,
                      styles.border
                    )}
                  >
                    <div className={cn("flex-shrink-0", styles.icon)}>
                      {item.icon}
                    </div>
                    <span
                      className={cn("flex-1 text-sm font-medium", styles.text)}
                    >
                      {item.label}
                    </span>
                    <span
                      className={cn(
                        "flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full",
                        styles.badge
                      )}
                    >
                      {item.count}
                    </span>
                    <ChevronRight
                      className={cn("h-3.5 w-3.5 flex-shrink-0", styles.icon)}
                    />
                  </Link>
                );
              })}
            </div>
          </div>
        </FloatingPortal>
      )}
    </div>
  );
}
