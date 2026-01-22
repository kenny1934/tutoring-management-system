"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useProposal, useTutors } from "@/lib/hooks";
import { proposalsAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { mutate } from "swr";
import { getGradeColor } from "@/lib/constants";
import type { MakeupProposalSlot } from "@/types";
import {
  CalendarClock,
  Check,
  X,
  User,
  Users,
  ChevronRight,
  Calendar,
  Loader2,
} from "lucide-react";

interface ProposalEmbedProps {
  messageText: string;
  currentTutorId: number;
}

// Extract proposal ID from message text
function extractProposalId(text: string): number | null {
  const match = text.match(/\/proposals\?id=(\d+)/);
  return match ? parseInt(match[1], 10) : null;
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

// Compact slot item with confirmation dialogs
function SlotItem({
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
  const canAct = (isTargetTutor || isProposer || isAdmin) &&
    slot.slot_status === "pending" && proposalStatus === "pending";

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
              onClick={() => setShowApproveConfirm(true)}
              disabled={isLoading}
              className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors"
              title="Approve"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setShowRejectConfirm(true)}
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

      <ConfirmDialog
        isOpen={showApproveConfirm}
        onConfirm={() => {
          onApprove(slot.id);
          setShowApproveConfirm(false);
        }}
        onCancel={() => setShowApproveConfirm(false)}
        title="Approve Make-up Slot"
        message={`Approve this slot on ${formatDateCompact(slot.proposed_date)} at ${slot.proposed_time_slot}?`}
        confirmText="Approve"
        variant="primary"
      />
      <ConfirmDialog
        isOpen={showRejectConfirm}
        onConfirm={() => {
          onReject(slot.id);
          setShowRejectConfirm(false);
        }}
        onCancel={() => setShowRejectConfirm(false)}
        title="Reject Make-up Slot"
        message="Are you sure you want to reject this slot option?"
        confirmText="Reject"
        variant="danger"
      />
    </>
  );
}

export function ProposalEmbed({ messageText, currentTutorId }: ProposalEmbedProps) {
  const { showToast } = useToast();
  const [loadingSlotId, setLoadingSlotId] = useState<number | null>(null);

  // Extract proposal ID from message
  const proposalId = extractProposalId(messageText);

  // Fetch proposal data
  const { data: proposal, isLoading, error } = useProposal(proposalId);

  // Get tutors to check admin status
  const { data: tutors = [] } = useTutors();
  const currentTutor = tutors.find((t) => t.id === currentTutorId);
  const isAdmin = currentTutor?.role === 'Admin' || currentTutor?.role === 'Super Admin';

  const refreshProposals = () => {
    mutate((key) =>
      Array.isArray(key) &&
      (key[0] === "proposals" || key[0] === "pending-proposals-count" || key[0] === "proposal")
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

  // Don't render if no proposal ID found
  if (!proposalId) return null;

  // Loading state
  if (isLoading) {
    return (
      <div className="mt-3 p-3 border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-[#faf6f1]/50 dark:bg-[#2d2820]/50">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading proposal...
        </div>
      </div>
    );
  }

  // Error or not found - proposal was likely cancelled
  if (error || !proposal) {
    return (
      <div className="mt-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <CalendarClock className="h-4 w-4" />
          <span>This proposal has been cancelled or no longer exists.</span>
        </div>
      </div>
    );
  }

  const session = proposal.original_session;
  const isProposer = proposal.proposed_by_tutor_id === currentTutorId;
  const gradeColor = session?.grade ? getGradeColor(session.grade, session.lang_stream) : undefined;

  // Get relevant slots
  const relevantSlots = proposal.proposal_type === "specific_slots"
    ? proposal.slots.filter(
        (s) => s.proposed_tutor_id === currentTutorId || isProposer || isAdmin
      )
    : [];

  return (
    <div className="mt-3 border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden bg-white dark:bg-[#1a1a1a]">
      {/* Header */}
      <div className="px-3 py-2 bg-[#faf6f1] dark:bg-[#2d2820] border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
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
          <span
            className={cn(
              "px-1.5 py-0.5 text-[10px] font-medium rounded flex-shrink-0",
              proposal.status === "pending"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : proposal.status === "approved"
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            )}
          >
            {proposal.status}
          </span>
        </div>

        {/* Original session info */}
        {session && (
          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
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
              <SlotItem
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
        className="block px-3 py-2 text-xs text-center text-[#a0704b] hover:bg-[#faf6f1] dark:hover:bg-[#2d2820] border-t border-[#e8d4b8] dark:border-[#6b5a4a] transition-colors"
      >
        View Details <ChevronRight className="h-3 w-3 inline" />
      </Link>
    </div>
  );
}
