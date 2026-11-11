"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useUnreadMessageCount, usePendingProposalCount, useRenewalCounts, useUncheckedAttendanceCount, usePendingExtensionCount, useTerminationReviewCount, useAgedPendingMakeupsCount, useEmploymentOverrun, useUnlistedWaitingCount } from "@/lib/hooks";
import { departureLabel } from "@/lib/employment";
import { useBillingQueueCounts } from "@/lib/hooks/useBillingQueueCounts";
import { useRole } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { parentCommunicationsAPI, arkLeaveAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Bell, CreditCard, Phone, ChevronRight, MessageSquare, CalendarClock, RefreshCcw, ClipboardList, Clock, UserMinus, AlertTriangle, Calendar, UserPlus } from "lucide-react";
import {
  useFloating,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
  useTransitionStyles,
} from "@floating-ui/react";
import { useNotificationReturn } from "./useNotificationReturn";
import { useBackToClose } from "@/hooks/useBackToClose";
import { useReducedMotion } from "framer-motion";
import { fitToScreen } from "@/hooks/usePopoverSheet";

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
  /** Optional second line, for when a count alone does not say enough. */
  detail?: string;
  count: number;
  severity: "danger" | "warning";
  href: string;
}

export function NotificationBell({ pendingPayments, location, tutorId, showOverduePayments = false }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { viewMode } = useRole();
  const { isGuest } = useAuth();
  const source = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const following = useRef(false);
  const openNow = useRef(isOpen); openNow.current = isOpen;
  useEffect(() => { if (isOpen) following.current = false; }, [isOpen]);
  const { list, changeOpen, follow } = useNotificationReturn(`${tutorId}:${location}:${viewMode}`, setIsOpen, source);
  useBackToClose(isOpen, () => setIsOpen(false));

  // Fetch contact-needed count (skip for guests — endpoint is guest-blocked)
  const { data: contactNeeded } = useSWR(
    isGuest ? null : ['contact-needed-count', tutorId, location],
    () => parentCommunicationsAPI.getContactNeededCount(tutorId, location)
  );

  // Fetch unread message count
  const { data: unreadMessages } = useUnreadMessageCount(tutorId);

  // Fetch pending proposals count
  const { data: pendingProposals } = usePendingProposalCount(tutorId);

  const queue = useBillingQueueCounts({ enabled: showOverduePayments, location });
  const legacyReminders = queue.available === false;
  const { data: renewalCounts } = useRenewalCounts(showOverduePayments && legacyReminders, location);
  const renewalsToPrepare = queue.available
    ? queue.data?.actionable ?? 0
    : legacyReminders ? renewalCounts?.total ?? 0 : 0;
  const overduePayments = queue.available
    ? queue.data?.overdue ?? 0
    : legacyReminders ? pendingPayments : 0;
  const expiredRenewals = legacyReminders && (renewalCounts?.expired ?? 0) > 0;

  // Fetch pending extension count (only for admins)
  const { data: pendingExtensions } = usePendingExtensionCount(showOverduePayments, location);

  // Lessons taught before they were in CSM, waiting for an enrolment (admin only)
  const { data: waitingTaught } = useUnlistedWaitingCount(showOverduePayments, location);

  // Fetch unchecked attendance count
  // For admins in center-view: show all tutors at location (no tutorId filter)
  // For tutors or my-view: show only own sessions (filter by tutorId)
  const uncheckedAttendanceTutorId = (showOverduePayments && viewMode === 'center-view') ? undefined : tutorId;
  const { data: uncheckedAttendance } = useUncheckedAttendanceCount(location, uncheckedAttendanceTutorId);

  // Fetch termination review count (skip for guests — endpoint is guest-blocked)
  const { data: reviewCount } = useTerminationReviewCount(location, tutorId, !isGuest);

  // Fetch aged pending makeups count (all users with tutorId)
  const { data: agedMakeups } = useAgedPendingMakeupsCount(tutorId);

  // Work booked past a leaver's last working day (admin only — tutors cannot
  // reassign anything, and a colleague's leaving date is not theirs to learn
  // from a badge)
  const { data: overrun } = useEmploymentOverrun(showOverduePayments);

  // Fetch ARK pending leave count (admin only)
  const { data: pendingLeave } = useSWR(
    showOverduePayments ? "ark-leave-pending-count" : null,
    () => arkLeaveAPI.getPendingCount(),
    { refreshInterval: 60000, revalidateOnFocus: false }
  );

  // Build notification items
  const notifications = useMemo(() => {
    const items: NotificationItem[] = [];

    // Renewals needing attention (admin only)
    if (showOverduePayments && renewalsToPrepare > 0) {
      items.push({
        id: "renewals",
        icon: <RefreshCcw className="h-4 w-4" />,
        label: "Renewals",
        count: renewalsToPrepare,
        severity: expiredRenewals ? "danger" : "warning",
        href: "/admin/renewals",
      });
    }

    if (showOverduePayments && waitingTaught?.count && waitingTaught.count > 0) {
      items.push({
        id: "taught-not-in-csm",
        icon: <UserPlus className="h-4 w-4" />,
        label: "Taught but not in CSM yet",
        count: waitingTaught.count,
        severity: "warning",
        href: "/admin/renewals#taught",
      });
    }

    if (showOverduePayments && overduePayments > 0) {
      items.push({
        id: "payments",
        icon: <CreditCard className="h-4 w-4" />,
        label: "Overdue Payments",
        count: overduePayments,
        severity: "danger",
        href: "/overdue-payments",
      });
    }

    // Pending extension requests (admin only)
    if (showOverduePayments && pendingExtensions?.count && pendingExtensions.count > 0) {
      items.push({
        id: "extensions",
        icon: <Clock className="h-4 w-4" />,
        label: "Pending Extensions",
        count: pendingExtensions.count,
        severity: "warning",
        href: "/admin/extensions",
      });
    }

    // Pending leave requests (admin only, from ARK)
    if (showOverduePayments && pendingLeave?.count && pendingLeave.count > 0) {
      items.push({
        id: "leave-requests",
        icon: <Calendar className="h-4 w-4" />,
        label: "Pending Leave Requests",
        count: pendingLeave.count,
        severity: "warning",
        href: "/", // Visible in leave dropdown on dashboard
      });
    }

    // Unchecked attendance (all users)
    if (uncheckedAttendance?.total && uncheckedAttendance.total > 0) {
      items.push({
        id: "unchecked-attendance",
        icon: <ClipboardList className="h-4 w-4" />,
        label: "Unchecked Attendance",
        count: uncheckedAttendance.total,
        severity: uncheckedAttendance.critical > 0 ? "danger" : "warning",
        href: "/unchecked-attendance",
      });
    }

    // Aged pending makeups (all users)
    if (agedMakeups?.count && agedMakeups.count > 0) {
      items.push({
        id: "aged-makeups",
        icon: <AlertTriangle className="h-4 w-4" />,
        label: "Makeups awaiting follow-up",
        count: agedMakeups.count,
        severity: agedMakeups.critical > 0 ? "danger" : "warning",
        href: "/sessions?filter=pending-makeups",
      });
    }

    if (contactNeeded?.count && contactNeeded.count > 0) {
      items.push({
        id: "parent-contact",
        icon: <Phone className="h-4 w-4" />,
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

    // Lessons standing in the diary for somebody who is leaving (admin only).
    // It appears as soon as ARK reports the date rather than on the day they
    // go, because a month of notice is a month to move the work.
    if (showOverduePayments && overrun?.total_sessions) {
      const [first, ...others] = overrun.leavers;
      items.push({
        id: "after-last-day",
        icon: <UserMinus className="h-4 w-4" />,
        label: "Sessions After a Tutor's Last Day",
        detail: others.length
          ? `${first.tutor_name} and ${others.length === 1 ? "one other" : `${others.length} others`}`
          : `${first.tutor_name} ${departureLabel(first)?.toLowerCase() ?? ""}`.trim(),
        count: overrun.total_sessions,
        // Urgency comes from the server, the way it does for renewals,
        // attendance and make-ups, rather than being recomputed from dates
        // here. It turns red once somebody's last day is behind us or a week
        // away, when there is no longer time to arrange cover calmly.
        severity: overrun.critical_sessions > 0 ? "danger" : "warning",
        href: "/sessions?filter=after-last-day",
      });
    }

    if (reviewCount?.in_review_period && reviewCount.count > 0) {
      items.push({
        id: "termination-review",
        icon: <UserMinus className="h-4 w-4" />,
        label: "Termination Reasons Needed",
        count: reviewCount.count,
        severity: "warning",
        href: "/terminated-students",
      });
    }

    return items;
  }, [showOverduePayments, overduePayments, renewalsToPrepare, expiredRenewals, contactNeeded, unreadMessages, pendingProposals, waitingTaught, pendingExtensions, uncheckedAttendance, agedMakeups, reviewCount, pendingLeave, overrun]);

  const totalCount = notifications.reduce((sum, n) => sum + n.count, 0);

  // Floating UI
  const { refs, floatingStyles, context } = useFloating<HTMLButtonElement>({
    open: isOpen,
    onOpenChange: changeOpen,
    middleware: [
      offset(8),
      flip({ fallbackAxisSideDirection: "end" }),
      shift({ padding: 8 }),
      fitToScreen(),
    ],
    placement: "bottom-end",
  });

  const { setFloating, domReference } = refs;
  const setPanel = useCallback((element: HTMLDivElement | null) => {
    setFloating(element);
    if (element) return;
    // Browser Back can clear focus itself. Wait until the exiting portal releases focus.
    requestAnimationFrame(() => {
      const bell = domReference.current;
      if (!openNow.current && !following.current && bell?.isConnected && document.activeElement === document.body) bell.focus({ preventScroll: true });
    });
  }, [setFloating, domReference]);
  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: reduced ? 0 : { open: 140, close: 100 },
    initial: { opacity: 0, transform: "translateY(4px)" },
    open: { opacity: 1, transform: "translateY(0)" },
    close: { opacity: 0, transform: "translateY(2px)" },
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
      icon: "text-red-600",
      text: "text-red-700 dark:text-red-300",
      badge: "bg-red-700 text-white",
    },
    warning: {
      bg: "bg-orange-50 dark:bg-orange-900/20",
      border: "border-orange-200 dark:border-orange-800",
      icon: "text-orange-700",
      text: "text-orange-700 dark:text-orange-300",
      badge: "bg-orange-700 text-white",
    },
  };

  // Hide completely if no notifications
  if (notifications.length === 0) {
    return null;
  }

  // Determine badge color based on severity (red if any danger, orange if only warnings)
  const hasDanger = notifications.some(n => n.severity === 'danger');
  const badgeColor = hasDanger ? 'bg-red-700' : 'bg-orange-700';

  return (
    <div className="relative">
      <button
        ref={element => { source.current = element; refs.setReference(element); }}
        {...getReferenceProps()}
        className={cn(
          "relative min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 p-2.5 rounded-full transition-all flex items-center justify-center",
          "hover:bg-tint",
          isOpen && "bg-tint"
        )}
        aria-label={`${totalCount} notifications`}
      >
        <Bell className="h-5 w-5 text-accent-ink" />
        {/* Badge */}
        <span className={cn("absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white rounded-full", badgeColor)}>
          {totalCount > 99 ? "99+" : totalCount}
        </span>
      </button>

      {/* Dropdown */}
      {isMounted && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} initialFocus={-1} returnFocus={refs.domReference} closeOnFocusOut={false}>
          <div
            ref={setPanel}
            style={floatingStyles}
            {...getFloatingProps()}
            className={cn(
              "z-50 w-72 max-w-[calc(100vw-16px)]"
            )}
            aria-label="Notifications"
            role="dialog"
            inert={!isOpen}
          >
            <div style={transitionStyles} className="py-2 bg-raised rounded-lg shadow-lg border border-line">
            <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-line mb-1">
              Notifications
            </div>

            <div ref={list} className="px-2 space-y-1 max-h-[min(60dvh,480px)] overflow-y-auto overscroll-contain">
              {notifications.map((item) => {
                const styles = severityStyles[item.severity];
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={event => {
                      if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) following.current = true;
                      follow(event, item.id);
                    }}
                    data-notification-item={item.id}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors",
                      styles.bg,
                      styles.border
                    )}
                  >
                    <div className={cn("flex-shrink-0", styles.icon)}>
                      {item.icon}
                    </div>
                    <span
                      className={cn("flex-1 min-w-0 text-sm font-medium", styles.text)}
                    >
                      {item.label}
                      {/* A count on its own says how much but not who, and for
                          a departure the name is the part you act on. */}
                      {item.detail && (
                        <span className={cn("block text-xs font-normal opacity-80 truncate")}>
                          {item.detail}
                        </span>
                      )}
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
          </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </div>
  );
}
