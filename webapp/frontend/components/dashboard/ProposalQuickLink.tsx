"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useProposals, usePendingProposalCount, useTutors } from "@/lib/hooks";
import { proposalsAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { mutate } from "swr";
import { getGradeColor } from "@/lib/constants";
import type { MakeupProposal, MakeupProposalSlot } from "@/types";
import {
  CalendarClock,
  Check,
  X,
  Clock,
  MapPin,
  User,
  Users,
  ChevronDown,
  ChevronRight,
  Calendar,
  Loader2,
  Send,
  Inbox as InboxIcon,
  Search,
  ArrowUp,
  ArrowDown,
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

interface ProposalQuickLinkProps {
  tutorId: number;
  className?: string;
}

// Format date compactly
function formatDateCompact(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Compact slot item for popover with confirmation dialogs
function CompactSlotItem({
  slot,
  currentTutorId,
  isProposer,
  isAdmin,
  proposalStatus,
  onApprove,
  onReject,
  isLoading,
}: {
  slot: MakeupProposalSlot;
  currentTutorId: number;
  isProposer: boolean;
  isAdmin: boolean;
  proposalStatus: string;
  onApprove: (slotId: number) => void;
  onReject: (slotId: number) => void;
  isLoading: boolean;
}) {
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);

  const isTargetTutor = slot.proposed_tutor_id === currentTutorId;
  // Expanded permissions: target tutor, proposer, or admin can act
  const canAct = (isTargetTutor || isProposer || isAdmin) &&
    slot.slot_status === "pending" && proposalStatus === "pending";

  const handleApproveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowApproveConfirm(true);
  };

  const handleRejectClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowRejectConfirm(true);
  };

  const confirmApprove = () => {
    onApprove(slot.id);
    setShowApproveConfirm(false);
  };

  const confirmReject = () => {
    onReject(slot.id);
    setShowRejectConfirm(false);
  };

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded text-xs",
          slot.slot_status === "approved"
            ? "bg-green-50 dark:bg-green-900/20"
            : slot.slot_status === "rejected"
            ? "bg-gray-50 dark:bg-gray-900/20 opacity-60"
            : "bg-white dark:bg-[#2a2a2a]"
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3 text-[#a0704b] flex-shrink-0" />
            <span className="truncate font-medium">
              {formatDateCompact(slot.proposed_date)} {slot.proposed_time_slot}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
            <User className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{slot.proposed_tutor_name}</span>
            {isTargetTutor && (
              <span className="px-1 py-0.5 text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                You
              </span>
            )}
          </div>
        </div>

        {canAct && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleApproveClick}
              disabled={isLoading}
              className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors"
              title="Approve"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button
              onClick={handleRejectClick}
              disabled={isLoading}
              className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
              title="Reject"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {slot.slot_status !== "pending" && (
          <span
            className={cn(
              "px-1.5 py-0.5 text-[10px] font-medium rounded flex-shrink-0",
              slot.slot_status === "approved"
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            )}
          >
            {slot.slot_status === "approved" ? "Approved" : "Rejected"}
          </span>
        )}
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={showApproveConfirm}
        onConfirm={confirmApprove}
        onCancel={() => setShowApproveConfirm(false)}
        title="Approve Make-up Slot"
        message={`Approve this slot on ${formatDateCompact(slot.proposed_date)} at ${slot.proposed_time_slot}?`}
        confirmText="Approve"
        variant="primary"
      />
      <ConfirmDialog
        isOpen={showRejectConfirm}
        onConfirm={confirmReject}
        onCancel={() => setShowRejectConfirm(false)}
        title="Reject Make-up Slot"
        message="Are you sure you want to reject this slot option?"
        confirmText="Reject"
        variant="danger"
      />
    </>
  );
}

