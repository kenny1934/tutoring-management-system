"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { billingAPI } from "@/lib/billing-api";
import { Home, Users, Calendar, BookOpen, Inbox, RefreshCcw, CreditCard, FileText, Sun, ClipboardList, GraduationCap, CalendarCheck, CalendarRange, Map, Clock, Landmark } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { TONES } from "@/lib/tones";
import { useBillingQueueCounts } from "@/lib/hooks/useBillingQueueCounts";
import {
  useUnreadMessageCount,
  useRenewalCounts,
  usePendingExtensionCount,
  useUnseenUpdates,
  useSummerSidebarBadge,
  useRegularSidebarBadge,
  useRegularIntakeOpen,
  useDashboardStats,
} from "@/lib/hooks";

/**
 * The app's pages and the counts shown beside them, shared by the sidebar on
 * a wider screen and the bottom bar and its More sheet on a phone, so the two
 * never list different pages or disagree about a count. The counts are SWR
 * hooks, so the sidebar and the phone's bar read the same cache and fetch
 * each count once.
 */

export const MAIN_NAV = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Students", href: "/students", icon: Users },
  { name: "Sessions", href: "/sessions", icon: Calendar },
  { name: "Courseware", href: "/courseware", icon: BookOpen },
  { name: "Curriculum", href: "/curriculum", icon: Map },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Inbox", href: "/inbox", icon: Inbox },
];

// Only Admins, Super Admins and Supervisors see these.
export const ADMIN_NAV = [
  { name: "Renewals", href: "/admin/renewals", icon: RefreshCcw },
  { name: "Payment plans", href: "/billing", icon: CalendarRange },
  { name: "Autopay", href: "/admin/autopay", icon: Landmark },
  { name: "Overdue payments", href: "/overdue-payments", icon: CreditCard },
  { name: "Extensions", href: "/admin/extensions", icon: Clock },
  { name: "Waitlist", href: "/admin/waitlist", icon: ClipboardList },
  { name: "Tutors", href: "/admin/tutors", icon: GraduationCap },
  { name: "Summer course", href: "/admin/summer", icon: Sun },
  { name: "Regular intake", href: "/admin/regular", icon: CalendarCheck },
];

export type NavItem = (typeof MAIN_NAV)[number];

export function useNavigation() {
  const { user, isGuest, isSupervisor, canViewAdminPages, effectiveRole, isImpersonating, impersonatedTutor } = useAuth();
  const { selectedLocation, mounted } = useLocation();

  // Whose inbox and counts these are. Impersonating a tutor shows theirs.
  const currentTutorId = (isImpersonating && effectiveRole === "Tutor" && impersonatedTutor?.id)
    ? impersonatedTutor.id
    : user?.id;

  const isAdminOrAbove = canViewAdminPages;
  const billingScope = JSON.stringify([user?.id, effectiveRole, isImpersonating, impersonatedTutor?.id]);
  const { data: billingOptions, error: billingOptionsError } = useSWR(
    isAdminOrAbove ? ['billing-queue-options', billingScope] : null,
    billingAPI.options,
    { revalidateOnFocus: false, keepPreviousData: false },
  );
  const adminNavigation = ADMIN_NAV.filter(item => item.name !== "Autopay" || (!billingOptionsError && billingOptions?.queue_available));
  // Guests have no inbox, and Supervisors see only broadcasts, so neither has
  // an unread count.
  const hasInbox = !isGuest;
  const { data: unreadCount } = useUnreadMessageCount(isGuest || isSupervisor ? undefined : currentTutorId);
  const hasUnseenUpdates = useUnseenUpdates();

  const queue = useBillingQueueCounts({ enabled: isAdminOrAbove && mounted, location: selectedLocation });
  const legacyReminders = queue.available === false;
  const { data: dashboardStats } = useDashboardStats(selectedLocation, undefined, mounted && legacyReminders);
  const { data: renewalCounts } = useRenewalCounts(isAdminOrAbove && legacyReminders, selectedLocation);
  // A combined payment is one task. Never add the older enrollment totals.
  const pendingPayments = queue.available
    ? queue.data?.overdue ?? 0
    : legacyReminders ? dashboardStats?.pending_payment_enrollments ?? 0 : 0;
  const renewalsToPrepare = queue.available
    ? queue.data?.actionable
    : legacyReminders ? renewalCounts?.total : undefined;
  const { data: extensionCount } = usePendingExtensionCount(isAdminOrAbove, selectedLocation);
  const { isOpen: summerIsOpen, actionableCount: summerActionable } = useSummerSidebarBadge(
    isAdminOrAbove,
    selectedLocation,
  );
  const { isOpen: regularIsOpen, actionableCount: regularActionable } = useRegularSidebarBadge(
    isAdminOrAbove,
    selectedLocation,
  );

  // Course Renewal is a seasonal surface: it only means anything while the
  // September intake is taking applications, so it appears for the window and
  // then goes away rather than sitting empty for ten months. The dates come
  // from the intake config, so moving the window in the config editor moves
  // this too.
  const intakeOpen = useRegularIntakeOpen(!isGuest);
  // It goes in above Inbox rather than at the end. For the weeks it is here it
  // is a job somebody has to finish, and the end of the list is where an item
  // goes to be missed.
  const mainNavigation = useMemo(() => {
    const items = MAIN_NAV.filter((item) => hasInbox || item.name !== "Inbox");
    if (!intakeOpen) return items;
    const renewal = { name: "Course renewal", href: "/course-renewal", icon: CalendarCheck };
    const inboxAt = items.findIndex((item) => item.name === "Inbox");
    if (inboxAt === -1) return [...items, renewal];
    return [...items.slice(0, inboxAt), renewal, ...items.slice(inboxAt)];
  }, [intakeOpen, hasInbox]);

  // Per-item badge state for the admin nav. Renewals turns red when any
  // enrollment has expired; Overdue Payments is always red. Summer Course and
  // Regular Intake show an "Open" pill (or a dot when collapsed) during their
  // application window when there's nothing to triage.
  const adminBadgeFor = (name: string) => {
    const count =
      name === "Renewals" ? renewalsToPrepare
      : name === "Overdue payments" ? pendingPayments
      : name === "Extensions" ? extensionCount?.count
      : name === "Summer course" ? summerActionable
      : name === "Regular intake" ? regularActionable
      : 0;
    const color =
      name === "Overdue payments" ? TONES.danger.solid
      : name === "Renewals" && legacyReminders && (renewalCounts?.expired ?? 0) > 0 ? TONES.danger.solid
      : TONES.warning.solid;
    const isIntakeOpen =
      (name === "Summer course" && summerIsOpen) ||
      (name === "Regular intake" && regularIsOpen);
    const showOpen = isIntakeOpen && (count ?? 0) <= 0;
    return { count, color, showOpen };
  };

  return {
    currentTutorId,
    isAdminOrAbove,
    hasInbox,
    unreadCount: unreadCount?.count ?? 0,
    unreadLoaded: unreadCount !== undefined,
    hasUnseenUpdates,
    pendingPayments,
    mainNavigation,
    adminNavigation,
    adminBadgeFor,
  };
}
