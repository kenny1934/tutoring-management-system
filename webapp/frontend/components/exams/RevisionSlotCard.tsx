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
import { TutorLink } from "@/components/tutors/TutorLink";
import { Button, IconButton } from "@/components/controls";
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
  readOnly?: boolean;
}

export const RevisionSlotCard = React.memo(function RevisionSlotCard({ slot, onEnroll, onEdit, onDuplicate, onRefresh, showLocationPrefix, readOnly }: RevisionSlotCardProps) {
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

  const slotDate = new Date(slot.session_date + 'T00:00:00');

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
      "bg-paper/30 border-line"
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
              <Calendar className="h-4 w-4 text-gray-500" />
              {slotDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </span>
            <span className="inline-flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
              <Clock className="h-4 w-4 text-gray-500" />
              {slot.time_slot}
            </span>
            <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
              <User className="h-4 w-4 text-gray-500" />
              <TutorLink tutorId={slot.tutor_id} tutorName={slot.tutor_name} fallback="Unknown" />
            </span>
            <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
              <MapPin className="h-4 w-4 text-gray-500" />
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
            <ChevronUp className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          )}
        </button>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            icon={UserPlus}
            iconClassName="text-green-600 dark:text-green-400"
            onClick={onEnroll}
            disabled={readOnly}
            title={readOnly ? "Read-only access" : undefined}
          >
            Enroll
          </Button>
          <IconButton
            icon={Pencil}
            size="sm"
            label="Edit slot"
            onClick={onEdit}
            disabled={readOnly}
            title={readOnly ? "Read-only access" : "Edit slot"}
          />
          <IconButton
            icon={Copy}
            size="sm"
            label="Duplicate slot"
            onClick={onDuplicate}
            disabled={readOnly}
            title={readOnly ? "Read-only access" : "Duplicate slot"}
          />
          <IconButton
            icon={isDeleting ? Loader2 : Trash2}
            iconClassName={isDeleting ? "animate-spin" : undefined}
            size="sm"
            tone="danger"
            label="Delete slot"
            onClick={handleDeleteClick}
            disabled={readOnly || isDeleting}
            title={readOnly ? "Read-only access" : slot.enrolled_count > 0 ? "Delete (will unenroll students)" : "Delete slot"}
          />
        </div>
      </div>

      {/* Expanded content - enrolled students */}
      {isExpanded && (
        <div className="border-t border-line px-4 py-3">
          {loadingDetail ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-accent-ink" />
            </div>
          ) : slotDetail?.enrolled_students.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Users className="h-8 w-8 text-gray-300 dark:text-gray-400 mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No students enrolled yet
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
                    "bg-raised border border-line/50",
                    "hover:bg-tint/60",
                    selectedSessionId === student.session_id && isLoadingSession && "opacity-70"
                  )}
                >
                  <div className="min-w-0">
                    <StudentInfoBadges student={student} showLocationPrefix={showLocationPrefix} />
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {selectedSessionId === student.session_id && isLoadingSession ? (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                    ) : (
                      <SessionStatusTag status={student.session_status} size="sm" iconOnly />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveClick(student);
                      }}
                      disabled={readOnly || isRemovingId === student.session_id}
                      className="p-1 text-gray-500 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={readOnly ? "Read-only access" : "Remove enrollment"}
                      aria-label={`Remove ${student.student_name} from this slot`}
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
            <div className="mt-3 pt-3 border-t border-line/50">
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
