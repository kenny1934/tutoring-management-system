"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { formatDateCompact } from "@/lib/formatters";
import { arkLeaveAPI, authAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/contexts/RoleContext";
import { useToast } from "@/contexts/ToastContext";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ARK_BASE_URL } from "@/config/leave-records";
import { mutate } from "swr";
import useSWR from "swr";
import type { ArkLeaveBalance, ArkLeaveRequest } from "@/types";
import {
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Loader2,
  ExternalLink,
  Calendar,
  Clock,
  AlertCircle,
} from "lucide-react";
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


/** ARK vessel icon */
function ArkIcon({ className }: { className?: string }) {
  return (
    <div className={cn("bg-indigo-600 rounded flex items-center justify-center", className)}>
      <svg viewBox="0 0 64 64" fill="none" className="w-[75%] h-[75%]">
        <path d="M18 23 L21 14 L27 9 L32 7 L37 9 L43 14 L46 23 L41 23 L39 16 L35 12 L32 11 L29 12 L25 16 L23 23 Z" fill="#ffffff" />
        <path d="M32 57 L7 43 L13 27 L32 22 Z" fill="#ffffff" />
        <path d="M32 57 L57 43 L51 29 L32 24 Z" fill="#c7d2fe" />
        <line x1="4" y1="43" x2="7" y2="43" stroke="#e0e7ff" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="57" y1="43" x2="60" y2="43" stroke="#e0e7ff" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}


// ─── Balance row ───

function BalanceRow({ balance }: { balance: ArkLeaveBalance }) {
  const total = Number(balance.entitlement_days) + Number(balance.carry_over_days) + Number(balance.adjusted_days);
  const used = Number(balance.used_days);
  const remaining = total - used;
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
          {balance.leave_type.name_en}
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              pct > 80 ? "bg-red-400" : pct > 50 ? "bg-amber-400" : "bg-emerald-400"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {remaining}
        </span>
        <span className="text-xs text-gray-400">/{total}</span>
      </div>
    </div>
  );
}


// ─── Leave request card ───

