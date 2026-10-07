"use client";

import React, { useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { getDaysUntil } from "@/lib/calendar-utils";
import { countdownChipClass, countdownLabel } from "@/lib/countdown";
import { TONES } from "@/lib/tones";
import { useEligibleStudentsByExam } from "@/lib/hooks";
import { RevisionSlotCard } from "./RevisionSlotCard";
import { EnrollStudentModal } from "./EnrollStudentModal";
import { EditRevisionSlotModal } from "./EditRevisionSlotModal";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { Button, IconButton, Select } from "@/components/controls";
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

// Canonical event type colors — moved to lib/exam-type-colors so leaf
// components (curriculum chips) can use them without importing this module;
// imported for the card's own styling and re-exported for the existing
// consumers.
import {
  EXAM_TYPE_COLORS,
  DEFAULT_TYPE_COLORS,
  getTypeColors,
} from "@/lib/exam-type-colors";

export { EXAM_TYPE_COLORS, DEFAULT_TYPE_COLORS, getTypeColors };

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
  // Derive locations from available revision slots (cross-location revision not allowed)
  const slotLocations = useMemo(() => {
    const locs = [...new Set(exam.revision_slots.map(s => s.location))];
    return locs.length > 0 ? locs : null;
  }, [exam.revision_slots]);

  // Use slot locations if slots exist, otherwise fall back to app location filter
  const eligibleLocations = slotLocations ?? (location ? [location] : null);

  const { data: eligibleStudents = [], isLoading: loadingEligible } = useEligibleStudentsByExam(
    showEligibleStudents ? exam.id : null,
    eligibleLocations
  );

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

  // The countdown and the two counts, shown beside the title on wider screens
  // and under it on a phone.
  const stats = (
    <>
      {isPast ? (
        <span className="text-xs font-medium text-ink-subtle">Past</span>
      ) : (
        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap", countdownChipClass(daysUntil))}>
          {countdownLabel(daysUntil)}
        </span>
      )}
      <span
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
          exam.revision_slots.length > 0
            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            : TONES.neutral.soft
        )}
        title="Revision slots"
      >
        <BookOpen className="h-3 w-3" aria-hidden="true" />
        {exam.revision_slots.length}
      </span>
      <span className={cn("flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium", TONES.neutral.soft)} title="Students enrolled">
        <Users className="h-3 w-3" aria-hidden="true" />
        {exam.total_enrolled}
      </span>
    </>
  );

  // Get event type badge color from canonical color map
  const typeBadgeColors = useMemo(() => {
    const colors = EXAM_TYPE_COLORS[exam.event_type || ""];
    return colors || DEFAULT_TYPE_COLORS;
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
      "bg-raised border-line",
      "paper-texture transition-all",
      highlighted && "ring-2 ring-primary ring-offset-2"
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
        className="w-full px-4 py-4 flex items-start gap-4 text-left hover:bg-paper/50 transition-colors cursor-pointer"
      >
        {/* Date indicator. Neutral, because how soon the exam is shows in the
            countdown chip, and red is kept for things that have gone wrong. */}
        <div className={cn(
          "flex-shrink-0 w-14 h-14 rounded-lg flex flex-col items-center justify-center bg-tint",
          isPast && "opacity-60"
        )}>
          <span className="text-xs font-medium text-ink-subtle">
            {examDate.toLocaleDateString("en-US", { month: "short" })}
          </span>
          <span className="text-xl font-bold leading-none text-gray-900 dark:text-gray-100">
            {examDate.getDate()}
          </span>
          <span className="text-[11px] font-medium text-ink-subtle">
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
                    typeBadgeColors.bg, typeBadgeColors.text
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
              <div className="flex sm:hidden flex-wrap items-center gap-2 mt-2">{stats}</div>
            </div>

            {/* Stats and expand indicator. On a phone the countdown and counts
                move under the title, so the title has room. */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="hidden sm:flex items-center gap-3">{stats}</div>

              {/* Edit event button */}
              {canManageEvents && onEditEvent && (
                <IconButton
                  icon={Pencil}
                  size="sm"
                  label="Edit event"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditEvent(exam);
                  }}
                />
              )}

              {/* Expand indicator */}
              {isExpanded ? (
                <ChevronUp className="h-5 w-5 text-gray-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-500" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-line">
          {/* Description if available */}
          {exam.description && (
            <div className="px-4 py-3 bg-paper/50 border-b border-line">
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
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateSlot();
                }}
                disabled={readOnly}
                title={readOnly ? "Read-only access" : undefined}
              >
                Create slot
              </Button>
            </div>

            {/* Slots */}
            {exam.revision_slots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <BookOpen className="h-10 w-10 text-gray-300 dark:text-gray-400 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No revision slots created yet
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Click &quot;Create slot&quot; to schedule a revision session
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
                  <ChevronUp className="h-4 w-4 text-amber-700" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-amber-700" />
                )}
              </button>

              {/* Expanded eligible students list */}
              {showEligibleStudents && (
                <div className="border-t border-amber-200 dark:border-amber-800 p-3">
                  {loadingEligible ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-amber-700" />
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
                          <Select
                            size="sm"
                            value={tutorFilter}
                            onChange={(e) => setTutorFilter(e.target.value)}
                            aria-label="Filter by tutor"
                            className="w-auto"
                          >
                            <option value="">All tutors ({eligibleStudents.length})</option>
                            {uniqueTutors.map((tutor) => (
                              <option key={tutor} value={tutor}>{tutor}</option>
                            ))}
                          </Select>
                          {tutorFilter && (
                            <span className="text-xs text-amber-700 dark:text-amber-400">
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
                            className="px-3 py-2 rounded-lg bg-raised border border-amber-200/50 dark:border-amber-800/50"
                          >
                            <StudentInfoBadges
                              student={student}
                              showLink
                              showLocationPrefix={!location}
                              trailing={
                                <span className="text-[11px] text-amber-700 dark:text-amber-400 ml-auto flex items-center gap-1.5">
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
