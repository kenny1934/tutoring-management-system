"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { proposalsAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { mutate } from "swr";
import type { MakeupProposal, MakeupProposalSlot } from "@/types";
import {
  CalendarClock,
  Check,
  X,
  Clock,
  MapPin,
  User,
  Users,
  AlertCircle,
  Loader2,
  Trash2,
  MessageSquare,
  Calendar,
} from "lucide-react";

interface ProposalCardProps {
  proposal: MakeupProposal;
  currentTutorId: number;
  onSelectSlot?: () => void; // For needs_input type to open ScheduleMakeupModal
  className?: string;
}

// Format date for display
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Format time for display
function formatTime(time: string): string {
  // Already in format like "3:00 PM"
  return time;
}

// Slot status badge
function SlotStatusBadge({ status, rejectionReason }: { status: string; rejectionReason?: string }) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        <Clock className="h-3 w-3" />
        Pending
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <Check className="h-3 w-3" />
        Approved
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
        title={rejectionReason || "Rejected"}
      >
        <X className="h-3 w-3" />
        Rejected
      </span>
    );
  }
  return null;
}

// Single slot display
function SlotItem({
  slot,
  slotIndex,
  currentTutorId,
  proposalStatus,
  onApprove,
  onReject,
}: {
  slot: MakeupProposalSlot;
  slotIndex: number;
  currentTutorId: number;
  proposalStatus: string;
  onApprove: (slotId: number) => void;
  onReject: (slotId: number, reason?: string) => void;
}) {
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const isTargetTutor = slot.proposed_tutor_id === currentTutorId;
  const canAct = isTargetTutor && slot.slot_status === "pending" && proposalStatus === "pending";

  const handleReject = () => {
    if (showRejectInput) {
      setIsRejecting(true);
      onReject(slot.id, rejectionReason || undefined);
      setIsRejecting(false);
      setShowRejectInput(false);
    } else {
      setShowRejectInput(true);
    }
  };

  return (
    <div
      className={cn(
        "p-3 rounded-lg border transition-all",
        slot.slot_status === "approved"
          ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
          : slot.slot_status === "rejected"
          ? "bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-700 opacity-60"
          : "bg-white border-[#e8d4b8] dark:bg-[#2a2a2a] dark:border-[#6b5a4a]"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Option {slotIndex + 1}
            </span>
            <SlotStatusBadge status={slot.slot_status} rejectionReason={slot.rejection_reason || undefined} />
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
              <Calendar className="h-4 w-4 text-[#a0704b]" />
              {formatDate(slot.proposed_date)} at {formatTime(slot.proposed_time_slot)}
            </div>
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <User className="h-4 w-4" />
              {slot.proposed_tutor_name || `Tutor #${slot.proposed_tutor_id}`}
              {isTargetTutor && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  You
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <MapPin className="h-4 w-4" />
              {slot.proposed_location}
            </div>
          </div>

          {slot.slot_status === "rejected" && slot.rejection_reason && (
            <div className="mt-2 text-xs text-red-600 dark:text-red-400 italic">
              Reason: {slot.rejection_reason}
            </div>
          )}
        </div>

        {/* Action buttons for target tutor */}
        {canAct && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => onApprove(slot.id)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
            >
              <Check className="h-4 w-4" />
              Approve
            </button>
            {showRejectInput ? (
              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Reason (optional)"
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[#2a2a2a]"
                  autoFocus
                />
                <div className="flex gap-1">
                  <button
                    onClick={handleReject}
                    disabled={isRejecting}
                    className="flex-1 px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setShowRejectInput(false)}
                    className="px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={handleReject}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 hover:text-white hover:bg-red-600 border border-red-300 dark:border-red-800 rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
                Reject
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProposalCard({
  proposal,
  currentTutorId,
  onSelectSlot,
  className,
}: ProposalCardProps) {
  const { showToast } = useToast();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const isProposer = proposal.proposed_by_tutor_id === currentTutorId;
  const isNeedsInputTarget = proposal.proposal_type === "needs_input" &&
    proposal.needs_input_tutor_id === currentTutorId;
  const canCancel = isProposer && proposal.status === "pending";
  const canRejectNeedsInput = isNeedsInputTarget && proposal.status === "pending";

  // Session info from the proposal
  const session = proposal.original_session;

  // Mutate helper to refresh proposal data
  const refreshProposals = () => {
    mutate((key) =>
      Array.isArray(key) &&
      (key[0] === "proposals" ||
        key[0] === "pending-proposals-count" ||
        key[0] === "message-threads")
    );
  };

  const handleApproveSlot = async (slotId: number) => {
    setLoadingAction(`approve-${slotId}`);
    try {
      await proposalsAPI.approveSlot(slotId, currentTutorId);
      showToast("Slot approved! Make-up session booked.", "success");
      refreshProposals();
    } catch (error) {
      console.error("Failed to approve slot:", error);
      showToast("Failed to approve slot", "error");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRejectSlot = async (slotId: number, reason?: string) => {
    setLoadingAction(`reject-${slotId}`);
    try {
      await proposalsAPI.rejectSlot(slotId, currentTutorId, reason);
      showToast("Slot rejected", "info");
      refreshProposals();
    } catch (error) {
      console.error("Failed to reject slot:", error);
      showToast("Failed to reject slot", "error");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCancel = async () => {
    setLoadingAction("cancel");
    try {
      await proposalsAPI.cancel(proposal.id, currentTutorId);
      showToast("Proposal cancelled", "info");
      refreshProposals();
    } catch (error) {
      console.error("Failed to cancel proposal:", error);
      showToast("Failed to cancel proposal", "error");
    } finally {
      setLoadingAction(null);
      setShowCancelConfirm(false);
    }
  };

  const handleRejectNeedsInput = async () => {
    setLoadingAction("reject");
    try {
      await proposalsAPI.reject(proposal.id, currentTutorId, rejectReason || undefined);
      showToast("Proposal rejected", "info");
      refreshProposals();
    } catch (error) {
      console.error("Failed to reject proposal:", error);
      showToast("Failed to reject proposal", "error");
    } finally {
      setLoadingAction(null);
      setShowRejectConfirm(false);
      setRejectReason("");
    }
  };

  // Status styling
  const statusStyles = {
    pending: "border-amber-300 dark:border-amber-700",
    approved: "border-green-300 dark:border-green-700",
    rejected: "border-red-300 dark:border-red-700",
  };

  return (
    <>
      <div
        className={cn(
          "bg-white dark:bg-[#1a1a1a] rounded-lg border-2 shadow-sm",
          statusStyles[proposal.status as keyof typeof statusStyles] || statusStyles.pending,
          className
        )}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-[#a0704b]" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Make-up Proposal
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {proposal.proposal_type === "needs_input"
                    ? "Input requested"
                    : `${proposal.slots.length} slot option${proposal.slots.length !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>
            <SlotStatusBadge status={proposal.status} />
          </div>
        </div>

        {/* Student & Session Info */}
        <div className="px-4 py-3 bg-[#faf6f1] dark:bg-[#2d2820] border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          {session ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-500" />
                <span className="font-medium text-gray-900 dark:text-white">
                  {session.student_name}
                </span>
                {session.school_student_id && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({session.school_student_id})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span>Original: {formatDate(session.session_date)} at {session.time_slot}</span>
                <span>with {session.tutor_name}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <AlertCircle className="h-4 w-4" />
              Session details not available
            </div>
          )}
        </div>

        {/* Proposed By */}
        <div className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          Proposed by <span className="font-medium">{proposal.proposed_by_tutor_name || `Tutor #${proposal.proposed_by_tutor_id}`}</span>
          {isProposer && " (You)"}
          <span className="text-gray-400 dark:text-gray-500 ml-2">
            {new Date(proposal.created_at).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>

        {/* Notes */}
        {proposal.notes && (
          <div className="px-4 py-2 text-sm bg-amber-50 dark:bg-amber-900/10 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
            <div className="flex items-start gap-2">
              <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-gray-700 dark:text-gray-300 italic">{proposal.notes}</p>
            </div>
          </div>
        )}

        {/* Content based on proposal type */}
        <div className="p-4">
          {proposal.proposal_type === "specific_slots" ? (
            // Show all slots
            <div className="space-y-3">
              {proposal.slots
                .sort((a, b) => a.slot_order - b.slot_order)
                .map((slot, index) => (
                  <SlotItem
                    key={slot.id}
                    slot={slot}
                    slotIndex={index}
                    currentTutorId={currentTutorId}
                    proposalStatus={proposal.status}
                    onApprove={handleApproveSlot}
                    onReject={handleRejectSlot}
                  />
                ))}
            </div>
          ) : (
            // needs_input type
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-blue-900 dark:text-blue-100">
                      Input Requested
                    </p>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      {isNeedsInputTarget
                        ? "You've been asked to select a make-up slot for this student."
                        : `Waiting for ${proposal.needs_input_tutor_name || "the main tutor"} to select a slot.`}
                    </p>
                  </div>
                </div>
              </div>

              {isNeedsInputTarget && proposal.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    onClick={onSelectSlot}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#a0704b] hover:bg-[#8b5f3c] rounded-lg transition-colors"
                  >
                    <Calendar className="h-4 w-4" />
                    Select Slot
                  </button>
                  <button
                    onClick={() => setShowRejectConfirm(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-white hover:bg-red-600 border border-red-300 dark:border-red-800 rounded-lg transition-colors"
                  >
                    <X className="h-4 w-4" />
                    Decline
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {canCancel && (
          <div className="px-4 py-3 border-t border-[#e8d4b8] dark:border-[#6b5a4a] flex justify-end">
            <button
              onClick={() => setShowCancelConfirm(true)}
              disabled={loadingAction === "cancel"}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              {loadingAction === "cancel" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Cancel Proposal
            </button>
          </div>
        )}
      </div>

      {/* Cancel Confirm Dialog */}
      <ConfirmDialog
        isOpen={showCancelConfirm}
        onConfirm={handleCancel}
        onCancel={() => setShowCancelConfirm(false)}
        title="Cancel Proposal"
        message="Are you sure you want to cancel this proposal? This action cannot be undone."
        confirmText="Cancel Proposal"
        variant="danger"
        loading={loadingAction === "cancel"}
      />

      {/* Reject Needs Input Dialog */}
      <ConfirmDialog
        isOpen={showRejectConfirm}
        onConfirm={handleRejectNeedsInput}
        onCancel={() => {
          setShowRejectConfirm(false);
          setRejectReason("");
        }}
        title="Decline Request"
        message={
          <div className="space-y-3">
            <p>Are you sure you want to decline this make-up request?</p>
            <div>
              <label className="block text-sm font-medium mb-1">Reason (optional)</label>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g., No available slots this week"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#2a2a2a]"
              />
            </div>
          </div>
        }
        confirmText="Decline"
        variant="danger"
        loading={loadingAction === "reject"}
      />
    </>
  );
}
