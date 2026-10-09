"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { PageSurface } from "@/components/layout/PageSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle, useUnlistedLessons, revalidateUnlistedLessons } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
import { RefreshCcw, Plus, AlertCircle, Clock, CheckCircle2, Copy, CreditCard, Eye, Send, ArrowRight, X, Search, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import useSWR, { mutate } from "swr";
import { enrollmentsAPI, RenewalListItem } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { formatTimeAgo, formatDaysAgo } from "@/lib/formatters";
import { CreateEnrollmentModal } from "@/components/enrollments/CreateEnrollmentModal";
import { EnrollmentDetailModal } from "@/components/enrollments/EnrollmentDetailModal";
import { FeeMessagePanel, renewalLessons } from "@/components/enrollments/FeeMessagePanel";
import { BatchRenewModal } from "@/components/enrollments/BatchRenewModal";
import { TaughtNotInCsmPanel, type TaughtStudent } from "@/components/enrollments/TaughtNotInCsmPanel";
import type { UnlistedLesson } from "@/types";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button, IconButton, Input, PageHeader } from "@/components/controls";

const EMPTY_TAUGHT: UnlistedLesson[] = [];

interface RenewalCardProps {
  renewal: RenewalListItem;
  index: number;
  isSelected: boolean;
  onClick: (enrollmentId: number) => void;
  onQuickRenew: (enrollmentId: number) => void;
  onViewRenewal: (originalId: number, renewalId: number) => void;
  expandedFeePanel: number | null;
  onToggleFeePanel: (enrollmentId: number | null) => void;
  onRefresh: () => void;
  // Batch selection
  isChecked: boolean;
  onToggleCheck: (enrollmentId: number) => void;
  showCheckbox: boolean;
  // Location context
  selectedLocation: string;
  // Read-only mode (Supervisor)
  readOnly?: boolean;
}

// An enrolment that ended over 30 days ago has usually not been renewed because
// the student stopped coming. Those stay on the page, in their own collapsed
// group, but they are left out of the counts, as the sidebar badge leaves them out.
const STALE_AFTER_DAYS = 30;
function isStale(r: RenewalListItem): boolean {
  return r.days_until_expiry < -STALE_AFTER_DAYS;
}

// The list reaches back more than a year, so a month and day alone can't say
// which year is meant. A date carries its year whenever it isn't this year's.
function cardDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

// How long ago, in the unit a person would use: days for the first fortnight,
// then weeks, then months, then years.
function howLongAgo(days: number): string {
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "a year ago" : `${years} years ago`;
}

// In the first week, "Expired 3d ago" is all an admin needs. After that the
// date itself matters, with how long ago so an old one can't pass for recent.
// formatDaysAgo starts "Today" and "Yesterday" with a capital, because they
// usually stand alone. After "Expired" they sit mid-sentence, so they drop it.
function expiredLabel(renewal: RenewalListItem): string {
  const daysAgo = -renewal.days_until_expiry;
  if (daysAgo >= 7) return `${cardDate(renewal.effective_end_date)} (${howLongAgo(daysAgo)})`;
  const ago = formatDaysAgo(renewal.effective_end_date);
  return ago === "Today" || ago === "Yesterday" ? ago.toLowerCase() : ago;
}

