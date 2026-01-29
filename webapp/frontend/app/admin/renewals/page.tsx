"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { RefreshCcw, Plus, AlertCircle, Clock, CheckCircle2, Copy, Mail, CreditCard, ChevronRight, ChevronDown, Eye, Send, ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import useSWR, { mutate } from "swr";
import { enrollmentsAPI, RenewalListItem } from "@/lib/api";
import { formatTimeAgo } from "@/lib/formatters";
import { CreateEnrollmentModal } from "@/components/enrollments/CreateEnrollmentModal";
import { EnrollmentDetailModal } from "@/components/enrollments/EnrollmentDetailModal";
import { FeeMessagePanel } from "@/components/enrollments/FeeMessagePanel";

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
}

function RenewalCard({ renewal, index, isSelected, onClick, onQuickRenew, onViewRenewal, expandedFeePanel, onToggleFeePanel, onRefresh }: RenewalCardProps) {
  const isExpired = renewal.days_until_expiry < 0;
  const isUrgent = renewal.days_until_expiry <= 3 && renewal.days_until_expiry >= 0;
  const isVeryOld = renewal.days_until_expiry < -30;
  const isFeePanelOpen = expandedFeePanel === renewal.id;

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
        "rounded-lg border transition-all overflow-hidden",
        "bg-white dark:bg-gray-900",
        isVeryOld
          ? "border-purple-200 dark:border-purple-800 hover:border-purple-300 dark:hover:border-purple-700"
          : isExpired
          ? "border-red-300 dark:border-red-800 hover:border-red-400 dark:hover:border-red-700"
          : isUrgent
          ? "border-orange-300 dark:border-orange-800 hover:border-orange-400 dark:hover:border-orange-700"
          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600",
        // Selection ring
        isSelected && "ring-2 ring-primary ring-offset-2",
        !isFeePanelOpen && "hover:shadow-md"
      )}
    >
      {/* Main card content - clickable */}
      <div
        onClick={() => onClick(renewal.id)}
        className="p-4 cursor-pointer group"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Student info */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-foreground/50">
                {renewal.school_student_id || `#${renewal.student_id}`}
              </span>
              <span className="font-semibold text-foreground">
                {renewal.student_name}
              </span>
              {renewal.grade && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-foreground/70">
                  {renewal.grade}
                </span>
              )}
              <StatusIcon status={renewal.renewal_status} />
            </div>

            {/* Schedule info */}
            <div className="text-sm text-foreground/70 mb-2">
              {renewal.assigned_day} {renewal.assigned_time} @ {renewal.location}
              <span className="text-foreground/50 ml-2">with {renewal.tutor_name}</span>
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
                  isUrgent
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
              <div className="mt-2 text-xs flex items-center gap-2">
                <span className="text-blue-600 dark:text-blue-400 font-medium">Renewal Generated:</span>
                <span className="text-foreground/70">
                  Starting {new Date(renewal.renewal_first_lesson_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                <span className="text-foreground/50">|</span>
                <span className="text-foreground/70">{renewal.renewal_lessons_paid} lessons</span>
                <span className="text-foreground/50">|</span>
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

          {/* Quick action buttons - visible on hover */}
          <div className="flex items-center gap-2">
            {/* Quick action buttons */}
            <div className={cn(
              "flex items-center gap-1.5 transition-opacity",
              "opacity-0 group-hover:opacity-100"
            )}>
              {showRenewalInfo ? (
                <button
                  onClick={handleViewRenewalClick}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-[1.02] active:scale-[0.98] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                  title="View renewal enrollment"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View Renewal
                </button>
              ) : (
                <button
                  onClick={handleRenewClick}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                    "hover:scale-[1.02] active:scale-[0.98]",
                    isExpired
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : isUrgent
                      ? "bg-orange-500 hover:bg-orange-600 text-white"
                      : "bg-primary hover:bg-primary/90 text-primary-foreground"
                  )}
                  title="Create renewal"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  Renew
                </button>
              )}
              <button
                onClick={handleCopyFeeClick}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                  "hover:scale-[1.02] active:scale-[0.98]",
                  isFeePanelOpen
                    ? "bg-gray-600 hover:bg-gray-700 text-white"
                    : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-foreground/80"
                )}
                title="Copy fee message"
              >
                <Copy className="h-3.5 w-3.5" />
                Fee
              </button>
            </div>

            {/* Status indicator - hidden on hover */}
            <div className={cn(
              "flex items-center justify-center h-8 w-8 rounded-full transition-all",
              "group-hover:opacity-0 group-hover:w-0 group-hover:h-0 overflow-hidden",
              isExpired
                ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                : isUrgent
                ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                : "bg-gray-100 dark:bg-gray-800 text-foreground/40"
            )}>
              <RefreshCcw className="h-4 w-4" />
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

  // Fetch renewals list
  const { data: renewals, isLoading: renewalsLoading } = useSWR(
    user && isAdmin ? ['renewals', selectedLocation, showExpired] : null,
    () => enrollmentsAPI.getRenewals({
      location: selectedLocation !== "All Locations" ? selectedLocation : undefined,
      include_expired: showExpired,
    }),
    { refreshInterval: 60000 }
  );

  // Group by renewal status (workflow stages)
  const notRenewedList = useMemo(() =>
    renewals?.filter(r => r.renewal_status === 'not_renewed')
      .sort((a, b) => a.days_until_expiry - b.days_until_expiry) || []
  , [renewals]);

  const toSendList = useMemo(() =>
    renewals?.filter(r => r.renewal_status === 'pending_message')
      .sort((a, b) => a.days_until_expiry - b.days_until_expiry) || []
  , [renewals]);

  const awaitingPaymentList = useMemo(() =>
    renewals?.filter(r => r.renewal_status === 'message_sent')
      .sort((a, b) => a.days_until_expiry - b.days_until_expiry) || []
  , [renewals]);

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
          if (selectedIndex !== null && navigableItems[selectedIndex]) {
            handleQuickRenew(navigableItems[selectedIndex].id);
          }
          break;
        case 'f':
          if (selectedIndex !== null && navigableItems[selectedIndex]) {
            const id = navigableItems[selectedIndex].id;
            setExpandedFeePanel(prev => prev === id ? null : id);
          }
          break;
        case 'Escape':
          setExpandedFeePanel(null);
          setSelectedIndex(null);
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

  // Scroll selected card into view
  useEffect(() => {
    if (selectedIndex !== null) {
      const element = document.querySelector(`[data-renewal-index="${selectedIndex}"]`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    // Keep detail modal open for reference
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

  return (
    <DeskSurface>
      <PageTransition className="min-h-full p-4 sm:p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <RefreshCcw className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  Enrollment Renewals
                </h1>
                <p className="text-sm text-foreground/60">
                  Enrollments expiring soon or already expired
                </p>
              </div>
            </div>

            {/* New Enrollment button */}
            <button
              onClick={handleNewEnrollment}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              New Enrollment
            </button>
          </div>
        </div>

        {/* Filter toggle */}
        <div className="mb-4 flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-foreground/70 cursor-pointer">
            <input
              type="checkbox"
              checked={showExpired}
              onChange={(e) => setShowExpired(e.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            Show expired enrollments
          </label>
          {renewals && (
            <span className="text-sm text-foreground/50">
              {renewals.length} enrollment{renewals.length !== 1 ? 's' : ''} needing attention
            </span>
          )}
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
            <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setActiveTab('not_renewed')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeTab === 'not_renewed'
                    ? "border-foreground text-foreground"
                    : "border-transparent text-foreground/50 hover:text-foreground/70"
                )}
              >
                <RefreshCcw className="h-4 w-4" />
                Not Renewed
                {notRenewedList.length > 0 && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700">
                    {notRenewedList.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('to_send')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeTab === 'to_send'
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-foreground/50 hover:text-foreground/70"
                )}
              >
                <Send className="h-4 w-4" />
                To Send
                {toSendList.length > 0 && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                    {toSendList.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('awaiting_payment')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeTab === 'awaiting_payment'
                    ? "border-orange-500 text-orange-600 dark:text-orange-400"
                    : "border-transparent text-foreground/50 hover:text-foreground/70"
                )}
              >
                <CreditCard className="h-4 w-4" />
                Awaiting Payment
                {awaitingPaymentList.length > 0 && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
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
                        className="flex items-center gap-2 w-full py-2 px-1 text-left hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors"
                      >
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
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Next Week Section - Gray (collapsed by default) */}
                  {nextWeekItems.length > 0 && (
                    <div>
                      <button
                        onClick={() => toggleGroup('next_week')}
                        className="flex items-center gap-2 w-full py-2 px-1 text-left hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      >
                        {collapsedGroups.has('next_week') ? (
                          <ChevronRight className="h-4 w-4 text-gray-500" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-500" />
                        )}
                        <span className="font-semibold text-gray-600 dark:text-gray-400">
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
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Older Than 30 Days Section - Purple (collapsed by default, likely orphaned) */}
                  {olderExpiredItems.length > 0 && (
                    <div>
                      <button
                        onClick={() => toggleGroup('older_than_30_days')}
                        className="flex items-center gap-2 w-full py-2 px-1 text-left hover:bg-purple-50 dark:hover:bg-purple-900/10 rounded-lg transition-colors"
                      >
                        {collapsedGroups.has('older_than_30_days') ? (
                          <ChevronRight className="h-4 w-4 text-purple-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-purple-400" />
                        )}
                        <span className="font-semibold text-purple-500 dark:text-purple-400">
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
      </PageTransition>

      {/* Unified modal container - morphs between centered detail and side-by-side */}
      <AnimatePresence mode="wait">
        {detailModalOpen && (
          <motion.div
            key="modal-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={handleCloseAll}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            {/* Modal Container - centers when 1 modal, natural flow when 2 */}
            <LayoutGroup>
              <motion.div
                layout
                className={cn(
                  "relative flex items-stretch gap-4",
                  "h-[85vh] max-w-[60rem]",
                  // Center when only detail, natural flow when both
                  !createModalOpen && "justify-center"
                )}
              >
                {/* Detail Modal - uses layoutId for seamless position animation (GPU-accelerated) */}
                <motion.div
                  layoutId="enrollment-detail-modal"
                  transition={{
                    layout: { type: "spring", stiffness: 300, damping: 30 }
                  }}
                >
                  <EnrollmentDetailModal
                    isOpen={true}
                    onClose={handleDetailModalClose}
                    enrollmentId={selectedEnrollmentId}
                    onCreateRenewal={handleCreateRenewal}
                    compact={createModalOpen}
                    standalone={false}
                  />
                </motion.div>

                {/* Create Form - slides in from right with spring physics */}
                <AnimatePresence mode="popLayout">
                  {createModalOpen && (
                    <motion.div
                      key="create-form"
                      initial={{ opacity: 0, x: 50, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 50, scale: 0.95 }}
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 30,
                        delay: 0.05
                      }}
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={handleCloseAll}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            {/* Modal container - no extra header */}
            <div className="relative flex items-center h-[85vh] max-w-[60rem]">
              {/* Close button - floating top right */}
              <button
                onClick={handleCloseAll}
                className="absolute -top-2 -right-2 z-10 p-1.5 rounded-full bg-white dark:bg-gray-800 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="h-5 w-5 text-foreground/60" />
              </button>

              {/* Side-by-side enrollment modals */}
              <LayoutGroup>
                <motion.div
                  layout
                  className="flex items-stretch"
                >
                  {/* Original Enrollment (left) - muted styling */}
                  <motion.div
                    layoutId="original-enrollment"
                    className="opacity-75"
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

                  {/* Arrow between panels */}
                  <div className="flex items-center px-3">
                    <ArrowRight className="h-6 w-6 text-foreground/30" />
                  </div>

                  {/* Renewal Enrollment (right) - highlighted styling */}
                  <motion.div
                    layoutId="renewal-enrollment"
                    className="ring-2 ring-blue-400/50 dark:ring-blue-500/50 rounded-lg"
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
    </DeskSurface>
  );
}
