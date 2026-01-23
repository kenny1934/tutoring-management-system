"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { useRevisionSlotDetail, useSession } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { examRevisionAPI } from "@/lib/api";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { SessionStatusTag } from "@/components/ui/session-status-tag";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ExamRevisionSlot, EnrolledStudentInfo } from "@/types";
import {
  Calendar,
  Clock,
  MapPin,
  User,
  Users,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Trash2,
  Loader2,
  Pencil,
  Copy,
} from "lucide-react";

interface RevisionSlotCardProps {
  slot: ExamRevisionSlot;
  onEnroll: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRefresh: () => void;
  showLocationPrefix?: boolean;
}

export const RevisionSlotCard = React.memo(function RevisionSlotCard({ slot, onEnroll, onEdit, onDuplicate, onRefresh, showLocationPrefix }: RevisionSlotCardProps) {
  const { showToast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRemovingId, setIsRemovingId] = useState<number | null>(null);

  // Confirmation dialog states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [studentToRemove, setStudentToRemove] = useState<EnrolledStudentInfo | null>(null);

  // Session detail popover state
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | null>(null);

  // Use SWR hook for caching - only fetches when selectedSessionId is set
  const { data: fetchedSession, isLoading: isLoadingSession } = useSession(selectedSessionId);

  // Fetch detailed slot info when expanded
  const { data: slotDetail, isLoading: loadingDetail, mutate } = useRevisionSlotDetail(
    isExpanded ? slot.id : null
  );

  const slotDate = new Date(slot.session_date);

  // Prefer detail data when available for freshness
  const enrolledCount = slotDetail ? slotDetail.enrolled_students.length : slot.enrolled_count;

  const handleStudentClick = (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    setClickPosition({ x: e.clientX, y: e.clientY });
    setSelectedSessionId(sessionId);
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    const hasStudents = slot.enrolled_count > 0;
    setIsDeleting(true);
    try {
      await examRevisionAPI.deleteSlot(slot.id, hasStudents);
      setShowDeleteConfirm(false);
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete slot", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRemoveClick = (student: EnrolledStudentInfo) => {
    setStudentToRemove(student);
  };

  const handleRemoveConfirm = async () => {
    if (!studentToRemove) return;

    setIsRemovingId(studentToRemove.session_id);
    try {
      await examRevisionAPI.removeEnrollment(slot.id, studentToRemove.session_id);
      setStudentToRemove(null);
      mutate();
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to remove enrollment", "error");
    } finally {
      setIsRemovingId(null);
    }
  };

  return (
    <div className={cn(
      "rounded-lg border",
      "bg-[#faf6f1]/30 dark:bg-[#2d2820]/30 border-[#e8d4b8] dark:border-[#6b5a4a]"
    )}>
      {/* Slot header */}
      <div className="px-4 py-3 flex items-center gap-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-1 flex items-center gap-3 text-left"
        >
          {/* Date/time info */}
          <div className="flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
              <Calendar className="h-4 w-4 text-gray-400" />
              {slotDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </span>
            <span className="inline-flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
              <Clock className="h-4 w-4 text-gray-400" />
              {slot.time_slot}
            </span>
            <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
              <User className="h-4 w-4 text-gray-400" />
              {slot.tutor_name || "Unknown"}
            </span>
            <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
              <MapPin className="h-4 w-4 text-gray-400" />
              {slot.location}
            </span>
          </div>

          {/* Enrolled count */}
          <div className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
            enrolledCount > 0
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
          )}>
            <Users className="h-3 w-3" />
            {enrolledCount}
          </div>

          {/* Expand indicator */}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </button>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={onEnroll}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors",
              "bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900/30 dark:hover:bg-green-900/50 dark:text-green-400",
              "focus-visible:ring-2 focus-visible:ring-[#a0704b] focus-visible:ring-offset-1"
            )}
          >
            <UserPlus className="h-3 w-3" />
            Enroll
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus-visible:ring-2 focus-visible:ring-[#a0704b] focus-visible:ring-offset-1"
            title="Edit slot"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDuplicate}
            className="p-1.5 rounded-md text-gray-400 hover:text-purple-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus-visible:ring-2 focus-visible:ring-[#a0704b] focus-visible:ring-offset-1"
            title="Duplicate slot"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleDeleteClick}
            disabled={isDeleting}
            className={cn(
              "p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",
              "focus-visible:ring-2 focus-visible:ring-[#a0704b] focus-visible:ring-offset-1",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
            title={slot.enrolled_count > 0 ? "Delete (will unenroll students)" : "Delete slot"}
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded content - enrolled students */}
      {isExpanded && (
        <div className="border-t border-[#e8d4b8] dark:border-[#6b5a4a] px-4 py-3">
          {loadingDetail ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-[#a0704b]" />
            </div>
          ) : slotDetail?.enrolled_students.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Users className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No students enrolled yet
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Click &quot;Enroll&quot; to add students to this revision slot
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                Enrolled Students
              </h5>
              {slotDetail?.enrolled_students.map((student) => (
                <div
                  key={student.session_id}
                  onClick={(e) => handleStudentClick(e, student.session_id)}
                  className={cn(
                    "flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer transition-colors",
                    "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50",
                    "hover:bg-[#f5ede3]/60 dark:hover:bg-[#3d3628]/60",
                    selectedSessionId === student.session_id && isLoadingSession && "opacity-70"
                  )}
                >
                  <div className="min-w-0">
                    <StudentInfoBadges student={student} showLocationPrefix={showLocationPrefix} />
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {selectedSessionId === student.session_id && isLoadingSession ? (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    ) : (
                      <SessionStatusTag status={student.session_status} size="sm" iconOnly />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveClick(student);
                      }}
                      disabled={isRemovingId === student.session_id}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                      title="Remove enrollment"
                    >
                      {isRemovingId === student.session_id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          {slot.notes && (
            <div className="mt-3 pt-3 border-t border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium">Notes:</span> {slot.notes}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Session Detail Popover */}
      <SessionDetailPopover
        session={fetchedSession ?? null}
        isOpen={!!selectedSessionId && !!clickPosition}
        isLoading={isLoadingSession}
        onClose={() => {
          setSelectedSessionId(null);
          setClickPosition(null);
        }}
        clickPosition={clickPosition}
      />

      {/* Delete Slot Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        title="Delete Revision Slot"
        message={
          slot.enrolled_count > 0
            ? `This will affect ${slot.enrolled_count} enrolled student(s):`
            : "Are you sure you want to delete this revision slot?"
        }
        consequences={
          slot.enrolled_count > 0
            ? [
                "Their revision sessions will be cancelled",
                "Their original sessions will revert to Pending Make-up",
              ]
            : undefined
        }
        confirmText="Delete Slot"
        variant="danger"
        loading={isDeleting}
      />

      {/* Remove Enrollment Confirmation */}
      <ConfirmDialog
        isOpen={!!studentToRemove}
        onConfirm={handleRemoveConfirm}
        onCancel={() => setStudentToRemove(null)}
        title="Remove Student from Revision"
        message={`This will reverse the enrollment for ${studentToRemove?.student_name || "this student"}:`}
        consequences={[
          "The revision session will be cancelled",
          "The original session will revert to Pending Make-up status",
          "They will need to be re-enrolled or rescheduled separately",
        ]}
        confirmText="Remove Student"
        variant="danger"
        loading={isRemovingId === studentToRemove?.session_id}
      />
    </div>
  );
});
