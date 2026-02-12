"use client";

import React, { useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { getDaysUntil } from "@/lib/calendar-utils";
import { useEligibleStudents, useEligibleStudentsByExam } from "@/lib/hooks";
import { RevisionSlotCard } from "./RevisionSlotCard";
import { EnrollStudentModal } from "./EnrollStudentModal";
import { EditRevisionSlotModal } from "./EditRevisionSlotModal";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import type { ExamWithRevisionSlots, ExamRevisionSlot, SlotDefaults } from "@/types";
import {
  ChevronDown,
  ChevronUp,
  School,
  GraduationCap,
  Users,
  Plus,
  BookOpen,
  Loader2,
  Pencil,
} from "lucide-react";

interface ExamCardProps {
  exam: ExamWithRevisionSlots;
  currentTutorId: number;
  location: string | null;
  onCreateSlot: (defaults?: SlotDefaults) => void;
  onRefresh: () => void;
  onEditEvent?: (exam: ExamWithRevisionSlots) => void;
  canManageEvents?: boolean;
  highlighted?: boolean;
  defaultExpanded?: boolean;
  readOnly?: boolean;
}

export const ExamCard = React.memo(function ExamCard({ exam, currentTutorId, location, onCreateSlot, onRefresh, onEditEvent, canManageEvents, highlighted, defaultExpanded, readOnly }: ExamCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded ?? false);
  const [selectedSlot, setSelectedSlot] = useState<ExamRevisionSlot | null>(null);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showEligibleStudents, setShowEligibleStudents] = useState(false);
  const [editingSlot, setEditingSlot] = useState<ExamRevisionSlot | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [tutorFilter, setTutorFilter] = useState<string>("");

  // Fetch eligible students when expanded
  // Use slot-based hook when slots exist, otherwise use exam-based hook
  const firstSlotId = exam.revision_slots.length > 0 ? exam.revision_slots[0].id : null;
  const { data: eligibleBySlot = [], isLoading: loadingBySlot } = useEligibleStudents(
    showEligibleStudents && firstSlotId ? firstSlotId : null
  );
  const { data: eligibleByExam = [], isLoading: loadingByExam } = useEligibleStudentsByExam(
    showEligibleStudents && !firstSlotId ? exam.id : null,
    location
  );

  // Use slot-based data when slots exist, otherwise use exam-based data
  const eligibleStudents = firstSlotId ? eligibleBySlot : eligibleByExam;
  const loadingEligible = firstSlotId ? loadingBySlot : loadingByExam;

  // Extract unique tutors from eligible students for filtering
  const uniqueTutors = useMemo(() => {
    const tutors = new Set<string>();
    eligibleStudents.forEach(s => {
      if (s.enrollment_tutor_name) tutors.add(s.enrollment_tutor_name);
    });
    return Array.from(tutors).sort();
  }, [eligibleStudents]);

  // Filter students by selected tutor
  const filteredEligible = useMemo(() => {
    if (!tutorFilter) return eligibleStudents;
    return eligibleStudents.filter(s => s.enrollment_tutor_name === tutorFilter);
  }, [eligibleStudents, tutorFilter]);

  const examDate = new Date(exam.start_date);
  const daysUntil = getDaysUntil(exam.start_date);
  const isPast = daysUntil < 0;

  // Get event type badge color
  const getEventTypeBadge = useCallback(() => {
    const type = exam.event_type?.toLowerCase() || "";
    if (type.includes("final") || type.includes("exam")) {
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    }
    if (type.includes("mid") || type.includes("mock")) {
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    }
    if (type.includes("test") || type.includes("quiz")) {
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    }
    return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
  }, [exam.event_type]);

  // Handle enrollment in a slot
  const handleEnrollInSlot = useCallback((slot: ExamRevisionSlot) => {
    setSelectedSlot(slot);
    setShowEnrollModal(true);
  }, []);

  // Handle editing a slot
  const handleEditSlot = useCallback((slot: ExamRevisionSlot) => {
    setEditingSlot(slot);
    setShowEditModal(true);
  }, []);

  // Handle duplicating a slot (opens create modal with pre-filled defaults)
  const handleDuplicateSlot = useCallback((slot: ExamRevisionSlot) => {
    onCreateSlot({
      tutor_id: slot.tutor_id,
      location: slot.location,
      notes: slot.notes || undefined,
    });
  }, [onCreateSlot]);

  // Handle edit modal close
  const handleEditModalClose = useCallback(() => {
    setShowEditModal(false);
    setEditingSlot(null);
  }, []);

  // Handle edit success
  const handleEditSuccess = useCallback(() => {
    setShowEditModal(false);
    setEditingSlot(null);
    onRefresh();
  }, [onRefresh]);

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden",
      "bg-white dark:bg-[#1a1a1a] border-[#e8d4b8] dark:border-[#6b5a4a]",
      "paper-texture transition-all",
      highlighted && "ring-2 ring-[#a0704b] ring-offset-2"
    )}>
      {/* Header - Always visible */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        className="w-full px-4 py-4 flex items-start gap-4 text-left hover:bg-[#faf6f1]/50 dark:hover:bg-[#2d2820]/50 transition-colors cursor-pointer"
      >
        {/* Date indicator */}
        <div className={cn(
          "flex-shrink-0 w-14 h-14 rounded-lg flex flex-col items-center justify-center",
          isPast
            ? "bg-gray-100 dark:bg-gray-800"
            : daysUntil <= 7
            ? "bg-red-50 dark:bg-red-900/20"
            : "bg-amber-50 dark:bg-amber-900/20"
        )}>
          <span className={cn(
            "text-xs font-medium",
            isPast
              ? "text-gray-500"
              : daysUntil <= 7
              ? "text-red-600 dark:text-red-400"
              : "text-amber-600 dark:text-amber-400"
          )}>
            {examDate.toLocaleDateString("en-US", { month: "short" })}
          </span>
          <span className={cn(
            "text-xl font-bold leading-none",
            isPast
              ? "text-gray-600"
              : daysUntil <= 7
              ? "text-red-700 dark:text-red-300"
              : "text-amber-700 dark:text-amber-300"
          )}>
            {examDate.getDate()}
          </span>
          <span className={cn(
            "text-[10px] font-medium",
            isPast
              ? "text-gray-500"
              : daysUntil <= 7
              ? "text-red-600 dark:text-red-400"
              : "text-amber-600 dark:text-amber-400"
          )}>
            {examDate.getFullYear()}
          </span>
        </div>

        {/* Exam info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                {exam.title}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {exam.event_type && (
                  <span className={cn(
                    "inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full",
                    getEventTypeBadge()
                  )}>
                    {exam.event_type}
                  </span>
                )}
                {exam.school && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <School className="h-3 w-3" />
                    {exam.school}
                  </span>
                )}
                {exam.grade && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <GraduationCap className="h-3 w-3" />
                    {exam.grade}
                  </span>
                )}
                {exam.academic_stream && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({exam.academic_stream})
                  </span>
                )}
              </div>
            </div>

            {/* Stats and expand indicator */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {/* Days until */}
              <div className="text-right hidden sm:block">
                <span className={cn(
                  "text-sm font-medium",
                  isPast
                    ? "text-gray-500"
                    : daysUntil <= 7
                    ? "text-red-600 dark:text-red-400"
                    : "text-gray-600 dark:text-gray-400"
                )}>
                  {isPast
                    ? "Past"
                    : daysUntil === 0
                    ? "Today"
                    : daysUntil === 1
                    ? "Tomorrow"
                    : `${daysUntil} days`}
                </span>
              </div>

              {/* Revision slots count */}
              <div className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                exam.revision_slots.length > 0
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              )}>
                <BookOpen className="h-3 w-3" />
                {exam.revision_slots.length}
              </div>

              {/* Enrolled count */}
              <div className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              )}>
                <Users className="h-3 w-3" />
                {exam.total_enrolled}
              </div>

              {/* Edit event button */}
              {canManageEvents && onEditEvent && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditEvent(exam);
                  }}
                  className="p-1.5 rounded-md hover:bg-[#d4a574]/30 transition-colors"
                  title="Edit event"
                >
                  <Pencil className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                </button>
              )}

              {/* Expand indicator */}
              {isExpanded ? (
                <ChevronUp className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-400" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
          {/* Description if available */}
          {exam.description && (
            <div className="px-4 py-3 bg-[#faf6f1]/50 dark:bg-[#2d2820]/50 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
              <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">{exam.description}</p>
            </div>
          )}

          {/* Revision slots list */}
          <div className="p-4 space-y-3">
            {/* Header with create button */}
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Revision Slots ({exam.revision_slots.length})
              </h4>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateSlot();
                }}
                disabled={readOnly}
                title={readOnly ? "Read-only access" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                  "bg-[#a0704b] hover:bg-[#8a5f3e] text-white",
                  "focus-visible:ring-2 focus-visible:ring-[#a0704b] focus-visible:ring-offset-1",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                <Plus className="h-4 w-4" />
                Create Slot
              </button>
            </div>

            {/* Slots */}
            {exam.revision_slots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <BookOpen className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No revision slots created yet
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Click &quot;Create Slot&quot; to schedule a revision session
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {exam.revision_slots.map((slot) => (
                  <RevisionSlotCard
                    key={slot.id}
                    slot={slot}
                    onEnroll={() => handleEnrollInSlot(slot)}
                    onEdit={() => handleEditSlot(slot)}
                    onDuplicate={() => handleDuplicateSlot(slot)}
                    onRefresh={onRefresh}
                    showLocationPrefix={!location}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            )}

            {/* Eligible students section - always show, count is lazy-loaded */}
            <div className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 overflow-hidden">
              <button
                onClick={() => setShowEligibleStudents(!showEligibleStudents)}
                className="w-full p-3 flex items-center justify-between text-left hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors"
              >
                <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                  <Users className="h-4 w-4" />
                  <span>
                    {showEligibleStudents
                      ? loadingEligible
                        ? "Loading eligible students..."
                        : `${eligibleStudents.length} eligible student${eligibleStudents.length !== 1 ? "s" : ""} not yet enrolled`
                      : `Eligible students (${exam.eligible_count})`}
                    {!location && showEligibleStudents && !loadingEligible && " (all locations)"}
                  </span>
                </div>
                {showEligibleStudents ? (
                  <ChevronUp className="h-4 w-4 text-amber-500" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-amber-500" />
                )}
              </button>

              {/* Expanded eligible students list */}
              {showEligibleStudents && (
                <div className="border-t border-amber-200 dark:border-amber-800 p-3">
                  {loadingEligible ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
                    </div>
                  ) : eligibleStudents.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-2">
                      No eligible students found. Students need pending make-ups to be eligible.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {/* Tutor filter */}
                      {uniqueTutors.length > 1 && (
                        <div className="flex items-center gap-2 mb-2">
                          <select
                            value={tutorFilter}
                            onChange={(e) => setTutorFilter(e.target.value)}
                            className="text-xs px-2 py-1 border border-amber-200 dark:border-amber-700 rounded bg-white dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-300"
                          >
                            <option value="">All Tutors ({eligibleStudents.length})</option>
                            {uniqueTutors.map((tutor) => (
                              <option key={tutor} value={tutor}>{tutor}</option>
                            ))}
                          </select>
                          {tutorFilter && (
                            <span className="text-xs text-amber-600 dark:text-amber-400">
                              {filteredEligible.length} student{filteredEligible.length !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      )}
                      {filteredEligible.map((student) => {
                        const primaryTutor = student.enrollment_tutor_name;
                        return (
                          <div
                            key={student.student_id}
                            className="px-3 py-2 rounded-lg bg-white dark:bg-[#1a1a1a] border border-amber-200/50 dark:border-amber-800/50"
                          >
                            <StudentInfoBadges
                              student={student}
                              showLink
                              showLocationPrefix={!location}
                              trailing={
                                <span className="text-[10px] text-amber-600 dark:text-amber-400 ml-auto flex items-center gap-1.5">
                                  {primaryTutor && <span className="text-gray-500 dark:text-gray-400">{primaryTutor}</span>}
                                  <span>• {student.pending_sessions.length} session{student.pending_sessions.length !== 1 ? "s" : ""}</span>
                                </span>
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Enroll Student Modal */}
      {selectedSlot && (
        <EnrollStudentModal
          slot={selectedSlot}
          isOpen={showEnrollModal}
          onClose={() => {
            setShowEnrollModal(false);
            setSelectedSlot(null);
          }}
          onEnrolled={() => {
            onRefresh();
            setShowEnrollModal(false);
            setSelectedSlot(null);
          }}
          showLocationPrefix={!location}
        />
      )}

      {/* Edit Revision Slot Modal */}
      {editingSlot && (
        <EditRevisionSlotModal
          slot={editingSlot}
          isOpen={showEditModal}
          onClose={handleEditModalClose}
          onUpdated={handleEditSuccess}
          currentTutorId={currentTutorId}
          readOnly={readOnly}
        />
      )}
    </div>
  );
});
