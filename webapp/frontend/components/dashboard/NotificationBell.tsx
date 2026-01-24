"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useUnreadMessageCount, usePendingProposalCount } from "@/lib/hooks";
import { parentCommunicationsAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Bell, CreditCard, Users, ChevronRight, MessageSquare, CalendarClock } from "lucide-react";
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
  location?: string;
  tutorId?: number;
  showOverduePayments?: boolean;
}

interface NotificationItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  severity: "danger" | "warning";
  href: string;
}

export function NotificationBell({ pendingPayments, location, tutorId, showOverduePayments = false }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Fetch contact-needed count
  const { data: contactNeeded } = useSWR(
    ['contact-needed-count', tutorId, location],
    () => parentCommunicationsAPI.getContactNeededCount(tutorId, location)
  );

  // Fetch unread message count
  const { data: unreadMessages } = useUnreadMessageCount(tutorId);

  // Fetch pending proposals count
  const { data: pendingProposals } = usePendingProposalCount(tutorId);

  // Build notification items
  const notifications = useMemo(() => {
    const items: NotificationItem[] = [];

    if (showOverduePayments && pendingPayments > 0) {
      items.push({
        id: "payments",
        icon: <CreditCard className="h-4 w-4" />,
        label: "Overdue Payments",
        count: pendingPayments,
        severity: "danger",
        href: "/overdue-payments",
      });
    }

    if (contactNeeded?.count && contactNeeded.count > 0) {
      items.push({
        id: "parent-contact",
        icon: <Users className="h-4 w-4" />,
        label: "Parent Contact Needed",
        count: contactNeeded.count,
        severity: "warning",
        href: "/parent-contacts",
      });
    }

    if (unreadMessages?.count && unreadMessages.count > 0) {
      items.push({
        id: "messages",
        icon: <MessageSquare className="h-4 w-4" />,
        label: "Unread Messages",
        count: unreadMessages.count,
        severity: "warning",
        href: "/inbox",
      });
    }

    if (pendingProposals?.count && pendingProposals.count > 0) {
      items.push({
        id: "proposals",
        icon: <CalendarClock className="h-4 w-4" />,
        label: "Pending Make-up Confirmations",
        count: pendingProposals.count,
        severity: "warning",
        href: "/inbox?category=MakeupConfirmation",
      });
    }

    return items;
  }, [showOverduePayments, pendingPayments, contactNeeded, unreadMessages, pendingProposals]);

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
