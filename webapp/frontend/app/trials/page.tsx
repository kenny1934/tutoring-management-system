"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { ClipboardList, Plus, Calendar, User, MapPin, CreditCard, ArrowRight, Loader2, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import useSWR from "swr";
import { enrollmentsAPI, TrialListItem } from "@/lib/api";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { CreateEnrollmentModal } from "@/components/enrollments/CreateEnrollmentModal";
import { EnrollmentDetailModal } from "@/components/enrollments/EnrollmentDetailModal";

// Column configuration
const COLUMNS = [
  { id: 'scheduled', label: 'Scheduled', color: 'blue', description: 'Upcoming trial sessions' },
  { id: 'pending', label: 'Attended', color: 'amber', description: 'Awaiting conversion decision' },
  { id: 'converted', label: 'Converted', color: 'green', description: 'Enrolled in regular course' },
] as const;

type ColumnId = typeof COLUMNS[number]['id'];

// Trial Card Component
function TrialCard({
  trial,
  onConvert,
  onViewDetails,
}: {
  trial: TrialListItem;
  onConvert: (trial: TrialListItem) => void;
  onViewDetails: (trial: TrialListItem) => void;
}) {
  const sessionDate = new Date(trial.session_date);
  const isToday = new Date().toDateString() === sessionDate.toDateString();
  const isPast = sessionDate < new Date() && !isToday;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg border-2 p-3",
        "border-[#d4a574] dark:border-[#8b6f47]",
        "paper-texture shadow-sm",
        "hover:shadow-md transition-shadow cursor-pointer",
        "group"
      )}
      onClick={() => onViewDetails(trial)}
    >
      {/* Student Name & Badges */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground truncate">
            {trial.student_name}
          </h3>
          <StudentInfoBadges
            student={{
              student_id: trial.student_id,
              student_name: trial.student_name,
              school_student_id: trial.school_student_id,
              grade: trial.grade,
              school: trial.school,
            }}
          />
        </div>
        {/* Payment Status Badge */}
        <span className={cn(
          "px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0",
          trial.payment_status === "Paid"
            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
            : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
        )}>
          {trial.payment_status === "Paid" ? "Paid" : "Pending"}
        </span>
      </div>

      {/* Session Info */}
      <div className="space-y-1 text-sm text-foreground/70">
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
          <span className={cn(
            isToday && "text-blue-600 dark:text-blue-400 font-medium",
            isPast && trial.trial_status === 'scheduled' && "text-red-600 dark:text-red-400"
          )}>
            {sessionDate.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric'
            })}
            {isToday && " (Today)"}
          </span>
          <span className="text-foreground/50">•</span>
          <span>{trial.time_slot}</span>
        </div>
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{trial.tutor_name}</span>
          <span className="text-foreground/50">•</span>
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{trial.location}</span>
        </div>
      </div>

      {/* Actions - Show on hover for attended trials */}
      {trial.trial_status === 'pending' && (
        <div className="mt-3 pt-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onConvert(trial);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 w-full justify-center bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-sm font-medium transition-colors"
          >
            <ArrowRight className="h-4 w-4" />
            Convert to Regular
          </button>
        </div>
      )}

      {/* Converted info */}
      {trial.trial_status === 'converted' && trial.subsequent_enrollment_id && (
        <div className="mt-2 pt-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a]">
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <RefreshCcw className="h-3 w-3" />
            Enrolled in regular course
          </span>
        </div>
      )}
    </motion.div>
  );
}