// Compact proposal card for popover - collapsible
function CompactProposalCard({
  proposal,
  currentTutorId,
  isAdmin,
  onClose,
}: {
  proposal: MakeupProposal;
  currentTutorId: number;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [loadingSlotId, setLoadingSlotId] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const session = proposal.original_session;
  const isProposer = proposal.proposed_by_tutor_id === currentTutorId;

  const refreshProposals = () => {
    mutate((key) =>
      Array.isArray(key) &&
      (key[0] === "proposals" || key[0] === "pending-proposals-count")
    );
  };

  const handleApprove = async (slotId: number) => {
    setLoadingSlotId(slotId);
    try {
      await proposalsAPI.approveSlot(slotId, currentTutorId);
      showToast("Slot approved! Make-up booked.", "success");
      refreshProposals();
    } catch (error) {
      console.error("Failed to approve:", error);
      showToast("Failed to approve slot", "error");
    } finally {
      setLoadingSlotId(null);
    }
  };

  const handleReject = async (slotId: number) => {
    setLoadingSlotId(slotId);
    try {
      await proposalsAPI.rejectSlot(slotId, currentTutorId);
      showToast("Slot rejected", "info");
      refreshProposals();
    } catch (error) {
      console.error("Failed to reject:", error);
      showToast("Failed to reject slot", "error");
    } finally {
      setLoadingSlotId(null);
    }
  };

  // For pending specific_slots: show slots that target this tutor, or all if proposer/admin
  const relevantSlots = proposal.proposal_type === "specific_slots"
    ? proposal.slots.filter(
        (s) => s.proposed_tutor_id === currentTutorId || isProposer || isAdmin
      )
    : [];

  // Get grade color for student tag
  const gradeColor = session?.grade ? getGradeColor(session.grade, session.lang_stream) : undefined;

  // Summary for collapsed view
  const slotSummary = proposal.proposal_type === "specific_slots"
    ? `${relevantSlots.length} slot${relevantSlots.length !== 1 ? "s" : ""}`
    : "Input requested";

  return (
    <div className="border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden bg-white dark:bg-[#1a1a1a]">
      {/* Clickable Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left px-3 py-2 bg-[#faf6f1] dark:bg-[#2d2820] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Users className="h-3.5 w-3.5 text-[#a0704b] flex-shrink-0" />
            {session?.school_student_id && (
              <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">
                {session.school_student_id}
              </span>
            )}
            <span className="font-medium text-sm truncate">
              {session?.student_name || "Unknown Student"}
            </span>
            {session?.grade && gradeColor && (
              <span
                className="px-1 py-0.5 text-[9px] font-medium rounded flex-shrink-0 text-gray-800"
                style={{ backgroundColor: gradeColor }}
              >
                {session.grade}{session.lang_stream || ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span
              className={cn(
                "px-1.5 py-0.5 text-[10px] font-medium rounded",
                proposal.status === "pending"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : proposal.status === "approved"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              )}
            >
              {proposal.status}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-gray-400 transition-transform duration-200",
                !isExpanded && "-rotate-90"
              )}
            />
          </div>
        </div>
        {/* Collapsed summary - show when not expanded */}
        {!isExpanded && (
          <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500 dark:text-gray-400">
            {isProposer ? (
              <span className="flex items-center gap-0.5">
                <Send className="h-2.5 w-2.5" />
                You
              </span>
            ) : (
              <span className="flex items-center gap-0.5">
                <InboxIcon className="h-2.5 w-2.5" />
                {proposal.proposed_by_tutor_name?.split(" ").slice(-1)[0]}
              </span>
            )}
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span>{slotSummary}</span>
          </div>
        )}
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <>
          {/* Proposer info and original session */}
          <div className="px-3 py-2 border-t border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 bg-[#faf6f1]/50 dark:bg-[#2d2820]/50">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {isProposer ? (
                <span className="flex items-center gap-1">
                  <Send className="h-3 w-3" />
                  You proposed
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <InboxIcon className="h-3 w-3" />
                  From {proposal.proposed_by_tutor_name}
                </span>
              )}
            </div>
            {/* Original session details */}
            {session && (
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 pt-1.5 border-t border-[#e8d4b8]/30 dark:border-[#6b5a4a]/30 flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDateCompact(session.session_date)} {session.time_slot}
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {session.tutor_name}
                </span>
              </div>
            )}
          </div>

          {/* Slots */}
          {proposal.proposal_type === "specific_slots" && relevantSlots.length > 0 && (
            <div className="p-2 space-y-1.5">
              {relevantSlots
                .sort((a, b) => a.slot_order - b.slot_order)
                .slice(0, 3)
                .map((slot) => (
                  <CompactSlotItem
                    key={slot.id}
                    slot={slot}
                    currentTutorId={currentTutorId}
                    isProposer={isProposer}
                    isAdmin={isAdmin}
                    proposalStatus={proposal.status}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    isLoading={loadingSlotId === slot.id}
                  />
                ))}
              {relevantSlots.length > 3 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  +{relevantSlots.length - 3} more slots
                </p>
              )}
            </div>
          )}

          {/* needs_input type */}
          {proposal.proposal_type === "needs_input" && (
            <div className="p-2">
              <div className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded p-2">
                {proposal.needs_input_tutor_id === currentTutorId
                  ? "You need to select a slot"
                  : `Waiting for ${proposal.needs_input_tutor_name}`}
              </div>
            </div>
          )}

          {/* View details link */}
          <Link
            href={`/proposals?id=${proposal.id}`}
            onClick={onClose}
            className="block px-3 py-2 text-xs text-center text-[#a0704b] hover:bg-[#faf6f1] dark:hover:bg-[#2d2820] border-t border-[#e8d4b8] dark:border-[#6b5a4a] transition-colors"
          >
            View details <ChevronRight className="h-3 w-3 inline" />
          </Link>
        </>
      )}
    </div>
  );
}

