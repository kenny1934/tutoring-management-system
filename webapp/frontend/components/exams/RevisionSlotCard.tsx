"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { useRevisionSlotDetail, useSession } from "@/lib/hooks";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { examRevisionAPI } from "@/lib/api";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
import { SessionStatusTag } from "@/components/ui/session-status-tag";
import type { ExamRevisionSlot } from "@/types";
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRemovingId, setIsRemovingId] = useState<number | null>(null);

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

  const handleStudentClick = (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    setClickPosition({ x: e.clientX, y: e.clientY });
    setSelectedSessionId(sessionId);
  };

  const handleDelete = async () => {
    const hasStudents = slot.enrolled_count > 0;
    const message = hasStudents
      ? `This slot has ${slot.enrolled_count} enrolled student(s). Deleting will unenroll them and revert their sessions. Continue?`
      : "Are you sure you want to delete this revision slot?";

    if (!confirm(message)) return;

    setIsDeleting(true);
    try {
      await examRevisionAPI.deleteSlot(slot.id, hasStudents);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete slot");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRemoveEnrollment = async (sessionId: number) => {
    if (!confirm("Remove this student from the revision slot?")) return;

    setIsRemovingId(sessionId);
    try {
      await examRevisionAPI.removeEnrollment(slot.id, sessionId);
      mutate();
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove enrollment");
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
            slot.enrolled_count > 0
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
          )}>
            <Users className="h-3 w-3" />
            {slot.enrolled_count}
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
              "bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900/30 dark:hover:bg-green-900/50 dark:text-green-400"
            )}
          >
            <UserPlus className="h-3 w-3" />
            Enroll
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors"
            title="Edit slot"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDuplicate}
            className="p-1.5 text-gray-400 hover:text-purple-500 transition-colors"
            title="Duplicate slot"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className={cn(
              "p-1.5 text-gray-400 hover:text-red-500 transition-colors",
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
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
              No students enrolled yet. Click &quot;Enroll&quot; above to add students.
            </p>
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
                        handleRemoveEnrollment(student.session_id);
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
    </div>
  );
});
