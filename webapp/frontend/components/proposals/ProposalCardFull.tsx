"use client";

import { useState, useMemo, memo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { proposalsAPI } from "@/lib/api";
import { useToast } from "@/contexts/ToastContext";
import { useActiveTutors, useSessions, useLocations } from "@/lib/hooks";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { mutate } from "swr";
import { getGradeColor, CURRENT_USER_TUTOR, ALL_TIME_SLOTS } from "@/lib/constants";
import { formatProposalDate, formatTimeAgo } from "@/lib/formatters";
import type { MakeupProposal, MakeupProposalSlot, Session, Tutor } from "@/types";
import {
  CalendarClock,
  Check,
  X,
  Clock,
  MapPin,
  User,
  Users,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Trash2,
  MessageSquare,
  Calendar,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Send,
  Inbox,
  Eye,
  Pencil,
  Save,
} from "lucide-react";
interface ProposalCardFullProps {
  proposal: MakeupProposal;
  currentTutorId: number;
  onSelectSlot?: () => void;
  className?: string;
  defaultExpanded?: boolean;
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

// Student display for slot availability
function StudentInSlot({ session }: { session: Session }) {
  const gradeColor = getGradeColor(session.grade, session.lang_stream);

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-gray-400 font-mono">{session.school_student_id}</span>
      <span className="text-gray-700 dark:text-gray-300">{session.student_name}</span>
      {session.grade && (
        <span
          className="px-1 py-0.5 text-[10px] font-medium rounded text-gray-800"
          style={{ backgroundColor: gradeColor }}
        >
          {session.grade}{session.lang_stream || ""}
        </span>
      )}
    </div>
  );
}

// Single slot display with expanded permissions and slot availability
function SlotItem({
  slot,
  slotIndex,
  currentTutorId,
  isProposer,
  isAdmin,
  proposalStatus,
  slotSessions,
  canEdit,
  isEditing,
  tutors,
  locations,
  onApprove,
  onReject,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: {
  slot: MakeupProposalSlot;
  slotIndex: number;
  currentTutorId: number;
  isProposer: boolean;
  isAdmin: boolean;
  proposalStatus: string;
  slotSessions: Session[];
  canEdit: boolean;
  isEditing: boolean;
  tutors: Tutor[];
  locations: string[];
  onApprove: (slotId: number) => void;
  onReject: (slotId: number, reason?: string) => void;
  onStartEdit: (slotId: number) => void;
  onCancelEdit: () => void;
  onSaveEdit: (slotId: number, data: {
    proposed_date?: string;
    proposed_time_slot?: string;
    proposed_tutor_id?: number;
    proposed_location?: string;
  }) => Promise<void>;
}) {
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit form state
  const [editDate, setEditDate] = useState(slot.proposed_date);
  const [editTime, setEditTime] = useState(slot.proposed_time_slot);
  const [editTutorId, setEditTutorId] = useState(slot.proposed_tutor_id);
  const [editLocation, setEditLocation] = useState(slot.proposed_location);

  const isTargetTutor = slot.proposed_tutor_id === currentTutorId;
  // Expanded permissions: target tutor, proposer, or admin can act
  const canAct = (isTargetTutor || isProposer || isAdmin) &&
    slot.slot_status === "pending" && proposalStatus === "pending";

  // Reset edit state when slot changes
  const resetEditState = () => {
    setEditDate(slot.proposed_date);
    setEditTime(slot.proposed_time_slot);
    setEditTutorId(slot.proposed_tutor_id);
    setEditLocation(slot.proposed_location);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const changes: {
        proposed_date?: string;
        proposed_time_slot?: string;
        proposed_tutor_id?: number;
        proposed_location?: string;
      } = {};

      if (editDate !== slot.proposed_date) changes.proposed_date = editDate;
      if (editTime !== slot.proposed_time_slot) changes.proposed_time_slot = editTime;
      if (editTutorId !== slot.proposed_tutor_id) changes.proposed_tutor_id = editTutorId;
      if (editLocation !== slot.proposed_location) changes.proposed_location = editLocation;

      if (Object.keys(changes).length > 0) {
        await onSaveEdit(slot.id, changes);
      } else {
        onCancelEdit();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    resetEditState();
    onCancelEdit();
  };

  // Determine the role badge to show (priority: target > proposer > admin)
  const actingAs = isTargetTutor ? null : isProposer ? "proposer" : isAdmin ? "admin" : null;

  // Filter sessions for this specific slot
  const studentsInSlot = useMemo(() => {
    return slotSessions.filter(
      (s) =>
        s.session_date === slot.proposed_date &&
        s.time_slot === slot.proposed_time_slot &&
        s.tutor_id === slot.proposed_tutor_id
    );
  }, [slotSessions, slot.proposed_date, slot.proposed_time_slot, slot.proposed_tutor_id]);

  const slotCapacity = 8;
  const isFull = studentsInSlot.length >= slotCapacity;

  const handleApprove = () => {
    setShowApproveConfirm(true);
  };

  const confirmApprove = () => {
    onApprove(slot.id);
    setShowApproveConfirm(false);
  };

  const handleRejectClick = () => {
    if (showRejectInput) {
      setShowRejectConfirm(true);
    } else {
      setShowRejectInput(true);
    }
  };

  const confirmReject = () => {
    onReject(slot.id, rejectionReason || undefined);
    setShowRejectConfirm(false);
    setShowRejectInput(false);
    setRejectionReason("");
  };

  return (
    <>
      <div
        className={cn(
          "p-4 rounded-lg border transition-all",
          slot.slot_status === "approved"
            ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
            : slot.slot_status === "rejected"
            ? "bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-700 opacity-60"
            : isEditing
            ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800"
            : "bg-white border-[#e8d4b8] dark:bg-[#2a2a2a] dark:border-[#6b5a4a]"
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-[#a0704b] dark:text-[#cd853f]">
                Option {slotIndex + 1}
              </span>
              <SlotStatusBadge status={slot.slot_status} rejectionReason={slot.rejection_reason || undefined} />
              {/* Edit button - visible when canEdit and not currently editing */}
              {canEdit && !isEditing && (
                <button
                  onClick={() => onStartEdit(slot.id)}
                  className="ml-auto p-1 text-gray-400 hover:text-[#a0704b] dark:hover:text-[#cd853f] rounded transition-colors"
                  title="Edit slot"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Edit form or static display */}
            {isEditing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Date</label>
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#2a2a2a]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Time</label>
                    <select
                      value={editTime}
                      onChange={(e) => setEditTime(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#2a2a2a]"
                    >
                      {ALL_TIME_SLOTS.map((ts) => (
                        <option key={ts} value={ts}>{ts}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tutor</label>
                    <select
                      value={editTutorId}
                      onChange={(e) => setEditTutorId(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#2a2a2a]"
                    >
                      {tutors.map((t) => (
                        <option key={t.id} value={t.id}>{t.tutor_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Location</label>
                    <select
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#2a2a2a]"
                    >
                      {locations.map((loc) => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#a0704b] hover:bg-[#8b5f3c] rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
                    <Calendar className="h-4 w-4 text-[#a0704b]" />
                    {formatProposalDate(slot.proposed_date)} at {slot.proposed_time_slot}
                  </div>
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <User className="h-4 w-4" />
                    <span className="font-medium">{slot.proposed_tutor_name || `Tutor #${slot.proposed_tutor_id}`}</span>
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

                {/* Slot availability - students in this slot */}
                {slot.slot_status === "pending" && (
                  <div className="mt-3 p-2.5 bg-[#fef9f3] dark:bg-[#2d2618] rounded border border-[#e8d4b8] dark:border-[#6b5a4a] border-l-2 border-l-[#a0704b]">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8b6f47] dark:text-[#cd853f] mb-1.5">
                      <Users className="h-3.5 w-3.5" />
                      STUDENTS IN SLOT ({studentsInSlot.length}/{slotCapacity})
                    </div>
                    {studentsInSlot.length > 0 ? (
                      <div className="space-y-1">
                        {studentsInSlot.map((s) => (
                          <StudentInSlot key={s.id} session={s} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                        No students in this slot yet
                      </p>
                    )}
                    {isFull && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-red-500 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        This slot is full
                      </div>
                    )}
                  </div>
                )}

                {slot.slot_status === "rejected" && slot.rejection_reason && (
                  <div className="mt-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 rounded p-2">
                    <span className="font-medium">Reason:</span> {slot.rejection_reason}
                  </div>
                )}

                {slot.resolved_at && (
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {slot.slot_status === "approved" ? "Approved" : "Rejected"} {formatTimeAgo(slot.resolved_at)}
                    {slot.resolved_by_tutor_name && ` by ${slot.resolved_by_tutor_name}`}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Action buttons - expanded permissions (only show when not editing) */}
          {canAct && !isEditing && (
            <div className="flex flex-col gap-2">
              {/* Role indicator when not the target tutor */}
              {actingAs && (
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium text-center",
                  actingAs === "admin"
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                )}>
                  {actingAs === "admin" ? "Acting as Admin" : "Acting as Proposer"}
                </span>
              )}
              <button
                onClick={handleApprove}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors shadow-sm"
              >
                <Check className="h-4 w-4" />
                Approve
              </button>
              {showRejectInput ? (
                <div className="flex flex-col gap-2 min-w-[180px]">
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#2a2a2a]"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleRejectClick}
                      className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => {
                        setShowRejectInput(false);
                        setRejectionReason("");
                      }}
                      className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleRejectClick}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 hover:text-white hover:bg-red-600 border border-red-300 dark:border-red-800 rounded-lg transition-colors"
                >
                  <X className="h-4 w-4" />
                  Reject
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Approve confirmation dialog */}
      <ConfirmDialog
        isOpen={showApproveConfirm}
        onConfirm={confirmApprove}
        onCancel={() => setShowApproveConfirm(false)}
        title="Approve Make-up Slot"
        message={`Are you sure you want to approve this slot? This will schedule a make-up session on ${formatProposalDate(slot.proposed_date)} at ${slot.proposed_time_slot}.`}
        confirmText="Approve"
        variant="default"
      />

      {/* Reject confirmation dialog */}
      <ConfirmDialog
        isOpen={showRejectConfirm}
        onConfirm={confirmReject}
        onCancel={() => setShowRejectConfirm(false)}
        title="Reject Make-up Slot"
        message={
          <div className="space-y-2">
            <p>Are you sure you want to reject this slot option?</p>
            {rejectionReason && (
              <p className="text-sm text-gray-500">
                Reason: <span className="italic">{rejectionReason}</span>
              </p>
            )}
          </div>
        }
        confirmText="Reject"
        variant="danger"
      />
    </>
  );
}

export const ProposalCardFull = memo(function ProposalCardFull({
  proposal,
  currentTutorId,
  onSelectSlot,
  className,
  defaultExpanded = false,
}: ProposalCardFullProps) {
  const { showToast } = useToast();
  const { data: tutors = [] } = useActiveTutors();
  const { data: locations = [] } = useLocations();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null);

  // Session detail popover state
  const [showSessionPopover, setShowSessionPopover] = useState(false);
  const [popoverClickPosition, setPopoverClickPosition] = useState<{ x: number; y: number } | null>(null);

  const isProposer = proposal.proposed_by_tutor_id === currentTutorId;
  const isNeedsInputTarget = proposal.proposal_type === "needs_input" &&
    proposal.needs_input_tutor_id === currentTutorId;
  const canCancel = isProposer && proposal.status === "pending";
  const canRejectNeedsInput = isNeedsInputTarget && proposal.status === "pending";

  // Check if current user is admin
  const currentTutor = useMemo(() => {
    return tutors.find((t) => t.id === currentTutorId);
  }, [tutors, currentTutorId]);
  const isAdmin = currentTutor?.role === 'Admin' || currentTutor?.role === 'Super Admin';

  // Check if editing is allowed: proposer or admin, proposal pending, ALL slots pending
  const canEdit = useMemo(() => {
    if (proposal.status !== "pending") return false;
    if (!isProposer && !isAdmin) return false;
    return proposal.slots.every((s) => s.slot_status === "pending");
  }, [proposal.status, proposal.slots, isProposer, isAdmin]);

  // Session info from the proposal
  const session = proposal.original_session;

  // Fetch sessions for slot availability (date range from proposal slots)
  const slotDateRange = useMemo(() => {
    if (!proposal.slots.length) return null;
    const dates = proposal.slots.map(s => s.proposed_date);
    return { from: Math.min(...dates.map(d => new Date(d).getTime())), to: Math.max(...dates.map(d => new Date(d).getTime())) };
  }, [proposal.slots]);

  const fromDate = slotDateRange ? new Date(slotDateRange.from).toISOString().split('T')[0] : undefined;
  const toDate = slotDateRange ? new Date(slotDateRange.to).toISOString().split('T')[0] : undefined;

  const { data: slotSessions = [] } = useSessions({
    from_date: fromDate,
    to_date: toDate,
  });

  // Handle opening session detail popover
  const handleViewSessionClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setPopoverClickPosition({ x: e.clientX, y: e.clientY });
    setShowSessionPopover(true);
  };

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
      showToast("Failed to reject slot", "error");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleUpdateSlot = async (
    slotId: number,
    data: {
      proposed_date?: string;
      proposed_time_slot?: string;
      proposed_tutor_id?: number;
      proposed_location?: string;
    }
  ) => {
    try {
      await proposalsAPI.updateSlot(slotId, currentTutorId, data);
      showToast("Slot updated", "success");
      setEditingSlotId(null);
      refreshProposals();
    } catch (error) {
      showToast("Failed to update slot", "error");
      throw error; // Re-throw so the SlotItem can handle the error state
    }
  };

  const handleCancel = async () => {
    setLoadingAction("cancel");
    try {
      await proposalsAPI.cancel(proposal.id, currentTutorId);
      showToast("Proposal cancelled", "info");
      refreshProposals();
    } catch (error) {
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
      showToast("Failed to reject proposal", "error");
    } finally {
      setLoadingAction(null);
      setShowRejectConfirm(false);
      setRejectReason("");
    }
  };

  // Status styling
  const statusStyles = {
    pending: "border-l-amber-500",
    approved: "border-l-green-500",
    rejected: "border-l-red-500",
  };

  return (
    <>
      <div
        className={cn(
          "bg-white dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm overflow-hidden",
          "border-l-4",
          statusStyles[proposal.status as keyof typeof statusStyles] || statusStyles.pending,
          className
        )}
      >
        {/* Clickable Header - Always visible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full text-left px-5 py-4 bg-[#faf6f1] dark:bg-[#2d2820] hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="p-2 rounded-lg bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] flex-shrink-0">
                <CalendarClock className="h-5 w-5 text-[#a0704b]" />
              </div>
              <div className="min-w-0 flex-1">
                {/* First row: status, student info */}
                <div className="flex items-center gap-2 flex-wrap">
                  <SlotStatusBadge status={proposal.status} />
                  {session && (
                    <>
                      <span className="text-sm text-gray-400 font-mono">
                        {session.school_student_id}
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white truncate">
                        {session.student_name}
                      </span>
                      {session.grade && (
                        <span
                          className="px-1 py-0.5 text-[10px] font-medium rounded flex-shrink-0 text-gray-800"
                          style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
                        >
                          {session.grade}{session.lang_stream || ""}
                        </span>
                      )}
                    </>
                  )}
                </div>
                {/* Second row: collapsed summary info */}
                {!isExpanded && session && (
                  <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatProposalDate(session.session_date)} {session.time_slot}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {session.tutor_name}
                    </span>
                    <span className="text-gray-400">
                      {proposal.proposal_type === "needs_input"
                        ? "• Input requested"
                        : `• ${proposal.slots.length} slot${proposal.slots.length !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right side: direction badge + chevron */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                  isProposer
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                )}
              >
                {isProposer ? (
                  <>
                    <Send className="h-3 w-3" />
                    <span className="hidden sm:inline">You proposed</span>
                  </>
                ) : (
                  <>
                    <Inbox className="h-3 w-3" />
                    <span className="hidden sm:inline">For you</span>
                  </>
                )}
              </div>
              <ChevronDown
                className={cn(
                  "h-5 w-5 text-gray-400 transition-transform duration-200",
                  isExpanded && "rotate-180"
                )}
              />
            </div>
          </div>
        </button>

        {/* Expanded Content */}
        {isExpanded && (
          <>
            {/* Student & Original Session Info */}
            <div className="px-5 py-4 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
              {session ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Users className="h-5 w-5 text-gray-400" />
                      <Link
                        href={`/students/${session.student_id}`}
                        className="group flex items-center gap-2 hover:text-[#a0704b] transition-colors"
                      >
                        {session.school_student_id && (
                          <span className="text-sm text-gray-400 font-mono">
                            {session.school_student_id}
                          </span>
                        )}
                        <span className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-[#a0704b]">
                          {session.student_name}
                        </span>
                      </Link>
                      {session.grade && (
                        <span
                          className="px-1.5 py-0.5 text-[11px] font-medium rounded text-gray-800"
                          style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
                        >
                          {session.grade}{session.lang_stream || ""}
                        </span>
                      )}
                      {session.school && (
                        <span className="px-1.5 py-0.5 text-[11px] font-medium rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 truncate max-w-[140px]">
                          {session.school}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        Original: {formatProposalDate(session.session_date)} at {session.time_slot}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-4 w-4" />
                        {session.tutor_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {session.location}
                      </span>
                    </div>
                  </div>

                  {/* View Session with popover */}
                  <button
                    onClick={handleViewSessionClick}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#a0704b] hover:bg-[#faf6f1] dark:hover:bg-[#2d2820] rounded-lg transition-colors"
                  >
                    <Eye className="h-4 w-4" />
                    View Session
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <AlertCircle className="h-5 w-5" />
                  Session details not available
                </div>
              )}
            </div>

            {/* Proposed By / Timeline */}
            <div className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400 border-b border-[#e8d4b8] dark:border-[#6b5a4a] flex items-center justify-between">
              <div>
                Proposed by{" "}
                <span className="font-medium text-gray-900 dark:text-white">
                  {proposal.proposed_by_tutor_name || `Tutor #${proposal.proposed_by_tutor_id}`}
                </span>
                {isProposer && " (You)"}
              </div>
              <div className="text-gray-400 dark:text-gray-500">
                {new Date(proposal.created_at).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            </div>

            {/* Notes */}
            {proposal.notes && (
              <div className="px-5 py-3 text-sm bg-amber-50/50 dark:bg-amber-900/10 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                <div className="flex items-start gap-2">
                  <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700 dark:text-gray-300">{proposal.notes}</p>
                </div>
              </div>
            )}

            {/* Content based on proposal type */}
            <div className="p-5">
              {proposal.proposal_type === "specific_slots" ? (
                // Show all slots
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Proposed Slots
                  </h4>
                  {proposal.slots
                    .sort((a, b) => a.slot_order - b.slot_order)
                    .map((slot, index) => (
                      <SlotItem
                        key={slot.id}
                        slot={slot}
                        slotIndex={index}
                        currentTutorId={currentTutorId}
                        isProposer={isProposer}
                        isAdmin={isAdmin}
                        proposalStatus={proposal.status}
                        slotSessions={slotSessions}
                        canEdit={canEdit}
                        isEditing={editingSlotId === slot.id}
                        tutors={tutors}
                        locations={locations}
                        onApprove={handleApproveSlot}
                        onReject={handleRejectSlot}
                        onStartEdit={setEditingSlotId}
                        onCancelEdit={() => setEditingSlotId(null)}
                        onSaveEdit={handleUpdateSlot}
                      />
                    ))}
                </div>
              ) : (
                // needs_input type
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-6 w-6 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-blue-900 dark:text-blue-100">
                          Input Requested
                        </p>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                          {isNeedsInputTarget
                            ? "You've been asked to select a make-up slot for this student. Please choose an available time."
                            : `Waiting for ${proposal.needs_input_tutor_name || "the main tutor"} to select a slot.`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {isNeedsInputTarget && proposal.status === "pending" && (
                    <div className="flex gap-3">
                      <button
                        onClick={onSelectSlot}
                        className="flex-1 flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium text-white bg-[#a0704b] hover:bg-[#8b5f3c] rounded-lg transition-colors shadow-sm"
                      >
                        <Calendar className="h-5 w-5" />
                        Select Make-up Slot
                      </button>
                      <button
                        onClick={() => setShowRejectConfirm(true)}
                        className="flex items-center gap-2 px-5 py-3 text-sm font-medium text-red-600 hover:text-white hover:bg-red-600 border border-red-300 dark:border-red-800 rounded-lg transition-colors"
                      >
                        <X className="h-5 w-5" />
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer actions */}
            {canCancel && (
              <div className="px-5 py-4 border-t border-[#e8d4b8] dark:border-[#6b5a4a] flex justify-end bg-gray-50/50 dark:bg-[#0d0d0d]">
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={loadingAction === "cancel"}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
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
          </>
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

      {/* Session Detail Popover */}
      {session && (
        <SessionDetailPopover
          session={session as Session}
          isOpen={showSessionPopover}
          onClose={() => setShowSessionPopover(false)}
          clickPosition={popoverClickPosition}
        />
      )}
    </>
  );
});
