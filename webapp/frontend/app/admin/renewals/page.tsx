"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { RefreshCcw, Plus, AlertCircle, Clock, CheckCircle2, Copy, Mail, CreditCard, ChevronRight, ChevronDown, Eye, Send, ArrowRight, X, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import useSWR, { mutate } from "swr";
import { enrollmentsAPI, RenewalListItem } from "@/lib/api";
import { formatTimeAgo } from "@/lib/formatters";
import { CreateEnrollmentModal } from "@/components/enrollments/CreateEnrollmentModal";
import { EnrollmentDetailModal } from "@/components/enrollments/EnrollmentDetailModal";
import { FeeMessagePanel } from "@/components/enrollments/FeeMessagePanel";
import { BatchRenewModal } from "@/components/enrollments/BatchRenewModal";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";

// Status icon component - matches tab icons
function StatusIcon({ status }: { status: RenewalListItem['renewal_status'] }) {
  switch (status) {
    case 'not_renewed':
      return <RefreshCcw className="h-3.5 w-3.5 text-gray-400" />;
    case 'pending_message':
      return <Send className="h-3.5 w-3.5 text-blue-500" />;
    case 'message_sent':
      return <CreditCard className="h-3.5 w-3.5 text-orange-500" />;
    default:
      return null;
  }
}

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
}

