"use client";

import { useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { RefreshCcw, Plus, AlertCircle, Clock, CheckCircle2, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import useSWR, { mutate } from "swr";
import { enrollmentsAPI, RenewalListItem } from "@/lib/api";
import { formatTimeAgo } from "@/lib/formatters";
import { CreateEnrollmentModal } from "@/components/enrollments/CreateEnrollmentModal";
import { EnrollmentDetailModal } from "@/components/enrollments/EnrollmentDetailModal";
import { FeeMessagePanel } from "@/components/enrollments/FeeMessagePanel";

interface RenewalCardProps {
  renewal: RenewalListItem;
  onClick: (enrollmentId: number) => void;
  onQuickRenew: (enrollmentId: number) => void;
  expandedFeePanel: number | null;
  onToggleFeePanel: (enrollmentId: number | null) => void;
}

function RenewalCard({ renewal, onClick, onQuickRenew, expandedFeePanel, onToggleFeePanel }: RenewalCardProps) {
  const isExpired = renewal.days_until_expiry < 0;
  const isUrgent = renewal.days_until_expiry <= 3 && renewal.days_until_expiry >= 0;
  const isFeePanelOpen = expandedFeePanel === renewal.id;

  const handleRenewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onQuickRenew(renewal.id);
  };

  const handleCopyFeeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFeePanel(isFeePanelOpen ? null : renewal.id);
  };

  return (
    <div
      className={cn(
        "rounded-lg border transition-all overflow-hidden",
        "bg-white dark:bg-gray-900",
        isExpired
          ? "border-red-300 dark:border-red-800 hover:border-red-400 dark:hover:border-red-700"
          : isUrgent
          ? "border-orange-300 dark:border-orange-800 hover:border-orange-400 dark:hover:border-orange-700"
          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600",
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
          </div>

          {/* Quick action buttons - visible on hover */}
          <div className="flex items-center gap-2">
            {/* Quick action buttons */}
            <div className={cn(
              "flex items-center gap-1.5 transition-opacity",
              "opacity-0 group-hover:opacity-100"
            )}>
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

  // Fee panel state
  const [expandedFeePanel, setExpandedFeePanel] = useState<number | null>(null);

  // Fetch renewals list
  const { data: renewals, isLoading: renewalsLoading } = useSWR(
    user && isAdmin ? ['renewals', selectedLocation, showExpired] : null,
    () => enrollmentsAPI.getRenewals({
      location: selectedLocation !== "All Locations" ? selectedLocation : undefined,
      include_expired: showExpired,
    }),
    { refreshInterval: 60000 }
  );

  // Separate expired and expiring soon
  const expiredRenewals = renewals?.filter(r => r.days_until_expiry < 0) || [];
  const expiringSoonRenewals = renewals?.filter(r => r.days_until_expiry >= 0) || [];

  // Handler: New enrollment (direct to create modal)
  const handleNewEnrollment = () => {
    setRenewFromId(null);
    setDetailModalOpen(false);
    setCreateModalOpen(true);
  };

  // Handler: Card click opens detail modal
  const handleCardClick = (enrollmentId: number) => {
    setSelectedEnrollmentId(enrollmentId);
    setDetailModalOpen(true);
  };

  // Handler: Quick renew from list (without opening detail modal)
  const handleQuickRenew = (enrollmentId: number) => {
    setRenewFromId(enrollmentId);
    setCreateModalOpen(true);
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
  };

  const handleSuccess = () => {
    // Refresh the renewals list and counts
    mutate(['renewals', selectedLocation, showExpired]);
    mutate(['renewal-counts', selectedLocation]);
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
          <div className="space-y-6">
            {/* Expired section */}
            {expiredRenewals.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Expired ({expiredRenewals.length})
                </h2>
                <div className="space-y-2">
                  {expiredRenewals.map((renewal) => (
                    <RenewalCard
                      key={renewal.id}
                      renewal={renewal}
                      onClick={handleCardClick}
                      onQuickRenew={handleQuickRenew}
                      expandedFeePanel={expandedFeePanel}
                      onToggleFeePanel={setExpandedFeePanel}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Expiring soon section */}
            {expiringSoonRenewals.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-foreground/70 mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Expiring Soon ({expiringSoonRenewals.length})
                </h2>
                <div className="space-y-2">
                  {expiringSoonRenewals.map((renewal) => (
                    <RenewalCard
                      key={renewal.id}
                      renewal={renewal}
                      onClick={handleCardClick}
                      onQuickRenew={handleQuickRenew}
                      expandedFeePanel={expandedFeePanel}
                      onToggleFeePanel={setExpandedFeePanel}
                    />
                  ))}
                </div>
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
    </DeskSurface>
  );
}