function RequestCard({
  request,
  showStaffName,
  isAdmin,
  onReview,
  isReviewing,
}: {
  request: ArkLeaveRequest;
  showStaffName: boolean;
  isAdmin: boolean;
  onReview: (id: number, status: string) => void;
  isReviewing: number | null;
}) {
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  const canReview = isAdmin && request.status === "pending";
  const dateStr = request.start_date === request.end_date
    ? formatDateCompact(request.start_date)
    : `${formatDateCompact(request.start_date)} – ${formatDateCompact(request.end_date)}`;

  return (
    <>
      <div className={cn(
        "rounded-lg border p-2.5",
        request.status === "approved"
          ? "border-green-200 dark:border-green-800/40 bg-green-50/50 dark:bg-green-900/10"
          : request.status === "rejected"
          ? "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20 opacity-60"
          : "border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a]"
      )}>
        {/* Header: leave type + days */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
            {request.leave_type.name_en}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {request.days_requested}{request.is_half_day ? ` (${request.half_day_period ?? "half"})` : "d"}
            </span>
            {request.status !== "pending" && (
              <span className={cn(
                "px-1.5 py-0.5 text-[10px] font-medium rounded",
                request.status === "approved"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              )}>
                {request.status}
              </span>
            )}
          </div>
        </div>

        {/* Date + staff name */}
        <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500 dark:text-gray-400">
          <Calendar className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">
            {dateStr}
            {showStaffName && request.staff_name && ` · ${request.staff_name}`}
          </span>
        </div>

        {/* Reason */}
        {request.reason && (
          <div className="mt-1 text-xs text-gray-400 dark:text-gray-500 truncate italic">
            &ldquo;{request.reason}&rdquo;
          </div>
        )}

        {/* Actions */}
        {canReview && (
          <div className="flex items-center justify-end gap-1 mt-2">
            <button
              onClick={() => setShowApproveConfirm(true)}
              disabled={isReviewing === request.id}
              className="px-2 py-1 text-xs text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors"
            >
              {isReviewing === request.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 inline mr-0.5" />}
              Approve
            </button>
            <button
              onClick={() => setShowRejectConfirm(true)}
              disabled={isReviewing === request.id}
              className="px-2 py-1 text-xs text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
            >
              <X className="h-3.5 w-3.5 inline mr-0.5" />
              Reject
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showApproveConfirm}
        onConfirm={() => { onReview(request.id, "approved"); setShowApproveConfirm(false); }}
        onCancel={() => setShowApproveConfirm(false)}
        title="Approve Leave"
        message={`Approve ${request.staff_name || "this"}'s ${request.leave_type.name_en} request (${request.days_requested} day${request.days_requested !== 1 ? "s" : ""})?`}
        confirmText="Approve"
        variant="default"
      />
      <ConfirmDialog
        isOpen={showRejectConfirm}
        onConfirm={() => { onReview(request.id, "rejected"); setShowRejectConfirm(false); }}
        onCancel={() => setShowRejectConfirm(false)}
        title="Reject Leave"
        message="Are you sure you want to reject this leave request?"
        confirmText="Reject"
        variant="danger"
      />
    </>
  );
}


// ─── Main component ───

export function LeaveQuickLink({ className }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const { isAdmin } = useAuth();
  const { viewMode } = useRole();
  const { showToast } = useToast();

  const isAdminView = isAdmin && viewMode !== "my-view";

  // Default tab: admin sees pending review, staff sees balances
  const [activeTab, setActiveTab] = useState<"balances" | "requests" | "pending">(
    isAdminView ? "pending" : "balances"
  );

  // Reset tab when view mode changes
  useEffect(() => {
    setActiveTab(isAdminView ? "pending" : "balances");
  }, [isAdminView]);

  // SWR hooks — data fetched on open, badge counts polled in background
  const { data: balances, isLoading: loadingBalances, error: balancesError } = useSWR(
    isOpen ? "ark-leave-balances" : null,
    () => arkLeaveAPI.getBalances(),
    { revalidateOnFocus: false }
  );

  const { data: myRequests, isLoading: loadingRequests } = useSWR(
    isOpen ? "ark-leave-my-requests" : null,
    () => arkLeaveAPI.getMyRequests(),
    { revalidateOnFocus: false }
  );

  const { data: pendingRequests, isLoading: loadingPending } = useSWR(
    isOpen && isAdminView ? "ark-leave-pending" : null,
    () => arkLeaveAPI.getPending(),
    { revalidateOnFocus: false }
  );

  // Badge counts — polled in background regardless of isOpen
  const { data: pendingCount } = useSWR(
    isAdminView ? "ark-leave-pending-count" : null,
    () => arkLeaveAPI.getPendingCount(),
    { refreshInterval: 60000, revalidateOnFocus: false }
  );

  const { data: myRequestsForBadge } = useSWR(
    !isAdminView ? "ark-leave-my-pending-count" : null,
    () => arkLeaveAPI.getMyRequests("pending"),
    { refreshInterval: 60000, revalidateOnFocus: false }
  );

  const badgeCount = isAdminView
    ? (pendingCount?.count ?? 0)
    : (myRequestsForBadge?.length ?? 0);

  // Review handler
  const handleReview = useCallback(async (requestId: number, status: string) => {
    setReviewingId(requestId);
    try {
      await arkLeaveAPI.reviewRequest(requestId, { status });
      showToast(status === "approved" ? "Leave approved" : "Leave rejected", status === "approved" ? "success" : "info");
      mutate("ark-leave-pending");
      mutate("ark-leave-pending-count");
    } catch {
      showToast("Failed to review leave request", "error");
    } finally {
      setReviewingId(null);
    }
  }, [showToast]);

  // ARK SSO handoff
  const handleOpenArk = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsOpen(false);
    const arkPath = isAdminView ? "/leave" : "/my/leave";
    try {
      const { token } = await authAPI.getHandoffToken();
      window.open(
        `${ARK_BASE_URL}/api/auth/cross-app-login?token=${token}&redirect=${encodeURIComponent(arkPath)}`,
        "_blank"
      );
    } catch {
      window.open(`${ARK_BASE_URL}${arkPath}`, "_blank");
    }
  }, [isAdminView]);

  // Floating UI
  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [
      offset(8),
      flip({ fallbackAxisSideDirection: "end" }),
      shift({ padding: 8 }),
    ],
    placement: "bottom-start",
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss]);

  // Sorted balances: only show types with entitlement > 0
  const visibleBalances = useMemo(
    () => (balances ?? []).filter(b => Number(b.entitlement_days) + Number(b.carry_over_days) + Number(b.adjusted_days) > 0),
    [balances]
  );

  // Sort requests: pending first, then by created_at desc
  const sortedMyRequests = useMemo(
    () => [...(myRequests ?? [])].sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (b.status === "pending" && a.status !== "pending") return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }),
    [myRequests]
  );

  const isArkError = !!balancesError;

  const myPendingCount = myRequestsForBadge?.length ?? 0;

  // Tabs config
  const tabs = useMemo(() => {
    const t: { id: "balances" | "requests" | "pending"; label: string; count?: number }[] = [
      { id: "balances", label: "Balances" },
      { id: "requests", label: "My Requests", count: myPendingCount || undefined },
    ];
    if (isAdminView) {
      t.push({ id: "pending", label: "Review", count: pendingCount?.count || undefined });
    }
    return t;
  }, [isAdminView, myPendingCount, pendingCount]);

  return (
    <div className={cn("relative", className)}>
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        className={cn(
          "inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-all",
          "bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#8b6f47]",
          "text-[#a0704b] dark:text-[#cd853f]",
          "hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] hover:shadow-sm",
          isOpen && "bg-[#f5ede3] dark:bg-[#3d3628] shadow-sm"
        )}
      >
        <ArkIcon className="h-5 w-5" />
        <span className="hidden xs:inline">Leave Record</span>
        <span className="xs:hidden">Leave</span>
        {badgeCount > 0 && (
          <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className={cn(
              "z-50 w-80 max-h-[70vh] flex flex-col",
              "bg-white dark:bg-[#1a1a1a] rounded-lg shadow-lg",
              "border border-[#e8d4b8] dark:border-[#6b5a4a]"
            )}
          >
            {/* Tabs */}
            <div className="flex border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
              {tabs.map((tab, i) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex-1 px-3 py-2.5 text-xs font-medium transition-colors",
                    activeTab === tab.id
                      ? "text-[#a0704b] border-b-2 border-[#a0704b] bg-[#faf6f1] dark:bg-[#2d2820]"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300",
                    i === 0 && "rounded-tl-lg",
                    i === tabs.length - 1 && "rounded-tr-lg",
                  )}
                >
                  {tab.label}
                  {tab.count && tab.count > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {isArkError ? (
                <div className="text-center py-8 px-4">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400 opacity-50" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Could not connect to ARK
                  </p>
                  <button
                    onClick={handleOpenArk}
                    className="mt-2 text-xs text-[#a0704b] hover:underline"
                  >
                    Open ARK directly
                  </button>
                </div>
              ) : activeTab === "balances" ? (
                loadingBalances ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-[#a0704b]" />
                  </div>
                ) : visibleBalances.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                    No leave balances
                  </div>
                ) : (
                  <div className="py-1 divide-y divide-[#e8d4b8]/30 dark:divide-[#6b5a4a]/30">
                    {visibleBalances.map((b) => (
                      <BalanceRow key={b.id} balance={b} />
                    ))}
                  </div>
                )
              ) : activeTab === "requests" ? (
                loadingRequests ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-[#a0704b]" />
                  </div>
                ) : sortedMyRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-8 w-8 mx-auto mb-2 text-gray-400 opacity-50" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">No leave requests</p>
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {sortedMyRequests.slice(0, 8).map((r) => (
                      <RequestCard
                        key={r.id}
                        request={r}
                        showStaffName={false}
                        isAdmin={false}
                        onReview={handleReview}
                        isReviewing={reviewingId}
                      />
                    ))}
                  </div>
                )
              ) : (
                // Pending review tab (admin)
                loadingPending ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-[#a0704b]" />
                  </div>
                ) : (pendingRequests ?? []).length === 0 ? (
                  <div className="text-center py-8">
                    <Check className="h-8 w-8 mx-auto mb-2 text-green-400 opacity-50" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">All caught up!</p>
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {(pendingRequests ?? []).slice(0, 10).map((r) => (
                      <RequestCard
                        key={r.id}
                        request={r}
                        showStaffName={true}
                        isAdmin={true}
                        onReview={handleReview}
                        isReviewing={reviewingId}
                      />
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Footer */}
            <a
              href="#"
              onClick={handleOpenArk}
              className="flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium text-[#a0704b] hover:bg-[#faf6f1] dark:hover:bg-[#2d2820] border-t border-[#e8d4b8] dark:border-[#6b5a4a] transition-colors"
            >
              Open in ARK <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </FloatingPortal>
      )}
    </div>
  );
}