function RenewalCard({ renewal, index, isSelected, onClick, onQuickRenew, onViewRenewal, expandedFeePanel, onToggleFeePanel, onRefresh, isChecked, onToggleCheck, showCheckbox, selectedLocation }: RenewalCardProps) {
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
        "rounded-lg border transition-all overflow-hidden scroll-my-24",
        "bg-white dark:bg-gray-900",
        isVeryOld
          ? "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
          : isExpired
          ? "border-red-300 dark:border-red-800 hover:border-red-400 dark:hover:border-red-700"
          : isThisWeek
          ? "border-orange-300 dark:border-orange-800 hover:border-orange-400 dark:hover:border-orange-700"
          : isNextWeek
          ? "border-purple-200 dark:border-purple-800 hover:border-purple-300 dark:hover:border-purple-700"
          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600",
        // Selection ring
        isSelected && "ring-2 ring-primary ring-offset-2",
        !isFeePanelOpen && "hover:shadow-md"
      )}
    >
      {/* Main card content - clickable */}
      <div
        onClick={() => onClick(renewal.id)}
        className="p-3 sm:p-4 cursor-pointer group"
      >
        <div className="flex items-start justify-between gap-2 sm:gap-4">
          {/* Checkbox for batch selection - visible on hover or when in batch mode */}
          <div
            onClick={handleCheckboxClick}
            className={cn(
              "flex items-center justify-center pt-0.5 transition-opacity",
              showCheckbox ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
          >
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => {}}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
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
                trailing={<StatusIcon status={renewal.renewal_status} />}
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
                  <span>Expired {formatTimeAgo(renewal.effective_end_date)}</span>
                </div>
              ) : (
                <div className={cn(
                  "flex items-center gap-1",
                  isThisWeek
                    ? "text-orange-600 dark:text-orange-400"
                    : "text-foreground/60"
                )}>
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    Expires {new Date(renewal.effective_end_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {renewal.days_until_expiry === 0
                      ? " (today!)"
                      : renewal.days_until_expiry === 1
                      ? " (tomorrow!)"
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
                  {new Date(renewal.renewal_first_lesson_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                <span className="text-foreground/50 hidden sm:inline">|</span>
                <span className="text-foreground/70">{renewal.renewal_lessons_paid} lessons</span>
                <span className="text-foreground/50 hidden sm:inline">|</span>
                <span className={cn(
                  "font-medium",
                  renewal.renewal_payment_status === 'Paid'
                    ? "text-green-600 dark:text-green-400"
                    : "text-orange-600 dark:text-orange-400"
                )}>
                  {renewal.renewal_payment_status}
                </span>
              </div>
            )}
          </div>

          {/* Quick action buttons - always visible on mobile, hover on desktop */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Quick action buttons */}
            <div className={cn(
              "flex items-center gap-1 sm:gap-1.5 transition-opacity",
              "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            )}>
              {showRenewalInfo ? (
                <button
                  onClick={handleViewRenewalClick}
                  className="flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-[1.02] active:scale-[0.98] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                  title="View renewal enrollment"
                >
                  <Eye className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">View</span>
                </button>
              ) : (
                <button
                  onClick={handleRenewClick}
                  className={cn(
                    "flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium transition-all",
                    "hover:scale-[1.02] active:scale-[0.98]",
                    isVeryOld
                      ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                      : isExpired
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : isThisWeek
                      ? "bg-orange-500 hover:bg-orange-600 text-white"
                      : isNextWeek
                      ? "bg-purple-500 hover:bg-purple-600 text-white"
                      : "bg-primary hover:bg-primary/90 text-primary-foreground"
                  )}
                  title="Create renewal"
                >
                  <RefreshCcw className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">Renew</span>
                </button>
              )}
              <button
                onClick={handleCopyFeeClick}
                className={cn(
                  "flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium transition-all",
                  "hover:scale-[1.02] active:scale-[0.98]",
                  isFeePanelOpen
                    ? "bg-gray-600 hover:bg-gray-700 text-white"
                    : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-foreground/80"
                )}
                title="Copy fee message"
              >
                <Copy className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Fee</span>
              </button>
            </div>

            {/* Status indicator - hidden on mobile (buttons visible), hidden on hover on desktop */}
            <div className={cn(
              "hidden sm:flex items-center justify-center h-8 w-8 rounded-full transition-all",
              "sm:group-hover:opacity-0 sm:group-hover:w-0 sm:group-hover:h-0 overflow-hidden",
              showRenewalInfo
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                : isVeryOld
                ? "bg-gray-100 dark:bg-gray-800 text-foreground/40"
                : isExpired
                ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                : isThisWeek
                ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                : isNextWeek
                ? "bg-purple-100 dark:bg-purple-900/30 text-purple-500 dark:text-purple-400"
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
}

export default function AdminRenewalsPage() {
  const { user, isLoading, isAdmin } = useAuth();
  const { selectedLocation } = useLocation();
  const [showExpired, setShowExpired] = useState(true);

  // Modal state
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [renewFromId, setRenewFromId] = useState<number | null>(null);

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

  // Tab state
  const [activeTab, setActiveTab] = useState<'not_renewed' | 'to_send' | 'awaiting_payment'>('not_renewed');

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

  // Batch selection state
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchRenewModalOpen, setBatchRenewModalOpen] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch renewals list
  const { data: renewals, isLoading: renewalsLoading } = useSWR(
    user && isAdmin ? ['renewals', selectedLocation, showExpired] : null,
    () => enrollmentsAPI.getRenewals({
      location: selectedLocation !== "All Locations" ? selectedLocation : undefined,
      include_expired: showExpired,
    }),
    { refreshInterval: 60000 }
  );

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

  // Active tab's list
  const activeList = useMemo(() => {
    switch (activeTab) {
      case 'not_renewed': return notRenewedList;
      case 'to_send': return toSendList;
      case 'awaiting_payment': return awaitingPaymentList;
    }
  }, [activeTab, notRenewedList, toSendList, awaitingPaymentList]);

  // Split into urgency groups
  const recentExpiredItems = useMemo(() =>
    activeList.filter(r => r.days_until_expiry < 0 && r.days_until_expiry >= -30)
  , [activeList]);

  const thisWeekItems = useMemo(() =>
    activeList.filter(r => r.days_until_expiry >= 0 && r.days_until_expiry <= 7)
  , [activeList]);

  const nextWeekItems = useMemo(() =>
    activeList.filter(r => r.days_until_expiry > 7)
  , [activeList]);

  const olderExpiredItems = useMemo(() =>
    activeList.filter(r => r.days_until_expiry < -30)
  , [activeList]);

  // Navigable items (excluding collapsed sections) for keyboard navigation
  const navigableItems = useMemo(() => {
    const items: typeof activeList = [];
    if (!collapsedGroups.has('expired')) items.push(...recentExpiredItems);
    if (!collapsedGroups.has('this_week')) items.push(...thisWeekItems);
    if (!collapsedGroups.has('next_week')) items.push(...nextWeekItems);
    if (!collapsedGroups.has('older_than_30_days')) items.push(...olderExpiredItems);
    return items;
  }, [activeList, recentExpiredItems, thisWeekItems, nextWeekItems, olderExpiredItems, collapsedGroups]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
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
          if (selectedIndex !== null && navigableItems[selectedIndex]) {
            const id = navigableItems[selectedIndex].id;
            setExpandedFeePanel(prev => prev === id ? null : id);
          }
          break;
        case ' ':  // Spacebar to toggle checkbox
          e.preventDefault();
          if (selectedIndex !== null && navigableItems[selectedIndex]) {
            toggleCheck(navigableItems[selectedIndex].id);
          }
          break;
        case 'Escape':
          setExpandedFeePanel(null);
          setSelectedIndex(null);
          clearChecked();
          setSearchQuery("");
          break;
        case '/':
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, navigableItems, detailModalOpen, createModalOpen, comparisonMode]);

  // Reset selection when switching tabs or toggling collapse
  useEffect(() => {
    setSelectedIndex(null);
    setExpandedFeePanel(null);
  }, [activeTab, collapsedGroups]);

  // Scroll to keep selected card visible (manual calculation like sessions page)
  useEffect(() => {
    if (selectedIndex === null) return;

    const element = document.querySelector(`[data-renewal-index="${selectedIndex}"]`);
    const scrollContainer = document.querySelector('main');
    if (!element || !scrollContainer) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const cardRect = element.getBoundingClientRect();

    // Card position relative to container's scroll position
    const cardTopInContainer = cardRect.top - containerRect.top + scrollContainer.scrollTop;

    // Target: position card 1/3 from top (accounts for header better than centering)
    const targetScroll = cardTopInContainer - (containerRect.height / 3);

    // Only scroll if needed (card is near edges)
    const currentCardTop = cardRect.top - containerRect.top;
    const headerHeight = 280;
    const bottomPadding = 120;

    const isNearTop = currentCardTop < headerHeight;
    const isNearBottom = cardRect.bottom > containerRect.bottom - bottomPadding;

    if (isNearTop || isNearBottom) {
      scrollContainer.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
    }
  }, [selectedIndex]);

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
  };

  const handleCloseAll = () => {
    setDetailModalOpen(false);
    setSelectedEnrollmentId(null);
    setCreateModalOpen(false);
    setRenewFromId(null);
    // Also close comparison mode
    setComparisonMode(false);
    setComparisonOriginalId(null);
    setComparisonRenewalId(null);
  };

  const handleRefresh = () => {
    // Refresh the renewals list and counts without closing modals
    mutate(['renewals', selectedLocation, showExpired]);
    mutate(['renewal-counts', selectedLocation]);
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
      const renewalIds = Array.from(checkedIds)
        .map(id => activeList.find(r => r.id === id)?.renewal_enrollment_id)
        .filter((id): id is number => id !== null && id !== undefined);

      if (renewalIds.length > 0) {
        await enrollmentsAPI.batchMarkPaid(renewalIds);
        handleRefresh();
        clearChecked();
      }
    } catch (error) {
      console.error('Batch mark paid failed:', error);
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchMarkSent = async () => {
    if (checkedIds.size === 0) return;
    setBatchLoading(true);
    try {
      // For "to_send" tab, we need to mark the RENEWAL enrollments' fee_message_sent
      const renewalIds = Array.from(checkedIds)
        .map(id => activeList.find(r => r.id === id)?.renewal_enrollment_id)
        .filter((id): id is number => id !== null && id !== undefined);

      if (renewalIds.length > 0) {
        await enrollmentsAPI.batchMarkSent(renewalIds);
        handleRefresh();
        clearChecked();
      }
    } catch (error) {
      console.error('Batch mark sent failed:', error);
    } finally {
      setBatchLoading(false);
    }
  };

  // Determine if we should show checkboxes (when any item is checked)
  const showCheckboxes = checkedIds.size > 0;

  return (
    <DeskSurface>
      <PageTransition className="min-h-full p-4 sm:p-6">
        <div className="bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm p-4 sm:p-6">
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <RefreshCcw className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                  Enrollment Renewals
                </h1>
                <p className="text-xs sm:text-sm text-foreground/60">
                  Enrollments expiring soon or already expired
                </p>
              </div>
            </div>

            {/* New Enrollment button */}
            <button
              onClick={handleNewEnrollment}
              className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden xs:inline">New</span> Enrollment
            </button>
          </div>
        </div>

        {/* Search and filter row */}
        <div className="mb-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
          {/* Search input */}
          <div className="relative flex-shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or ID..."
              className="pl-9 pr-8 py-1.5 w-full sm:w-64 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
            {searchQuery && (
              <button
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
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="whitespace-nowrap">Show expired</span>
            </label>
            {renewals && (
              <span className="text-xs sm:text-sm text-foreground/50">
                {debouncedSearch
                  ? `${activeList.length} result${activeList.length !== 1 ? 's' : ''}`
                  : `${renewals.length} needing attention`
                }
              </span>
            )}
          </div>
        </div>

        {isLoading || renewalsLoading ? (
          /* Skeleton cards while loading */
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-4 rounded-lg border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-16 rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                      <div className="h-4 w-32 rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                    </div>
                    <div className="h-4 w-48 rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                    <div className="h-3 w-40 rounded animate-pulse bg-gray-100 dark:bg-gray-800" />
                  </div>
                  <div className="h-9 w-24 rounded-lg animate-pulse bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
            ))}
          </div>
        ) : !user ? (
          <div className="text-center py-12 text-foreground/60">
            Please sign in to view renewals
          </div>
        ) : !isAdmin ? (
          <div className="text-center py-12 text-foreground/60">
            Admin access required to manage renewals
          </div>
        ) : renewals && renewals.length > 0 ? (
          <div>
            {/* Tab bar */}
            <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
              <button
                onClick={() => setActiveTab('not_renewed')}
                className={cn(
                  "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0",
                  activeTab === 'not_renewed'
                    ? "border-foreground text-foreground"
                    : "border-transparent text-foreground/50 hover:text-foreground/70"
                )}
              >
                <RefreshCcw className="h-4 w-4" />
                <span className="hidden sm:inline">Not Renewed</span>
                <span className="sm:hidden">Pending</span>
                {notRenewedList.length > 0 && (
                  <span className="px-1.5 sm:px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700">
                    {notRenewedList.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('to_send')}
                className={cn(
                  "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0",
                  activeTab === 'to_send'
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-foreground/50 hover:text-foreground/70"
                )}
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">To Send</span>
                <span className="sm:hidden">Send</span>
                {toSendList.length > 0 && (
                  <span className="px-1.5 sm:px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                    {toSendList.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('awaiting_payment')}
                className={cn(
                  "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex-shrink-0",
                  activeTab === 'awaiting_payment'
                    ? "border-orange-500 text-orange-600 dark:text-orange-400"
                    : "border-transparent text-foreground/50 hover:text-foreground/70"
                )}
              >
                <CreditCard className="h-4 w-4" />
                <span className="hidden sm:inline">Awaiting Payment</span>
                <span className="sm:hidden">Payment</span>
                {awaitingPaymentList.length > 0 && (
                  <span className="px-1.5 sm:px-2 py-0.5 text-xs rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                    {awaitingPaymentList.length}
                  </span>
                )}
              </button>
            </div>

            {/* Tab content with collapsible urgency sections */}
            <div className="space-y-4">
              {activeList.length > 0 ? (
                <>
                  {/* Expired Section - Red (within last 30 days) */}
                  {recentExpiredItems.length > 0 && (
                    <div>
                      <button
                        onClick={() => toggleGroup('expired')}
                        className="flex items-center gap-2 w-full py-2 px-1 text-left hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isAllSectionChecked(recentExpiredItems)}
                          ref={el => { if (el) el.indeterminate = isSomeSectionChecked(recentExpiredItems) && !isAllSectionChecked(recentExpiredItems); }}
                          onChange={() => {}}
                          onClick={(e) => toggleSectionCheck(recentExpiredItems, e)}
                          className="h-4 w-4 rounded border-gray-300 text-red-500 focus:ring-red-500 cursor-pointer"
                        />
                        {collapsedGroups.has('expired') ? (
                          <ChevronRight className="h-4 w-4 text-red-500" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-red-500" />
                        )}
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          Expired ({recentExpiredItems.length})
                        </span>
                      </button>
                      {!collapsedGroups.has('expired') && (
                        <div className="space-y-2 mt-2">
                          {recentExpiredItems.map((renewal) => {
                            const navIndex = navigableItems.findIndex(r => r.id === renewal.id);
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
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* This Week Section - Orange */}
                  {thisWeekItems.length > 0 && (
                    <div>
                      <button
                        onClick={() => toggleGroup('this_week')}
                        className="flex items-center gap-2 w-full py-2 px-1 text-left hover:bg-orange-50 dark:hover:bg-orange-900/10 rounded-lg transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isAllSectionChecked(thisWeekItems)}
                          ref={el => { if (el) el.indeterminate = isSomeSectionChecked(thisWeekItems) && !isAllSectionChecked(thisWeekItems); }}
                          onChange={() => {}}
                          onClick={(e) => toggleSectionCheck(thisWeekItems, e)}
                          className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
                        />
                        {collapsedGroups.has('this_week') ? (
                          <ChevronRight className="h-4 w-4 text-orange-500" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-orange-500" />
                        )}
                        <span className="font-semibold text-orange-600 dark:text-orange-400">
                          This Week ({thisWeekItems.length})
                        </span>
                      </button>
                      {!collapsedGroups.has('this_week') && (
                        <div className="space-y-2 mt-2">
                          {thisWeekItems.map((renewal) => {
                            const navIndex = navigableItems.findIndex(r => r.id === renewal.id);
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
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Next Week Section - Purple (collapsed by default) */}
                  {nextWeekItems.length > 0 && (
                    <div>
                      <button
                        onClick={() => toggleGroup('next_week')}
                        className="flex items-center gap-2 w-full py-2 px-1 text-left hover:bg-purple-50 dark:hover:bg-purple-900/10 rounded-lg transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isAllSectionChecked(nextWeekItems)}
                          ref={el => { if (el) el.indeterminate = isSomeSectionChecked(nextWeekItems) && !isAllSectionChecked(nextWeekItems); }}
                          onChange={() => {}}
                          onClick={(e) => toggleSectionCheck(nextWeekItems, e)}
                          className="h-4 w-4 rounded border-gray-300 text-purple-500 focus:ring-purple-500 cursor-pointer"
                        />
                        {collapsedGroups.has('next_week') ? (
                          <ChevronRight className="h-4 w-4 text-purple-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-purple-400" />
                        )}
                        <span className="font-semibold text-purple-500 dark:text-purple-400">
                          Next Week ({nextWeekItems.length})
                        </span>
                      </button>
                      {!collapsedGroups.has('next_week') && (
                        <div className="space-y-2 mt-2">
                          {nextWeekItems.map((renewal) => {
                            const navIndex = navigableItems.findIndex(r => r.id === renewal.id);
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
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Older Than 30 Days Section - Gray (collapsed by default, likely orphaned) */}
                  {olderExpiredItems.length > 0 && (
                    <div>
                      <button
                        onClick={() => toggleGroup('older_than_30_days')}
                        className="flex items-center gap-2 w-full py-2 px-1 text-left hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isAllSectionChecked(olderExpiredItems)}
                          ref={el => { if (el) el.indeterminate = isSomeSectionChecked(olderExpiredItems) && !isAllSectionChecked(olderExpiredItems); }}
                          onChange={() => {}}
                          onClick={(e) => toggleSectionCheck(olderExpiredItems, e)}
                          className="h-4 w-4 rounded border-gray-300 text-gray-500 focus:ring-gray-500 cursor-pointer"
                        />
                        {collapsedGroups.has('older_than_30_days') ? (
                          <ChevronRight className="h-4 w-4 text-gray-500" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-500" />
                        )}
                        <span className="font-semibold text-gray-600 dark:text-gray-400">
                          Older Than 30 Days ({olderExpiredItems.length})
                        </span>
                      </button>
                      {!collapsedGroups.has('older_than_30_days') && (
                        <div className="space-y-2 mt-2">
                          {olderExpiredItems.map((renewal) => {
                            const navIndex = navigableItems.findIndex(r => r.id === renewal.id);
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
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-foreground/50">
                  {activeTab === 'not_renewed' && "All enrollments have been renewed"}
                  {activeTab === 'to_send' && "No fee messages pending"}
                  {activeTab === 'awaiting_payment' && "No payments pending"}
                </div>
              )}
            </div>
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
              <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 hidden sm:block" />
              {activeTab === 'not_renewed' && (
                <button
                  onClick={() => setBatchRenewModalOpen(true)}
                  disabled={batchLoading}
                  className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <RefreshCcw className="h-4 w-4" />
                  <span className="hidden xs:inline">Batch</span> Renew
                </button>
              )}
              {activeTab === 'to_send' && (
                <button
                  onClick={handleBatchMarkSent}
                  disabled={batchLoading}
                  className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {batchLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span className="hidden xs:inline">Mark</span> Sent
                </button>
              )}
              {activeTab === 'awaiting_payment' && (
                <button
                  onClick={handleBatchMarkPaid}
                  disabled={batchLoading}
                  className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {batchLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  <span className="hidden xs:inline">Mark</span> Paid
                </button>
              )}
              <button
                onClick={clearChecked}
                className="flex items-center gap-1 px-2 py-1.5 text-foreground/60 hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden"
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
                <div className="flex bg-[#fef9f3] dark:bg-[#2d2618] rounded-t-lg border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
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
                    Create Renewal
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden"
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

      {/* Batch Renew Modal */}
      <BatchRenewModal
        isOpen={batchRenewModalOpen}
        onClose={() => setBatchRenewModalOpen(false)}
        enrollmentIds={Array.from(checkedIds)}
        onSuccess={() => {
          clearChecked();
          handleRefresh();
        }}
      />
    </DeskSurface>
  );
}