// Kanban Column Component
function KanbanColumn({
  column,
  trials,
  onConvert,
  onViewDetails,
}: {
  column: typeof COLUMNS[number];
  trials: TrialListItem[];
  onConvert: (trial: TrialListItem) => void;
  onViewDetails: (trial: TrialListItem) => void;
}) {
  const colorClasses = {
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
  };

  return (
    <div className="flex-1 min-w-[280px] max-w-[400px]">
      {/* Column Header */}
      <div className={cn(
        "px-3 py-2 rounded-t-lg border-b-2",
        colorClasses[column.color]
      )}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{column.label}</h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/50 dark:bg-black/20">
            {trials.length}
          </span>
        </div>
        <p className="text-xs opacity-75 mt-0.5">{column.description}</p>
      </div>

      {/* Column Content */}
      <div className={cn(
        "p-2 rounded-b-lg min-h-[200px] max-h-[calc(100vh-280px)] overflow-y-auto",
        "bg-gray-50/50 dark:bg-gray-900/20 border border-t-0",
        "border-gray-200 dark:border-gray-700"
      )}>
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {trials.map((trial) => (
              <TrialCard
                key={trial.enrollment_id}
                trial={trial}
                onConvert={onConvert}
                onViewDetails={onViewDetails}
              />
            ))}
          </AnimatePresence>
          {trials.length === 0 && (
            <div className="text-center py-8 text-foreground/40 text-sm">
              No trials
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TrialsPage() {
  const { user, isAdmin, effectiveRole, isImpersonating, impersonatedTutor } = useAuth();
  const { selectedLocation } = useLocation();

  // Get effective tutor ID for filtering (tutors see only their trials)
  const currentTutorId = (isImpersonating && effectiveRole === 'Tutor' && impersonatedTutor?.id)
    ? impersonatedTutor.id
    : user?.id;

  const isTutorView = effectiveRole === 'Tutor';

  // Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(null);
  const [convertFromTrial, setConvertFromTrial] = useState<TrialListItem | null>(null);

  // Fetch trials
  const { data: trials, isLoading, mutate } = useSWR(
    ['trials', selectedLocation, isTutorView ? currentTutorId : null],
    () => enrollmentsAPI.getTrials({
      location: selectedLocation !== "All Locations" ? selectedLocation : undefined,
      tutor_id: isTutorView ? currentTutorId : undefined,
    }),
    { revalidateOnFocus: false }
  );

  // Group trials by status for Kanban columns
  const groupedTrials = useMemo(() => {
    if (!trials) return { scheduled: [], pending: [], converted: [] };

    const groups: Record<ColumnId, TrialListItem[]> = {
      scheduled: [],
      pending: [],
      converted: [],
    };

    for (const trial of trials) {
      if (trial.trial_status === 'converted') {
        groups.converted.push(trial);
      } else if (trial.trial_status === 'pending' || trial.trial_status === 'attended') {
        groups.pending.push(trial);
      } else if (trial.trial_status === 'no_show') {
        // No-shows go to pending for follow-up
        groups.pending.push(trial);
      } else {
        groups.scheduled.push(trial);
      }
    }

    return groups;
  }, [trials]);

  const handleViewDetails = (trial: TrialListItem) => {
    setSelectedEnrollmentId(trial.enrollment_id);
    setDetailModalOpen(true);
  };

  const handleConvert = (trial: TrialListItem) => {
    setConvertFromTrial(trial);
    setCreateModalOpen(true);
  };

  const handleNewTrial = () => {
    setConvertFromTrial(null);
    setCreateModalOpen(true);
  };

  const handleCreateSuccess = () => {
    mutate();
    setCreateModalOpen(false);
    setConvertFromTrial(null);
  };

  return (
    <DeskSurface>
      <PageTransition className="min-h-full p-4 sm:p-6">
        <div className="bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm p-4 sm:p-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg">
                  <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                    Trials
                  </h1>
                  <p className="text-sm text-foreground/60">
                    {isTutorView ? "Your trial sessions" : "Manage trial enrollments"}
                  </p>
                </div>
              </div>

              <button
                onClick={handleNewTrial}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors"
              >
                <Plus className="h-4 w-4" />
                New Trial
              </button>
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-foreground/40" />
            </div>
          )}

          {/* Kanban Board */}
          {!isLoading && (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {COLUMNS.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  trials={groupedTrials[column.id]}
                  onConvert={handleConvert}
                  onViewDetails={handleViewDetails}
                />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && trials?.length === 0 && (
            <div className="text-center py-12">
              <ClipboardList className="h-12 w-12 mx-auto text-foreground/20 mb-4" />
              <h3 className="text-lg font-medium text-foreground/60 mb-2">
                No trials yet
              </h3>
              <p className="text-sm text-foreground/40 mb-4">
                Create a trial enrollment to get started
              </p>
              <button
                onClick={handleNewTrial}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors"
              >
                <Plus className="h-4 w-4" />
                New Trial
              </button>
            </div>
          )}
        </div>

        {/* Create Enrollment Modal */}
        <CreateEnrollmentModal
          isOpen={createModalOpen}
          onClose={() => {
            setCreateModalOpen(false);
            setConvertFromTrial(null);
          }}
          onSuccess={handleCreateSuccess}
          trialMode={!convertFromTrial}
          // When converting, pre-fill student info
          convertFromTrial={convertFromTrial || undefined}
        />

        {/* Enrollment Detail Modal */}
        {selectedEnrollmentId && (
          <EnrollmentDetailModal
            isOpen={detailModalOpen}
            onClose={() => {
              setDetailModalOpen(false);
              setSelectedEnrollmentId(null);
            }}
            enrollmentId={selectedEnrollmentId}
          />
        )}
      </PageTransition>
    </DeskSurface>
  );
}