export function ProposalQuickLink({ tutorId, className }: ProposalQuickLinkProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"for-me" | "by-me">("for-me");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  // Get tutors to check admin status
  const { data: tutors = [] } = useTutors();

  // Check if current user is admin
  const currentTutor = useMemo(() => {
    return tutors.find((t) => t.id === tutorId);
  }, [tutors, tutorId]);
  const isAdmin = currentTutor?.role === 'admin' || currentTutor?.role === 'super_admin';

  // Fetch counts and proposals
  const { data: pendingCount } = usePendingProposalCount(tutorId);

  // Proposals targeting this tutor (for me)
  const { data: proposalsForMe = [], isLoading: loadingForMe } = useProposals({
    tutorId,
    status: "pending",
    includeSession: true,
  });

  // Proposals created by this tutor (by me)
  const { data: proposalsByMe = [], isLoading: loadingByMe } = useProposals({
    proposedBy: tutorId,
    status: "pending",
    includeSession: true,
  });

  // Total pending count (for badge)
  const totalPending = useMemo(() => {
    const forMeCount = pendingCount?.count || 0;
    const byMeCount = proposalsByMe.length;
    return forMeCount + byMeCount;
  }, [pendingCount, proposalsByMe]);

  // Filter and sort proposals
  const filteredProposals = useMemo(() => {
    let result = activeTab === "for-me" ? proposalsForMe : proposalsByMe;

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.original_session?.student_name?.toLowerCase().includes(q)
      );
    }

    // Sort by created_at
    result = [...result].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [activeTab, proposalsForMe, proposalsByMe, searchQuery, sortOrder]);

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
        <CalendarClock className="h-4 w-4" />
        <span>Make-up Proposals</span>
        {totalPending > 0 && (
          <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {totalPending > 99 ? "99+" : totalPending}
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Popover */}
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
              <button
                onClick={() => setActiveTab("for-me")}
                className={cn(
                  "flex-1 px-4 py-2.5 text-sm font-medium transition-colors",
                  activeTab === "for-me"
                    ? "text-[#a0704b] border-b-2 border-[#a0704b] bg-[#faf6f1] dark:bg-[#2d2820]"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                )}
              >
                <InboxIcon className="h-4 w-4 inline mr-1.5" />
                For Me
                {proposalsForMe.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full">
                    {proposalsForMe.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("by-me")}
                className={cn(
                  "flex-1 px-4 py-2.5 text-sm font-medium transition-colors",
                  activeTab === "by-me"
                    ? "text-[#a0704b] border-b-2 border-[#a0704b] bg-[#faf6f1] dark:bg-[#2d2820]"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                )}
              >
                <Send className="h-4 w-4 inline mr-1.5" />
                By Me
                {proposalsByMe.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                    {proposalsByMe.length}
                  </span>
                )}
              </button>
            </div>

            {/* Search and Sort */}
            <div className="px-3 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf6f1]/50 dark:bg-[#2d2820]/50">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search student..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-[#e8d4b8] dark:border-[#6b5a4a] rounded bg-white dark:bg-[#1a1a1a] placeholder-gray-400"
                  />
                </div>
                <button
                  onClick={() => setSortOrder(s => s === "newest" ? "oldest" : "newest")}
                  className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  title={sortOrder === "newest" ? "Newest first" : "Oldest first"}
                >
                  {sortOrder === "newest" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {(activeTab === "for-me" ? loadingForMe : loadingByMe) ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-[#a0704b]" />
                </div>
              ) : filteredProposals.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  {activeTab === "for-me" ? (
                    <InboxIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  ) : (
                    <Send className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  )}
                  <p className="text-sm">
                    {searchQuery.trim()
                      ? "No matching proposals"
                      : activeTab === "for-me"
                      ? "No pending proposals for you"
                      : "No pending proposals by you"}
                  </p>
                </div>
              ) : (
                filteredProposals.slice(0, 5).map((proposal) => (
                  <CompactProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    currentTutorId={tutorId}
                    isAdmin={isAdmin}
                    onClose={() => setIsOpen(false)}
                  />
                ))
              )}
            </div>

            {/* Footer */}
            <Link
              href="/proposals"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-3 text-sm text-center font-medium text-[#a0704b] hover:bg-[#faf6f1] dark:hover:bg-[#2d2820] border-t border-[#e8d4b8] dark:border-[#6b5a4a] transition-colors"
            >
              View All Proposals <ChevronRight className="h-4 w-4 inline" />
            </Link>
          </div>
        </FloatingPortal>
      )}
    </div>
  );
}