const RenewalCard = React.memo(function RenewalCard({ renewal, index, isSelected, onClick, onQuickRenew, onViewRenewal, expandedFeePanel, onToggleFeePanel, onRefresh, isChecked, onToggleCheck, showCheckbox, selectedLocation, readOnly = false }: RenewalCardProps) {
  const isExpired = renewal.days_until_expiry < 0;
  const isThisWeek = renewal.days_until_expiry >= 0 && renewal.days_until_expiry <= 7;
  const isVeryOld = renewal.days_until_expiry < -30;
  const isNextWeek = renewal.days_until_expiry > 7;
  const isFeePanelOpen = expandedFeePanel === renewal.id;

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleCheck(renewal.id);
  };

  // Show renewal info when renewal exists and isn't paid yet
  const showRenewalInfo = renewal.renewal_enrollment_id &&
    (renewal.renewal_status === 'pending_message' || renewal.renewal_status === 'message_sent');

  const handleRenewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onQuickRenew(renewal.id);
  };

  const handleViewRenewalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (renewal.renewal_enrollment_id) {
      onViewRenewal(renewal.id, renewal.renewal_enrollment_id);
    }
  };

  const handleCopyFeeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFeePanel(isFeePanelOpen ? null : renewal.id);
  };

  return (
    <div
      data-renewal-index={index}
      className={cn(
        "rounded-lg border transition-colors overflow-hidden scroll-my-24",
        // The urgency shows on the expiry line and the status mark, so the
        // card itself stays plain. A red edge on every expired card shouted.
        "bg-paper border-line hover:border-line-strong",
        // Selection ring
        isSelected && "ring-2 ring-primary ring-offset-2"
      )}
    >
      {/* Main card content - clickable */}
      <div
        onClick={() => onClick(renewal.id)}
        className="p-3 sm:p-4 cursor-pointer group"
      >
        <div className="flex items-start justify-between gap-2 sm:gap-4">
          {/* Checkbox for batch selection */}
          <div
            onClick={handleCheckboxClick}
            className={cn(
              "flex items-center justify-center transition-opacity",
              // With a mouse, the box waits for hover until something is
              // ticked. A phone or tablet has no hover, so there it always
              // shows, or nothing could ever be ticked to start a batch. The
              // padding gives a finger more than the 16px box to aim at.
              "-m-2 p-2 pt-2.5 [@media(pointer:coarse)]:-m-3 [@media(pointer:coarse)]:p-3 [@media(pointer:coarse)]:pt-3.5",
              !showCheckbox && "[@media(hover:hover)]:opacity-0 group-hover:opacity-100"
            )}
          >
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => {}}
              aria-label={`Select ${renewal.student_name}`}
              className="h-4 w-4 rounded border-gray-300 text-accent-ink focus:ring-primary cursor-pointer"
            />
          </div>
          <div className="flex-1 min-w-0">
            {/* Student info */}
            <div className="mb-1">
              <StudentInfoBadges
                student={{
                  student_id: renewal.student_id,
                  student_name: renewal.student_name,
                  school_student_id: renewal.school_student_id,
                  grade: renewal.grade,
                  lang_stream: renewal.lang_stream,
                  school: renewal.school,
                  home_location: renewal.location,
                }}
                showLocationPrefix={selectedLocation === "All Locations"}
              />
            </div>

            {/* Schedule info */}
            <div className="text-xs sm:text-sm text-foreground/70 mb-2 truncate">
              {renewal.assigned_day} {renewal.assigned_time} @ {renewal.location}
              <span className="text-foreground/50 ml-2 hidden sm:inline">with {renewal.tutor_name}</span>
            </div>

            {/* Status indicators */}
            <div className="flex items-center gap-3 text-xs">
              {isExpired ? (
                <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>Expired {expiredLabel(renewal)}</span>
                </div>
              ) : (
                <div className={cn(
                  "flex items-center gap-1",
                  isThisWeek
                    ? "text-orange-700 dark:text-orange-400"
                    : "text-foreground/60"
                )}>
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    Expires {cardDate(renewal.effective_end_date)}
                    {renewal.days_until_expiry === 0
                      ? " (today)"
                      : renewal.days_until_expiry === 1
                      ? " (tomorrow)"
                      : ` (${renewal.days_until_expiry} days)`
                    }
                  </span>
                </div>
              )}
              {renewal.sessions_remaining > 0 && (
                <div className="flex items-center gap-1 text-foreground/50">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{renewal.sessions_remaining} session{renewal.sessions_remaining !== 1 ? 's' : ''} remaining</span>
                </div>
              )}
            </div>

            {/* Renewal enrollment info (when renewal exists) */}
            {showRenewalInfo && renewal.renewal_first_lesson_date && (
              <div className="mt-2 text-xs flex flex-wrap items-center gap-1 sm:gap-2">
                <span className="text-blue-600 dark:text-blue-400 font-medium">Renewal:</span>
                <span className="text-foreground/70">
                  {cardDate(renewal.renewal_first_lesson_date)}
                </span>
                <span className="text-foreground/50 hidden sm:inline">|</span>
                <span className="text-foreground/70">{renewal.renewal_lessons_paid} lessons</span>
                <span className="text-foreground/50 hidden sm:inline">|</span>
                <span className={cn(
                  "font-medium",
                  renewal.renewal_payment_status === 'Paid'
                    ? "text-green-700 dark:text-green-400"
                    : "text-orange-700 dark:text-orange-400"
                )}>
                  {renewal.renewal_payment_status}
                </span>
              </div>
            )}
          </div>

          {/* Quick action buttons. With a mouse on a wider screen they wait for
              hover, and the status mark stands in for them until then. Without
              hover, on a phone or tablet, they always show. */}
          <div className="flex items-center gap-1 sm:gap-2">
            <div className={cn(
              "flex items-center gap-1 sm:gap-1.5 transition-opacity",
              "sm:[@media(hover:hover)]:opacity-0 sm:group-hover:opacity-100"
            )}>
              {showRenewalInfo ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Eye}
                  iconClassName="text-blue-600 dark:text-blue-400"
                  onClick={handleViewRenewalClick}
                  title="View renewal enrollment"
                  aria-label="View renewal enrollment"
                >
                  <span className="hidden sm:inline">View</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={RefreshCcw}
                  onClick={handleRenewClick}
                  disabled={readOnly}
                  title={readOnly ? "Read-only access" : "Create renewal"}
                  aria-label="Create renewal"
                >
                  <span className="hidden sm:inline">Renew</span>
                </Button>
              )}
              {renewal.renewal_enrollment_id && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Copy}
                  onClick={handleCopyFeeClick}
                  aria-pressed={isFeePanelOpen}
                  className={cn(isFeePanelOpen && "bg-tint")}
                  title="Copy fee message"
                  aria-label="Copy fee message"
                >
                  <span className="hidden sm:inline">Fee</span>
                </Button>
              )}
            </div>

            {/* Status mark, shown only where the buttons wait for hover */}
            <div className={cn(
              "hidden sm:[@media(hover:hover)]:flex items-center justify-center h-8 w-8 rounded-full transition-all",
              "sm:group-hover:opacity-0 sm:group-hover:w-0 sm:group-hover:h-0 overflow-hidden",
              showRenewalInfo
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                : isVeryOld
                ? "bg-gray-100 dark:bg-gray-800 text-foreground/40"
                : isExpired
                ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                : isThisWeek
                ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
                : isNextWeek
                ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                : "bg-gray-100 dark:bg-gray-800 text-foreground/40"
            )}>
              {showRenewalInfo ? (
                <Eye className="h-4 w-4" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expandable Fee Message Panel */}
      <AnimatePresence>
        {isFeePanelOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <FeeMessagePanel
              enrollment={renewal}
              onClose={() => onToggleFeePanel(null)}
              onMarkSent={onRefresh}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default function AdminRenewalsPage() {
  usePageTitle("Enrollment Renewals");
  const { user, isLoading, canViewAdminPages, isReadOnly } = useAuth();
  const { selectedLocation } = useLocation();
  const { showToast } = useToast();
  const [showExpired, setShowExpired] = useState(true);

  // Modal state
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [renewFromId, setRenewFromId] = useState<number | null>(null);
  // The lesson a tutor taught before it was in CSM, when the enrolment is made from one
  const [taughtLesson, setTaughtLesson] = useState<UnlistedLesson | null>(null);

  // Comparison mode state (original + renewal side-by-side)
  const [comparisonMode, setComparisonMode] = useState(false);
  const [comparisonOriginalId, setComparisonOriginalId] = useState<number | null>(null);
  const [comparisonRenewalId, setComparisonRenewalId] = useState<number | null>(null);

  // Track screen size for responsive modal layout
  const [isLargeScreen, setIsLargeScreen] = useState(true);
  useEffect(() => {
    const checkScreenSize = () => setIsLargeScreen(window.innerWidth >= 1024);
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Modal tab view for narrow screens (when detail + create are both open)
  const [modalTabView, setModalTabView] = useState<'detail' | 'create'>('detail');

  // Fee panel state
  const [expandedFeePanel, setExpandedFeePanel] = useState<number | null>(null);

  // Keyboard shortcuts help state
  const [showShortcutHints, setShowShortcutHints] = useState(false);
  const [isScrolledPastThreshold, setIsScrolledPastThreshold] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'not_renewed' | 'to_send' | 'awaiting_payment' | 'taught'>('not_renewed');
  // The bell links straight to the fourth tab
  useEffect(() => {
    if (window.location.hash === '#taught') setActiveTab('taught');
  }, []);

  // Collapsed urgency groups state (next_week and older_than_30_days collapsed by default)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(['next_week', 'older_than_30_days']));

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  // Keyboard navigation state
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Fee message pre-fetch cache, keyed by renewal enrolment ID. Each message is
  // in Chinese and for the number of lessons that renewal was created with.
  const feeMessageCache = useRef<Map<number, string>>(new Map());

  // Batch selection state
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchRenewModalOpen, setBatchRenewModalOpen] = useState(false);
  // The batch window checks the students it was opened with. It gets its own
  // copy of the selection, taken when it opens, because an array rebuilt on
  // every redraw made it check again whenever the list refreshed, and that
  // replaced the "renewals created" screen with a fresh check.
  const [batchRenewIds, setBatchRenewIds] = useState<number[]>([]);
  const openBatchRenew = () => {
    setBatchRenewIds(Array.from(checkedIds));
    setBatchRenewModalOpen(true);
  };
  // The enrollment window can't set a paid enrollment back to unpaid, so this asks first
  const [confirmPaidOpen, setConfirmPaidOpen] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch renewals list
  const { data: renewals, isLoading: renewalsLoading } = useSWR(
    user && canViewAdminPages ? ['renewals', selectedLocation, showExpired] : null,
    () => enrollmentsAPI.getRenewals({
      location: selectedLocation !== "All Locations" ? selectedLocation : undefined,
      include_expired: showExpired,
    }),
    { refreshInterval: 60000 }
  );

  // Students taught before their lessons were in CSM, for the fourth tab
  const { data: waitingTaught = EMPTY_TAUGHT } = useUnlistedLessons(
    user && canViewAdminPages
      ? { status: 'waiting', location: selectedLocation !== "All Locations" ? selectedLocation : undefined }
      : null
  );
  const taughtStudentCount = useMemo(() => new Set(waitingTaught.map((l) => l.student_id)).size, [waitingTaught]);

  // On a phone the tab bar scrolls sideways, and the last tab starts off-screen.
  // Opening the page on it from the bell would leave the selected tab out of
  // sight, so slide the bar until the selected tab shows. Only the bar moves,
  // never the page. It runs when the bar first appears and when the tab
  // changes, not on every refresh, so it never undoes a scroll by hand.
  const tabBarRef = useRef<HTMLDivElement>(null);
  const renewalsReady = renewals !== undefined;
  const hasTaught = waitingTaught.length > 0;
  useEffect(() => {
    const bar = tabBarRef.current;
    const tab = bar?.querySelector<HTMLElement>("[data-active]");
    if (!bar || !tab) return;
    const barBox = bar.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    if (tabBox.right > barBox.right) bar.scrollLeft += tabBox.right - barBox.right + 16;
    else if (tabBox.left < barBox.left) bar.scrollLeft -= barBox.left - tabBox.left + 16;
  }, [activeTab, isLoading, renewalsLoading, renewalsReady, hasTaught]);

  // Search filter helper
  const matchesSearch = useCallback((r: RenewalListItem) => {
    if (!debouncedSearch) return true;
    const query = debouncedSearch.toLowerCase();
    return (
      r.student_name.toLowerCase().includes(query) ||
      (r.school_student_id?.toLowerCase().includes(query) ?? false)
    );
  }, [debouncedSearch]);

  // Group by renewal status (workflow stages) with search filtering
  const notRenewedList = useMemo(() =>
    renewals?.filter(r => r.renewal_status === 'not_renewed' && matchesSearch(r))
      .sort((a, b) => a.days_until_expiry - b.days_until_expiry) || []
  , [renewals, matchesSearch]);

  const toSendList = useMemo(() =>
    renewals?.filter(r => r.renewal_status === 'pending_message' && matchesSearch(r))
      .sort((a, b) => a.days_until_expiry - b.days_until_expiry) || []
  , [renewals, matchesSearch]);

  const awaitingPaymentList = useMemo(() =>
    renewals?.filter(r => r.renewal_status === 'message_sent' && matchesSearch(r))
      .sort((a, b) => a.days_until_expiry - b.days_until_expiry) || []
  , [renewals, matchesSearch]);

  // Tab counts leave out the stale group, the way the headline and the sidebar
  // badge do. The cards themselves still show under "Older than 30 days".
  const notRenewedListCount = useMemo(() => notRenewedList.filter(r => !isStale(r)).length, [notRenewedList]);
  const toSendListCount = useMemo(() => toSendList.filter(r => !isStale(r)).length, [toSendList]);
  const awaitingPaymentListCount = useMemo(() => awaitingPaymentList.filter(r => !isStale(r)).length, [awaitingPaymentList]);

  // Active tab's list
  const activeList = useMemo(() => {
    switch (activeTab) {
      case 'not_renewed': return notRenewedList;
      case 'to_send': return toSendList;
      case 'awaiting_payment': return awaitingPaymentList;
      case 'taught': return [];
    }
  }, [activeTab, notRenewedList, toSendList, awaitingPaymentList]);

  // Split into urgency groups - single-pass for efficiency
  const { recentExpiredItems, thisWeekItems, nextWeekItems, olderExpiredItems } = useMemo(() => {
    const groups = {
      recentExpiredItems: [] as RenewalListItem[],
      thisWeekItems: [] as RenewalListItem[],
      nextWeekItems: [] as RenewalListItem[],
      olderExpiredItems: [] as RenewalListItem[],
    };

    for (const r of activeList) {
      if (isStale(r)) {
        groups.olderExpiredItems.push(r);
      } else if (r.days_until_expiry < 0) {
        groups.recentExpiredItems.push(r);
      } else if (r.days_until_expiry <= 7) {
        groups.thisWeekItems.push(r);
      } else {
        groups.nextWeekItems.push(r);
      }
    }

    // The lists run soonest expiry first, which in this group would put the
    // oldest, from a year back, at the top. The most recent are the likeliest
    // to still come back, so they lead instead.
    groups.olderExpiredItems.reverse();

    return groups;
  }, [activeList]);

  // Navigable items (excluding collapsed sections) for keyboard navigation
  const navigableItems = useMemo(() => {
    const items: typeof activeList = [];
    if (!collapsedGroups.has('expired')) items.push(...recentExpiredItems);
    if (!collapsedGroups.has('this_week')) items.push(...thisWeekItems);
    if (!collapsedGroups.has('next_week')) items.push(...nextWeekItems);
    if (!collapsedGroups.has('older_than_30_days')) items.push(...olderExpiredItems);
    return items;
  }, [activeList, recentExpiredItems, thisWeekItems, nextWeekItems, olderExpiredItems, collapsedGroups]);

  // Navigation index Map for O(1) lookups instead of O(n) findIndex
  const navIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    navigableItems.forEach((item, idx) => map.set(item.id, idx));
    return map;
  }, [navigableItems]);

  // Pre-fetch fee messages for active list so M key is instant
  useEffect(() => {
    if (!activeList || activeList.length === 0) return;

    let cancelled = false;

    activeList.forEach(item => {
      if (!item.renewal_enrollment_id) return;
      const enrollmentId = item.renewal_enrollment_id;
      if (!feeMessageCache.current.has(enrollmentId)) {
        enrollmentsAPI.getFeeMessage(enrollmentId, 'zh', renewalLessons(item))
          .then(response => {
            if (!cancelled) {
              feeMessageCache.current.set(enrollmentId, response.message);
            }
          })
          .catch(() => {}); // Silently fail — will fetch on demand
      }
    });

    return () => { cancelled = true; };
  }, [activeList]);

  // Pre-compute section checkbox states to avoid repeated calculations
  const sectionStates = useMemo(() => ({
    expired: {
      all: recentExpiredItems.length > 0 && recentExpiredItems.every(r => checkedIds.has(r.id)),
      some: recentExpiredItems.some(r => checkedIds.has(r.id)),
    },
    thisWeek: {
      all: thisWeekItems.length > 0 && thisWeekItems.every(r => checkedIds.has(r.id)),
      some: thisWeekItems.some(r => checkedIds.has(r.id)),
    },
    nextWeek: {
      all: nextWeekItems.length > 0 && nextWeekItems.every(r => checkedIds.has(r.id)),
      some: nextWeekItems.some(r => checkedIds.has(r.id)),
    },
    olderThan30Days: {
      all: olderExpiredItems.length > 0 && olderExpiredItems.every(r => checkedIds.has(r.id)),
      some: olderExpiredItems.some(r => checkedIds.has(r.id)),
    },
  }), [recentExpiredItems, thisWeekItems, nextWeekItems, olderExpiredItems, checkedIds]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // The batch window and the payment confirmation handle their own keys.
      // Without this, Enter on their buttons also opened the selected card, Space
      // ticked cards behind them, and Esc wiped the whole selection.
      if (batchRenewModalOpen || confirmPaidOpen) return;
      // Skip navigation if modal is open (only allow Escape)
      if (detailModalOpen || createModalOpen || comparisonMode) {
        if (e.key === 'Escape') handleCloseAll();
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => {
            const next = (prev ?? -1) + 1;
            return Math.min(next, navigableItems.length - 1);
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => {
            const next = (prev ?? 0) - 1;
            return Math.max(next, 0);
          });
          break;
        case 'Enter':
          if (selectedIndex !== null && navigableItems[selectedIndex]) {
            handleCardClick(navigableItems[selectedIndex].id);
          }
          break;
        case 'r':
          if (selectedIndex !== null && navigableItems[selectedIndex] &&
              navigableItems[selectedIndex].renewal_status === 'not_renewed') {
            handleQuickRenew(navigableItems[selectedIndex].id);
          }
          break;
        case 'f':
          if (selectedIndex !== null && navigableItems[selectedIndex] &&
              navigableItems[selectedIndex].renewal_enrollment_id) {
            const id = navigableItems[selectedIndex].id;
            setExpandedFeePanel(prev => prev === id ? null : id);
          }
          break;
        case 'm': {
          // Quick copy fee message for selected renewal (uses pre-fetched cache)
          const item = selectedIndex !== null ? navigableItems[selectedIndex] : undefined;
          const enrollmentId = item?.renewal_enrollment_id;
          if (item && enrollmentId) {
            const cached = feeMessageCache.current.get(enrollmentId);

            if (cached) {
              // Instant copy from cache
              navigator.clipboard.writeText(cached)
                .then(() => showToast("Fee message copied!"))
                .catch(() => showToast("Failed to copy to clipboard", "error"));
            } else {
              // Fallback to API call if not yet cached
              enrollmentsAPI.getFeeMessage(enrollmentId, 'zh', renewalLessons(item))
                .then(response => {
                  feeMessageCache.current.set(enrollmentId, response.message);
                  navigator.clipboard.writeText(response.message)
                    .then(() => showToast("Fee message copied!"))
                    .catch(() => showToast("Failed to copy to clipboard", "error"));
                })
                .catch(() => showToast("Failed to generate fee message", "error"));
            }
          }
          break;
        }
        case ' ':  // Spacebar to toggle checkbox
          e.preventDefault();
          if (selectedIndex !== null && navigableItems[selectedIndex]) {
            toggleCheck(navigableItems[selectedIndex].id);
          }
          break;
        case 'Escape':
          // Each press undoes one thing, the most recent kind first, so closing
          // a fee panel never costs a long selection as well.
          if (showShortcutHints) setShowShortcutHints(false);
          else if (expandedFeePanel !== null) setExpandedFeePanel(null);
          else if (selectedIndex !== null) setSelectedIndex(null);
          else if (searchQuery) setSearchQuery("");
          else clearChecked();
          break;
        case '?':
          e.preventDefault();
          setShowShortcutHints(prev => !prev);
          break;
        case '/':
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, navigableItems, detailModalOpen, createModalOpen, comparisonMode, showToast, showShortcutHints,
      batchRenewModalOpen, confirmPaidOpen, expandedFeePanel, searchQuery]);

  // Reset selection when switching tabs or toggling collapse
  useEffect(() => {
    setSelectedIndex(null);
    setExpandedFeePanel(null);
  }, [activeTab, collapsedGroups]);

  // Scroll to keep selected card visible (manual calculation like sessions page)
  useEffect(() => {
    if (selectedIndex === null) return;

    const element = document.querySelector(`[data-renewal-index="${selectedIndex}"]`);
    const scrollContainer = scrollContainerRef.current;
    if (!element || !scrollContainer) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const cardRect = element.getBoundingClientRect();

    // Card position relative to container's scroll position
    const cardTopInContainer = cardRect.top - containerRect.top + scrollContainer.scrollTop;

    // Target: position card 1/3 from top
    const targetScroll = cardTopInContainer - (containerRect.height / 3);

    // Only scroll if needed (card is near edges)
    const currentCardTop = cardRect.top - containerRect.top;
    const topPadding = 40;
    const bottomPadding = 80;

    const isNearTop = currentCardTop < topPadding;
    const isNearBottom = cardRect.bottom > containerRect.bottom - bottomPadding;

    if (isNearTop || isNearBottom) {
      scrollContainer.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
    }
  }, [selectedIndex]);

  // Track scroll position for button positioning
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      setIsScrolledPastThreshold(scrollContainer.scrollTop > 300);
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // Handler: New enrollment (direct to create modal)
  const handleNewEnrollment = () => {
    setRenewFromId(null);
    setDetailModalOpen(false);
    setCreateModalOpen(true);
  };

  // Handler: Card click opens detail modal (or comparison mode if renewal exists)
  const handleCardClick = (enrollmentId: number) => {
    // Find the renewal item to check if it has a renewal
    const item = renewals?.find(r => r.id === enrollmentId);

    // If item has renewal (in To Send or Awaiting Payment tabs), open comparison mode
    if (item?.renewal_enrollment_id &&
        (item.renewal_status === 'pending_message' || item.renewal_status === 'message_sent')) {
      setComparisonOriginalId(enrollmentId);
      setComparisonRenewalId(item.renewal_enrollment_id);
      setComparisonMode(true);
    } else {
      // Normal single detail view
      setSelectedEnrollmentId(enrollmentId);
      setDetailModalOpen(true);
      // Reset tab view for new enrollment
      setModalTabView('detail');
    }
  };

  // Handler: Quick renew from list (without opening detail modal)
  const handleQuickRenew = (enrollmentId: number) => {
    setSelectedEnrollmentId(enrollmentId);
    setDetailModalOpen(true);
    setRenewFromId(enrollmentId);
    setCreateModalOpen(true);
    // Close fee panel if open
    setExpandedFeePanel(null);
  };

  // Handler: View renewal enrollment detail (opens comparison mode)
  const handleViewRenewal = (originalId: number, renewalEnrollmentId: number) => {
    setComparisonOriginalId(originalId);
    setComparisonRenewalId(renewalEnrollmentId);
    setComparisonMode(true);
    // Close fee panel if open
    setExpandedFeePanel(null);
  };

  // Handler: Create Renewal from detail modal - KEEP detail open for side-by-side
  const handleCreateRenewal = (enrollmentId: number) => {
    setRenewFromId(enrollmentId);
    setCreateModalOpen(true);
    // On narrow screens, auto-switch to create tab
    if (!isLargeScreen) {
      setModalTabView('create');
    }
  };

  const handleDetailModalClose = () => {
    setDetailModalOpen(false);
    setSelectedEnrollmentId(null);
    // If form is also open, close it too
    if (createModalOpen && renewFromId) {
      setCreateModalOpen(false);
      setRenewFromId(null);
    }
  };

  const handleCreateModalClose = () => {
    setCreateModalOpen(false);
    setRenewFromId(null);
    setTaughtLesson(null);
  };

  const handleCreateFromTaught = (student: TaughtStudent) => {
    setRenewFromId(student.latestEnrolmentId);
    setTaughtLesson(student.lessons[0]);
    setCreateModalOpen(true);
  };

  const handleCloseAll = () => {
    setDetailModalOpen(false);
    setSelectedEnrollmentId(null);
    setCreateModalOpen(false);
    setRenewFromId(null);
    setTaughtLesson(null);
    // Also close comparison mode
    setComparisonMode(false);
    setComparisonOriginalId(null);
    setComparisonRenewalId(null);
  };

  const handleRefresh = async () => {
    // Refresh the renewals list and counts without closing modals
    feeMessageCache.current.clear(); // Invalidate pre-fetched messages
    await Promise.all([
      mutate(['renewals', selectedLocation, showExpired]),
      mutate(['renewal-counts', selectedLocation]),
      revalidateUnlistedLessons(),
    ]);
  };

  const handleSuccess = () => {
    handleRefresh();
    // Close all modals on success
    handleCloseAll();
  };

  // Batch selection handlers
  const toggleCheck = (id: number) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearChecked = () => {
    setCheckedIds(new Set());
  };

  // Section checkbox helpers
  const isAllSectionChecked = (items: RenewalListItem[]) =>
    items.length > 0 && items.every(r => checkedIds.has(r.id));

  const isSomeSectionChecked = (items: RenewalListItem[]) =>
    items.some(r => checkedIds.has(r.id));

  const toggleSectionCheck = (items: RenewalListItem[], e: React.MouseEvent) => {
    e.stopPropagation();
    const allChecked = isAllSectionChecked(items);
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (allChecked) {
        items.forEach(r => next.delete(r.id));
      } else {
        items.forEach(r => next.add(r.id));
      }
      return next;
    });
  };

  // Clear selection and search when switching tabs
  useEffect(() => {
    setCheckedIds(new Set());
    setSearchQuery("");
  }, [activeTab]);

  // Batch action handlers
  const handleBatchMarkPaid = async () => {
    if (checkedIds.size === 0) return;
    setBatchLoading(true);
    try {
      // For "awaiting_payment" tab, we need to mark the RENEWAL enrollments as paid
      // The checkedIds contain the original enrollment IDs, so we need to find the renewal IDs
      // Use `renewals` (full unfiltered list) instead of `activeList` (search-filtered) so items
      // selected across different search queries are all found
      const renewalIds = Array.from(checkedIds)
        .map(id => renewals?.find(r => r.id === id)?.renewal_enrollment_id)
        .filter((id): id is number => id !== null && id !== undefined);

      if (renewalIds.length > 0) {
        // Optimistic update: immediately remove checked items from cache
        const swrKey = ['renewals', selectedLocation, showExpired];
        const idsToRemove = new Set(checkedIds);
        mutate(swrKey, (current: RenewalListItem[] | undefined) =>
          current?.filter(r => !idsToRemove.has(r.id)), false
        );
        clearChecked();

        try {
          const result = await enrollmentsAPI.batchMarkPaid(renewalIds);
          if (result.count < renewalIds.length) {
            const failed = renewalIds.length - result.count;
            showToast(`${result.count} payment${result.count !== 1 ? 's' : ''} confirmed, ${failed} failed`, "info");
          } else {
            showToast(`${result.count} payment${result.count !== 1 ? 's' : ''} confirmed`, "success");
          }
        } finally {
          handleRefresh();
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      showToast(`Failed to confirm payments: ${errorMsg}`, "error");
      handleRefresh();
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchMarkSent = async () => {
    if (checkedIds.size === 0) return;
    setBatchLoading(true);
    try {
      // For "to_send" tab, we need to mark the RENEWAL enrollments' fee_message_sent
      // Use `renewals` (full unfiltered list) instead of `activeList` (search-filtered)
      const renewalIds = Array.from(checkedIds)
        .map(id => renewals?.find(r => r.id === id)?.renewal_enrollment_id)
        .filter((id): id is number => id !== null && id !== undefined);

      if (renewalIds.length > 0) {
        // Optimistic update: immediately remove checked items from cache
        const swrKey = ['renewals', selectedLocation, showExpired];
        const idsToRemove = new Set(checkedIds);
        mutate(swrKey, (current: RenewalListItem[] | undefined) =>
          current?.filter(r => !idsToRemove.has(r.id)), false
        );
        clearChecked();

        try {
          const result = await enrollmentsAPI.batchMarkSent(renewalIds);
          if (result.count < renewalIds.length) {
            const failed = renewalIds.length - result.count;
            showToast(`${result.count} marked as sent, ${failed} failed`, "info");
          } else {
            showToast(`${result.count} message${result.count !== 1 ? 's' : ''} marked as sent`, "success");
          }
        } finally {
          handleRefresh();
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      showToast(`Failed to mark messages as sent: ${errorMsg}`, "error");
      handleRefresh();
    } finally {
      setBatchLoading(false);
    }
  };

  // Determine if we should show checkboxes (when any item is checked)
  const showCheckboxes = checkedIds.size > 0;

  return (
    <PageSurface fullHeight>
      <PageTransition className="flex flex-col h-full p-4 sm:p-6">
        <div className="flex flex-col h-full bg-paper dark:bg-raised rounded-xl border border-line shadow-sm overflow-hidden">
        {/* Sticky Header Section */}
        <div className="flex-shrink-0 p-4 sm:p-6 pb-0 bg-paper dark:bg-raised">
        <PageHeader
          className="mb-6"
          icon={RefreshCcw}
          title="Enrollment renewals"
          subtitle="Enrollments expiring soon or already expired"
          titleExtra={isReadOnly && <span className="shrink-0 text-[11px] font-normal text-amber-700">(Read-only)</span>}
          actions={
            <>
              <Button
                variant="primary"
                icon={Plus}
                onClick={handleNewEnrollment}
                disabled={isReadOnly}
                title={isReadOnly ? "Read-only access" : undefined}
              >
                <span className="hidden xs:inline">New enrollment</span>
                <span className="xs:hidden">Enrollment</span>
              </Button>
            </>
          }
        />

        {/* Search and filter row */}
        <div className="mb-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          {/* Search input */}
          <div className="relative flex-shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" aria-hidden="true" />
            <Input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or ID..."
              aria-label="Search renewals"
              className="pl-9 pr-8 sm:w-64"
            />
            {searchQuery && (
              <button
                aria-label="Clear search"
                onClick={() => {
                  setSearchQuery("");
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <X className="h-4 w-4 text-foreground/40" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer">
              <input
                type="checkbox"
                checked={showExpired}
                onChange={(e) => setShowExpired(e.target.checked)}
                className="rounded border-gray-300 text-accent-ink focus:ring-primary"
              />
              <span className="whitespace-nowrap">Show expired</span>
            </label>
            {renewals && (
              <span className="text-xs sm:text-sm text-foreground/50">
                {debouncedSearch
                  ? `${activeList.length} result${activeList.length !== 1 ? 's' : ''}`
                  : `${renewals.filter(r => !isStale(r)).length} needing attention`
                }
              </span>
            )}
          </div>
        </div>

        {/* Tab bar - only show when data is loaded */}
        {!isLoading && !renewalsLoading && user && canViewAdminPages && renewals && (renewals.length > 0 || waitingTaught.length > 0) && (
          <div ref={tabBarRef} className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-hide px-4 sm:px-6 -mx-4 sm:-mx-6">
            <button
              onClick={() => setActiveTab('not_renewed')}
              data-active={activeTab === 'not_renewed' || undefined}
              className={cn(
                "flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0",
                activeTab === 'not_renewed'
                  ? "border-foreground text-foreground"
                  : "border-transparent text-foreground/50 hover:text-foreground/70"
              )}
            >
              <RefreshCcw className="hidden sm:block h-4 w-4" />
              <span>Not renewed</span>
              {notRenewedListCount > 0 && (
                <span className="px-1.5 sm:px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700">
                  {notRenewedListCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('to_send')}
              data-active={activeTab === 'to_send' || undefined}
              className={cn(
                "flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0",
                activeTab === 'to_send'
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-foreground/50 hover:text-foreground/70"
              )}
            >
              <Send className="hidden sm:block h-4 w-4" />
              <span>To send</span>
              {toSendListCount > 0 && (
                <span className="px-1.5 sm:px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                  {toSendListCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('awaiting_payment')}
              data-active={activeTab === 'awaiting_payment' || undefined}
              className={cn(
                "flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0",
                activeTab === 'awaiting_payment'
                  ? "border-orange-500 text-orange-700 dark:text-orange-400"
                  : "border-transparent text-foreground/50 hover:text-foreground/70"
              )}
            >
              <CreditCard className="hidden sm:block h-4 w-4" />
              <span>Awaiting payment</span>
              {awaitingPaymentListCount > 0 && (
                <span className="px-1.5 sm:px-2 py-0.5 text-xs rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">
                  {awaitingPaymentListCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('taught')}
              data-active={activeTab === 'taught' || undefined}
              className={cn(
                "flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0",
                activeTab === 'taught'
                  ? "border-foreground text-foreground"
                  : "border-transparent text-foreground/50 hover:text-foreground/70"
              )}
            >
              <UserPlus className="hidden sm:block h-4 w-4" />
              <span>Taught but not in CSM yet</span>
              {taughtStudentCount > 0 && (
                <span className="px-1.5 sm:px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700">
                  {taughtStudentCount}
                </span>
              )}
            </button>
          </div>
        )}
        </div>

        {/* Scrollable Content Area */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-6 pb-4 sm:pb-6">
          {/* Loading skeleton */}
          {(isLoading || renewalsLoading) ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
                      <div className="h-3 w-48 bg-gray-100 dark:bg-gray-800 rounded" />
                      <div className="h-3 w-24 bg-gray-100 dark:bg-gray-800 rounded" />
                    </div>
                    <div className="h-8 w-8 bg-gray-100 dark:bg-gray-800 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : !user || !canViewAdminPages ? (
            <div className="text-center py-12">
              <p className="text-foreground/60">Admin access required</p>
            </div>
          ) : activeTab === 'taught' ? (
            <TaughtNotInCsmPanel
              lessons={waitingTaught}
              canAct={!isReadOnly}
              onCreateEnrolment={handleCreateFromTaught}
            />
          ) : renewals && renewals.length > 0 ? (
            <div className="space-y-4">
              {activeList.length > 0 ? (
                <>
                  {/* Expired Section - Red (within last 30 days) */}
                  {recentExpiredItems.length > 0 && (
                    <CollapsibleSection
                      id="expired"
                      label="Expired"
                      count={recentExpiredItems.length}
                      colorTheme="red"
                      isCollapsed={collapsedGroups.has('expired')}
                      onToggle={() => toggleGroup('expired')}
                      showCheckbox={showCheckboxes}
                      isAllChecked={sectionStates.expired.all}
                      isSomeChecked={sectionStates.expired.some}
                      onCheckboxClick={(e) => toggleSectionCheck(recentExpiredItems, e)}
                    >
                      {recentExpiredItems.map((renewal) => {
                        const navIndex = navIndexMap.get(renewal.id) ?? -1;
                        return (
                          <RenewalCard
                            key={renewal.id}
                            renewal={renewal}
                            index={navIndex}
                            isSelected={selectedIndex === navIndex}
                            onClick={handleCardClick}
                            onQuickRenew={handleQuickRenew}
                            onViewRenewal={handleViewRenewal}
                            expandedFeePanel={expandedFeePanel}
                            onToggleFeePanel={setExpandedFeePanel}
                            onRefresh={handleRefresh}
                            isChecked={checkedIds.has(renewal.id)}
                            onToggleCheck={toggleCheck}
                            showCheckbox={showCheckboxes}
                            selectedLocation={selectedLocation}
                            readOnly={isReadOnly}
                          />
                        );
                      })}
                    </CollapsibleSection>
                  )}

                  {/* This Week Section - Orange */}
                  {thisWeekItems.length > 0 && (
                    <CollapsibleSection
                      id="this_week"
                      label="This week"
                      count={thisWeekItems.length}
                      colorTheme="orange"
                      isCollapsed={collapsedGroups.has('this_week')}
                      onToggle={() => toggleGroup('this_week')}
                      showCheckbox={showCheckboxes}
                      isAllChecked={sectionStates.thisWeek.all}
                      isSomeChecked={sectionStates.thisWeek.some}
                      onCheckboxClick={(e) => toggleSectionCheck(thisWeekItems, e)}
                    >
                      {thisWeekItems.map((renewal) => {
                        const navIndex = navIndexMap.get(renewal.id) ?? -1;
                        return (
                          <RenewalCard
                            key={renewal.id}
                            renewal={renewal}
                            index={navIndex}
                            isSelected={selectedIndex === navIndex}
                            onClick={handleCardClick}
                            onQuickRenew={handleQuickRenew}
                            onViewRenewal={handleViewRenewal}
                            expandedFeePanel={expandedFeePanel}
                            onToggleFeePanel={setExpandedFeePanel}
                            onRefresh={handleRefresh}
                            isChecked={checkedIds.has(renewal.id)}
                            onToggleCheck={toggleCheck}
                            showCheckbox={showCheckboxes}
                            selectedLocation={selectedLocation}
                            readOnly={isReadOnly}
                          />
                        );
                      })}
                    </CollapsibleSection>
                  )}

                  {/* Next Week Section - Purple (collapsed by default) */}
                  {nextWeekItems.length > 0 && (
                    <CollapsibleSection
                      id="next_week"
                      label="Next week"
                      count={nextWeekItems.length}
                      colorTheme="purple"
                      isCollapsed={collapsedGroups.has('next_week')}
                      onToggle={() => toggleGroup('next_week')}
                      showCheckbox={showCheckboxes}
                      isAllChecked={sectionStates.nextWeek.all}
                      isSomeChecked={sectionStates.nextWeek.some}
                      onCheckboxClick={(e) => toggleSectionCheck(nextWeekItems, e)}
                    >
                      {nextWeekItems.map((renewal) => {
                        const navIndex = navIndexMap.get(renewal.id) ?? -1;
                        return (
                          <RenewalCard
                            key={renewal.id}
                            renewal={renewal}
                            index={navIndex}
                            isSelected={selectedIndex === navIndex}
                            onClick={handleCardClick}
                            onQuickRenew={handleQuickRenew}
                            onViewRenewal={handleViewRenewal}
                            expandedFeePanel={expandedFeePanel}
                            onToggleFeePanel={setExpandedFeePanel}
                            onRefresh={handleRefresh}
                            isChecked={checkedIds.has(renewal.id)}
                            onToggleCheck={toggleCheck}
                            showCheckbox={showCheckboxes}
                            selectedLocation={selectedLocation}
                            readOnly={isReadOnly}
                          />
                        );
                      })}
                    </CollapsibleSection>
                  )}

                  {/* Older Than 30 Days Section - Gray (collapsed by default, likely orphaned) */}
                  {olderExpiredItems.length > 0 && (
                    <CollapsibleSection
                      id="older_than_30_days"
                      label="Older than 30 days"
                      count={olderExpiredItems.length}
                      colorTheme="gray"
                      isCollapsed={collapsedGroups.has('older_than_30_days')}
                      onToggle={() => toggleGroup('older_than_30_days')}
                      showCheckbox={showCheckboxes}
                      isAllChecked={sectionStates.olderThan30Days.all}
                      isSomeChecked={sectionStates.olderThan30Days.some}
                      onCheckboxClick={(e) => toggleSectionCheck(olderExpiredItems, e)}
                    >
                      {olderExpiredItems.map((renewal) => {
                        const navIndex = navIndexMap.get(renewal.id) ?? -1;
                        return (
                          <RenewalCard
                            key={renewal.id}
                            renewal={renewal}
                            index={navIndex}
                            isSelected={selectedIndex === navIndex}
                            onClick={handleCardClick}
                            onQuickRenew={handleQuickRenew}
                            onViewRenewal={handleViewRenewal}
                            expandedFeePanel={expandedFeePanel}
                            onToggleFeePanel={setExpandedFeePanel}
                            onRefresh={handleRefresh}
                            isChecked={checkedIds.has(renewal.id)}
                            onToggleCheck={toggleCheck}
                            showCheckbox={showCheckboxes}
                            selectedLocation={selectedLocation}
                            readOnly={isReadOnly}
                          />
                        );
                      })}
                    </CollapsibleSection>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-foreground/50">
                  {debouncedSearch
                    ? `No student on this tab matches "${debouncedSearch}".`
                    : activeTab === 'not_renewed'
                    ? "All enrollments have been renewed"
                    : activeTab === 'to_send'
                    ? "No fee messages pending"
                    : "No payments pending"}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <RefreshCcw className="h-12 w-12 text-foreground/20 mx-auto mb-4" />
              <p className="text-foreground/60">No enrollments need renewal right now</p>
              <p className="text-sm text-foreground/40 mt-1">
                Enrollments will appear here when they expire or are within 2 weeks of expiring
              </p>
            </div>
          )}

          {/* Scroll to top button - inside scrollable area for proper parent detection */}
          <ScrollToTopButton />
        </div>
        </div>
      </PageTransition>

      {/* Batch Action Bar - Fixed at bottom when items selected */}
      <AnimatePresence>
        {checkedIds.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-4 sm:bottom-6 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-40"
          >
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-3 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700">
              <span className="text-sm font-medium text-foreground">
                {checkedIds.size} selected
              </span>
              {checkedIds.size > 50 && (
                <span className="text-xs text-amber-700 dark:text-amber-400 hidden sm:inline">
                  (large batch may be slow)
                </span>
              )}
              <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 hidden sm:block" />
              {activeTab === 'not_renewed' && (
                <Button
                  variant="primary"
                  icon={RefreshCcw}
                  onClick={openBatchRenew}
                  disabled={batchLoading || isReadOnly}
                  title={isReadOnly ? "Read-only access" : undefined}
                >
                  <span className="hidden xs:inline">Batch renew</span>
                  <span className="xs:hidden">Renew</span>
                </Button>
              )}
              {activeTab === 'to_send' && (
                <Button
                  variant="secondary"
                  icon={Send}
                  iconClassName="text-blue-600 dark:text-blue-400"
                  loading={batchLoading}
                  onClick={handleBatchMarkSent}
                  disabled={isReadOnly}
                  title={isReadOnly ? "Read-only access" : undefined}
                >
                  <span className="hidden xs:inline">Mark sent</span>
                  <span className="xs:hidden">Sent</span>
                </Button>
              )}
              {activeTab === 'awaiting_payment' && (
                <Button
                  variant="secondary"
                  icon={CreditCard}
                  iconClassName="text-green-600 dark:text-green-400"
                  loading={batchLoading}
                  onClick={() => setConfirmPaidOpen(true)}
                  disabled={isReadOnly}
                  title={isReadOnly ? "Read-only access" : undefined}
                >
                  Confirm payment
                </Button>
              )}
              <IconButton icon={X} label="Clear selection" onClick={clearChecked} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unified modal container - morphs between centered detail and side-by-side */}
      <AnimatePresence mode="wait">
        {detailModalOpen && (
          <motion.div
            key="modal-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 md:left-[var(--sidebar-width,72px)] z-50 flex items-center justify-center p-4 overflow-hidden transition-[left] duration-350"
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={handleCloseAll}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            {/* Modal Container - responsive: side-by-side on large, tabs on narrow */}
            <div className={cn(
              "relative flex flex-col",
              isLargeScreen
                ? "h-[85vh] max-w-[60rem]"
                : "h-[90vh] max-w-[32rem] w-full"
            )}>
              {/* Tabs for narrow screens when both modals open */}
              {!isLargeScreen && createModalOpen && (
                <div className="flex bg-paper rounded-t-lg border-b border-line">
                  <button
                    onClick={() => setModalTabView('detail')}
                    className={cn(
                      "flex-1 px-4 py-2.5 text-sm font-medium transition-colors rounded-tl-lg",
                      modalTabView === 'detail'
                        ? "text-primary border-b-2 border-primary bg-primary/5"
                        : "text-foreground/60 hover:text-foreground/80"
                    )}
                  >
                    Details
                  </button>
                  <button
                    onClick={() => setModalTabView('create')}
                    className={cn(
                      "flex-1 px-4 py-2.5 text-sm font-medium transition-colors rounded-tr-lg",
                      modalTabView === 'create'
                        ? "text-primary border-b-2 border-primary bg-primary/5"
                        : "text-foreground/60 hover:text-foreground/80"
                    )}
                  >
                    Create renewal
                  </button>
                </div>
              )}

              <LayoutGroup>
                <motion.div
                  layout
                  className={cn(
                    "relative flex",
                    isLargeScreen
                      ? "items-stretch gap-4 h-full"
                      : "flex-col flex-1 overflow-hidden",
                    isLargeScreen && !createModalOpen && "justify-center"
                  )}
                >
                  {/* Detail Modal - always on large, conditional on narrow when create is open */}
                  {(isLargeScreen || !createModalOpen || modalTabView === 'detail') && (
                    <motion.div
                      layoutId="enrollment-detail-modal"
                      transition={{
                        layout: { type: "spring", stiffness: 300, damping: 30 }
                      }}
                      className={!isLargeScreen ? "flex-1 overflow-y-auto" : undefined}
                    >
                      <EnrollmentDetailModal
                        isOpen={true}
                        onClose={handleDetailModalClose}
                        enrollmentId={selectedEnrollmentId}
                        onCreateRenewal={handleCreateRenewal}
                        compact={isLargeScreen && createModalOpen}
                        standalone={false}
                      />
                    </motion.div>
                  )}

                  {/* Create Form - slides in on large, tab-based on narrow */}
                  <AnimatePresence mode="popLayout">
                    {createModalOpen && (isLargeScreen || modalTabView === 'create') && (
                      <motion.div
                        key="create-form"
                        initial={isLargeScreen ? { opacity: 0, x: 50, scale: 0.95 } : { opacity: 0 }}
                        animate={isLargeScreen ? { opacity: 1, x: 0, scale: 1 } : { opacity: 1 }}
                        exit={isLargeScreen ? { opacity: 0, x: 50, scale: 0.95 } : { opacity: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 300,
                          damping: 30,
                          delay: isLargeScreen ? 0.05 : 0
                        }}
                        className={!isLargeScreen ? "flex-1 overflow-y-auto" : undefined}
                      >
                        <CreateEnrollmentModal
                          isOpen={true}
                          onClose={handleCreateModalClose}
                          renewFromId={renewFromId}
                          onSuccess={handleSuccess}
                          standalone={false}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </LayoutGroup>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Standalone create modal (when opened from "New Enrollment" button without detail) */}
      {createModalOpen && !detailModalOpen && (
        <CreateEnrollmentModal
          isOpen={true}
          onClose={handleCreateModalClose}
          renewFromId={renewFromId}
          onSuccess={handleSuccess}
          standalone={true}
          fromTaughtLesson={taughtLesson ?? undefined}
        />
      )}

      {/* Comparison mode: Original + Renewal side-by-side */}
      <AnimatePresence mode="wait">
        {comparisonMode && (
          <motion.div
            key="comparison-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 md:left-[var(--sidebar-width,72px)] z-50 flex items-center justify-center p-4 overflow-hidden transition-[left] duration-350"
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={handleCloseAll}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            {/* Modal container - responsive: side-by-side on large, stacked on narrow */}
            <div className={cn(
              "relative flex h-[85vh]",
              isLargeScreen
                ? "items-center max-w-[60rem]"
                : "flex-col max-w-[22rem] w-full"
            )}>
              {/* Close button - floating top right */}
              <button
                onClick={handleCloseAll}
                aria-label="Close"
                className={cn(
                  "absolute z-10 p-1.5 rounded-full bg-white dark:bg-gray-800 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
                  isLargeScreen ? "-top-2 -right-2" : "top-2 right-2"
                )}
              >
                <X className="h-5 w-5 text-foreground/60" />
              </button>

              {/* Side-by-side on large, stacked on narrow */}
              <LayoutGroup>
                <motion.div
                  layout
                  className={cn(
                    "flex",
                    isLargeScreen
                      ? "items-stretch"
                      : "flex-col gap-4 flex-1 overflow-y-auto py-2"
                  )}
                >
                  {/* Original Enrollment */}
                  <motion.div
                    layoutId="original-enrollment"
                    className={cn("w-[22rem] max-w-full", isLargeScreen && "opacity-75")}
                    transition={{
                      layout: { type: "spring", stiffness: 300, damping: 30 }
                    }}
                  >
                    <EnrollmentDetailModal
                      isOpen={true}
                      onClose={handleCloseAll}
                      enrollmentId={comparisonOriginalId}
                      compact={true}
                      standalone={false}
                      hideCloseButton={true}
                      headerLabel="Original"
                    />
                  </motion.div>

                  {/* Arrow between panels - only on large screens */}
                  {isLargeScreen && (
                    <div className="flex items-center px-3">
                      <ArrowRight className="h-6 w-6 text-foreground/30" />
                    </div>
                  )}

                  {/* Renewal Enrollment */}
                  <motion.div
                    layoutId="renewal-enrollment"
                    className="w-[22rem] max-w-full ring-2 ring-blue-400/50 dark:ring-blue-500/50 rounded-lg"
                    transition={{
                      layout: { type: "spring", stiffness: 300, damping: 30 }
                    }}
                  >
                    <EnrollmentDetailModal
                      isOpen={true}
                      onClose={handleCloseAll}
                      enrollmentId={comparisonRenewalId}
                      compact={true}
                      standalone={false}
                      hideCloseButton={true}
                      headerLabel="Renewal"
                      showRenewalActions={true}
                      onStatusChange={handleRefresh}
                    />
                  </motion.div>
                </motion.div>
              </LayoutGroup>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={confirmPaidOpen}
        onCancel={() => setConfirmPaidOpen(false)}
        onConfirm={() => {
          setConfirmPaidOpen(false);
          handleBatchMarkPaid();
        }}
        title="Confirm payment"
        message={`Mark ${checkedIds.size === 1 ? "this renewal" : `these ${checkedIds.size} renewals`} as paid? ${checkedIds.size === 1 ? "It leaves" : "They leave"} the renewals list straight away.`}
        confirmText="Confirm payment"
      />

      {/* Batch Renew Modal */}
      <BatchRenewModal
        isOpen={batchRenewModalOpen}
        onClose={() => setBatchRenewModalOpen(false)}
        enrollmentIds={batchRenewIds}
        onSuccess={() => {
          clearChecked();
          handleRefresh();
        }}
      />

      {/* Keyboard shortcut hint button (shows when panel is hidden). A phone or
          tablet has no keyboard to use them with, and there the button sat on
          top of the last card's Renew button and the selection bar. */}
      {!showShortcutHints && (
        <button
          onClick={() => setShowShortcutHints(true)}
          className={cn(
            "fixed right-4 z-40 w-8 h-8 rounded-full transition-all duration-200",
            "hidden [@media(hover:hover)]:flex",
            "bg-paper border border-line-strong",
            "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200",
            "shadow-md items-center justify-center",
            isScrolledPastThreshold ? "bottom-20" : "bottom-4"
          )}
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
        >
          <span className="text-sm font-mono">?</span>
        </button>
      )}

      {/* Keyboard Shortcut Hints Panel */}
      <AnimatePresence>
        {showShortcutHints && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-4 right-4 z-50 p-4 rounded-lg shadow-lg border
              bg-paper border-line-strong dark:border-line-strong
              text-sm w-64"
          >
            <div className="flex justify-between items-center mb-3">
              <span className="font-semibold text-[#5c4033] dark:text-[#d4a574]">
                Keyboard shortcuts
              </span>
              <IconButton icon={X} size="sm" label="Close shortcuts" onClick={() => setShowShortcutHints(false)} />
            </div>
            <div className="space-y-1.5 text-gray-600 dark:text-gray-300">
              <div className="flex justify-between gap-4">
                <kbd className="px-1.5 py-0.5 bg-field-fill rounded border text-xs font-mono">↑ ↓</kbd>
                <span>Navigate cards</span>
              </div>
              <div className="flex justify-between gap-4">
                <kbd className="px-1.5 py-0.5 bg-field-fill rounded border text-xs font-mono">Enter</kbd>
                <span>Open details</span>
              </div>
              <div className="flex justify-between gap-4">
                <kbd className="px-1.5 py-0.5 bg-field-fill rounded border text-xs font-mono">R</kbd>
                <span>Quick renew</span>
              </div>
              <div className="flex justify-between gap-4">
                <kbd className="px-1.5 py-0.5 bg-field-fill rounded border text-xs font-mono">F</kbd>
                <span>Toggle fee panel</span>
              </div>
              <div className="flex justify-between gap-4">
                <kbd className="px-1.5 py-0.5 bg-field-fill rounded border text-xs font-mono">M</kbd>
                <span>Copy fee message</span>
              </div>
              <div className="flex justify-between gap-4">
                <kbd className="px-1.5 py-0.5 bg-field-fill rounded border text-xs font-mono">Space</kbd>
                <span>Toggle checkbox</span>
              </div>
              <div className="flex justify-between gap-4">
                <kbd className="px-1.5 py-0.5 bg-field-fill rounded border text-xs font-mono">/</kbd>
                <span>Focus search</span>
              </div>
              <div className="flex justify-between gap-4">
                <kbd className="px-1.5 py-0.5 bg-field-fill rounded border text-xs font-mono">Esc</kbd>
                <span>Clear / Close</span>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
              Press <kbd className="px-1 py-0.5 bg-field-fill rounded border font-mono">?</kbd> to toggle
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageSurface>
  );
}
