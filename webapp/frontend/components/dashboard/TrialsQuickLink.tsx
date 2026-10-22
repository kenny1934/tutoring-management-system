"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { TutorLink } from "@/components/tutors/TutorLink";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import { QUICK_LINK, QUICK_LINK_BADGE, QUICK_LINK_CHEVRON } from "./quick-link-style";
import { formatDateCompact } from "@/lib/formatters";
import { useLocation } from "@/contexts/LocationContext";
import { useAuth } from "@/contexts/AuthContext";
import { enrollmentsAPI, TrialListItem } from "@/lib/api";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { Button, CountBadge } from "@/components/controls";
import { RecordContactModal } from "@/components/parent-contacts/RecordContactModal";
import { CreateEnrollmentModal } from "@/components/enrollments/CreateEnrollmentModal";
import { EnrollmentDetailModal } from "@/components/enrollments/EnrollmentDetailModal";
import { AnimatePresence } from "framer-motion";
import { TrialConversionWorkspace } from "@/components/trials/TrialConversionWorkspace";
import {
  FlaskConical,
  ChevronDown,
  ChevronRight,
  Calendar,
  User,
  MapPin,
  Loader2,
  Phone,
  ArrowRight,
  ExternalLink,
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
import { fitToScreen } from "@/hooks/usePopoverSheet";

interface TrialsQuickLinkProps {
  className?: string;
}

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;


// Compact trial card for scheduled trials - links to session detail
function ScheduledTrialCard({
  trial,
  onClose,
}: {
  trial: TrialListItem;
  onClose: () => void;
}) {
  const sessionDate = new Date(trial.session_date + 'T00:00:00');
  const isToday = new Date().toDateString() === sessionDate.toDateString();

  return (
    <Link
      href={`/sessions/${trial.session_id}`}
      onClick={onClose}
      className="block px-3 py-2.5 hover:bg-paper dark:hover:bg-paper transition-colors border-b border-line/50 last:border-b-0"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Student info */}
          <div className="mb-1">
            <StudentInfoBadges
              student={{
                student_id: trial.student_id,
                student_name: trial.student_name,
                school_student_id: trial.school_student_id,
                grade: trial.grade,
                lang_stream: trial.lang_stream,
                school: trial.school,
                home_location: trial.location,
              }}
            />
          </div>

          {/* Session details */}
          <div className="flex items-center gap-1.5 text-xs text-foreground/60">
            <Calendar className="h-3 w-3 flex-shrink-0" />
            <span
              className={cn(
                isToday && "text-blue-600 dark:text-blue-400 font-medium"
              )}
            >
              {formatDateCompact(trial.session_date)}
              {isToday && " (Today)"}
            </span>
            <span className="text-foreground/30">•</span>
            <span>{trial.time_slot}</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-foreground/60 mt-0.5">
            <User className="h-3 w-3 flex-shrink-0" />
            <TutorLink tutorId={trial.tutor_id} tutorName={trial.tutor_name} />
            <span className="text-foreground/30">•</span>
            <MapPin className="h-3 w-3 flex-shrink-0" />
            <span>{trial.location}</span>
          </div>
        </div>
        <ExternalLink className="h-3.5 w-3.5 text-foreground/40 flex-shrink-0 mt-0.5" />
      </div>
    </Link>
  );
}

// Compact trial card for awaiting conversion - with action buttons
function AwaitingTrialCard({
  trial,
  onRecordContact,
  onConvert,
  isAdmin,
}: {
  trial: TrialListItem;
  onRecordContact: (studentId: number) => void;
  onConvert: (trial: TrialListItem) => void;
  isAdmin: boolean;
}) {
  const sessionDate = new Date(trial.session_date + 'T00:00:00');
  const isToday = new Date().toDateString() === sessionDate.toDateString();
  const isPast = sessionDate < new Date() && !isToday;

  return (
    <div className="px-3 py-2.5 border-b border-line/50 last:border-b-0">
      {/* Student info */}
      <div className="mb-1">
        <StudentInfoBadges
          student={{
            student_id: trial.student_id,
            student_name: trial.student_name,
            school_student_id: trial.school_student_id,
            grade: trial.grade,
            lang_stream: trial.lang_stream,
            school: trial.school,
            home_location: trial.location,
          }}
        />
      </div>

      {/* Session details */}
      <div className="flex items-center gap-1.5 text-xs text-foreground/60">
        <Calendar className="h-3 w-3 flex-shrink-0" />
        <span
          className={cn(
            isToday && "text-blue-600 dark:text-blue-400 font-medium",
            isPast && "text-red-600 dark:text-red-400"
          )}
        >
          {formatDateCompact(trial.session_date)}
          {isToday && " (Today)"}
        </span>
        <span className="text-foreground/30">•</span>
        <span>{trial.time_slot}</span>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-foreground/60 mt-0.5">
        <User className="h-3 w-3 flex-shrink-0" />
        <TutorLink tutorId={trial.tutor_id} tutorName={trial.tutor_name} />
        <span className="text-foreground/30">•</span>
        <MapPin className="h-3 w-3 flex-shrink-0" />
        <span>{trial.location}</span>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-2">
        <Button
          size="sm"
          variant="secondary"
          icon={Phone}
          className="flex-1"
          onClick={() => onRecordContact(trial.student_id)}
        >
          Contact
        </Button>
        {isAdmin && (
          <Button
            size="sm"
            variant="primary"
            icon={ArrowRight}
            className="flex-1"
            onClick={() => onConvert(trial)}
          >
            Convert
          </Button>
        )}
      </div>
    </div>
  );
}

export function TrialsQuickLink({ className }: TrialsQuickLinkProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedLocation } = useLocation();
  const { isAdmin, effectiveRole } = useAuth();

  // Modal state
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactStudentId, setContactStudentId] = useState<number | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [convertFromTrial, setConvertFromTrial] = useState<TrialListItem | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(null);
  const [modalTabView, setModalTabView] = useState<'detail' | 'create'>('detail');

  const [conversionBusy, setConversionBusy] = useState(false);

  // Fetch trials
  const { data: trials = [], isLoading, mutate: refreshTrials } = useSWR(
    ["trials-quicklink", selectedLocation],
    () =>
      enrollmentsAPI.getTrials({
        location:
          selectedLocation !== "All Locations" ? selectedLocation : undefined,
      }),
    { revalidateOnFocus: false }
  );


  // Filter to scheduled and attended only (exclude converted and lost)
  const { scheduledTrials, attendedTrials, totalCount } = useMemo(() => {
    const scheduled = trials.filter((t) => t.trial_status === "scheduled");

    // Attended includes pending/attended/no_show that are NOT older than 2 weeks
    // Trials older than 2 weeks are "Lost" and should not appear here
    const attended = trials.filter((t) => {
      if (t.trial_status === "converted" || t.trial_status === "scheduled") {
        return false;
      }

      // Check if pending/attended/no_show
      if (
        t.trial_status === "pending" ||
        t.trial_status === "attended" ||
        t.trial_status === "no_show"
      ) {
        const sessionDate = new Date(t.session_date);
        const timeSinceSession = Date.now() - sessionDate.getTime();
        // Only include if within 2 weeks (not "Lost")
        return timeSinceSession <= TWO_WEEKS_MS;
      }
      return false;
    });

    return {
      scheduledTrials: scheduled,
      attendedTrials: attended,
      totalCount: scheduled.length + attended.length,
    };
  }, [trials]);

  // Handlers
  const handleClose = () => setIsOpen(false);

  const handleRecordContact = (studentId: number) => {
    setContactStudentId(studentId);
    setContactModalOpen(true);
    setIsOpen(false);
  };

  const handleConvert = (trial: TrialListItem) => {
    setConvertFromTrial(trial);
    setSelectedEnrollmentId(trial.enrollment_id);
    setDetailModalOpen(true);
    setCreateModalOpen(true);
    setIsOpen(false);
    setModalTabView('create');
  };

  const handleConvertCloseAll = () => {
    if (conversionBusy) return;
    setDetailModalOpen(false);
    setSelectedEnrollmentId(null);
    setCreateModalOpen(false);
    setConvertFromTrial(null);
  };

  const handleConvertSuccess = () => {
    handleConvertCloseAll();
    void refreshTrials();
  };

  // Floating UI
  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [
      offset(8),
      flip({ fallbackAxisSideDirection: "end" }),
      shift({ padding: 8 }),
      fitToScreen(),
    ],
    placement: "bottom-start",
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([
    click,
    dismiss,
  ]);

  return (
    <>
      <div className={cn("relative", className)}>
        <button
          ref={refs.setReference}
          {...getReferenceProps()}
          className={cn(
            QUICK_LINK,
            "bg-field-fill dark:bg-field-fill",
            isOpen && "bg-tint dark:bg-tint shadow-sm"
          )}
        >
          <FlaskConical className="h-4 w-4" />
          <span>Trials</span>
          <CountBadge count={totalCount} tone="neutral" className={QUICK_LINK_BADGE} />
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              QUICK_LINK_CHEVRON,
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
                "paper-cream paper-texture rounded-lg shadow-xl",
                "border border-line-strong dark:border-line"
              )}
            >
              {/* Header */}
              <div className="px-3 py-2 border-b border-line bg-paper rounded-t-lg">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                  <span className="font-medium text-sm">Trial Sessions</span>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
                  </div>
                ) : totalCount === 0 ? (
                  <div className="text-center py-8 text-foreground/50 text-sm">
                    No pending trials
                  </div>
                ) : (
                  <>
                    {/* Scheduled Section */}
                    {scheduledTrials.length > 0 && (
                      <div>
                        <div className="px-3 py-1.5 text-xs font-semibold text-foreground/60 bg-blue-50 dark:bg-blue-900/20 border-b border-line/50">
                          Scheduled ({scheduledTrials.length})
                        </div>
                        {scheduledTrials.slice(0, 5).map((trial) => (
                          <ScheduledTrialCard
                            key={trial.enrollment_id}
                            trial={trial}
                            onClose={handleClose}
                          />
                        ))}
                        {scheduledTrials.length > 5 && (
                          <div className="px-3 py-1 text-xs text-foreground/50 text-center">
                            +{scheduledTrials.length - 5} more
                          </div>
                        )}
                      </div>
                    )}

                    {/* Attended/Awaiting Conversion Section */}
                    {attendedTrials.length > 0 && (
                      <div>
                        <div className="px-3 py-1.5 text-xs font-semibold text-foreground/60 bg-amber-50 dark:bg-amber-900/20 border-b border-line/50">
                          Awaiting Conversion ({attendedTrials.length})
                        </div>
                        {attendedTrials.slice(0, 5).map((trial) => (
                          <AwaitingTrialCard
                            key={trial.enrollment_id}
                            trial={trial}
                            onRecordContact={handleRecordContact}
                            onConvert={handleConvert}
                            isAdmin={isAdmin}
                          />
                        ))}
                        {attendedTrials.length > 5 && (
                          <div className="px-3 py-1 text-xs text-foreground/50 text-center">
                            +{attendedTrials.length - 5} more
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <Link
                href="/trials"
                onClick={handleClose}
                className="block px-3 py-2 text-xs text-center text-accent-ink hover:bg-paper dark:hover:bg-paper border-t border-line transition-colors rounded-b-lg"
              >
                View all trials <ChevronRight className="h-3 w-3 inline" />
              </Link>
            </div>
          </FloatingPortal>
        )}
      </div>

      {/* Record Contact Modal */}
      <RecordContactModal
        isOpen={contactModalOpen}
        onClose={() => {
          setContactModalOpen(false);
          setContactStudentId(null);
        }}
        editingContact={null}
        preselectedStudentId={contactStudentId}
        location={selectedLocation !== "All Locations" ? selectedLocation : undefined}
        currentUserRole={effectiveRole as "Tutor" | "Admin" | "Super Admin"}
      />

      {/* Use the same bounded conversion workspace as the Trials page. */}
      <AnimatePresence mode="wait">
        {detailModalOpen && <TrialConversionWorkspace key="convert-modal-container"
          converting={!!(createModalOpen && convertFromTrial)} tab={modalTabView} onTabChange={setModalTabView}
          busy={conversionBusy} onClose={handleConvertCloseAll}
          detail={wide => <EnrollmentDetailModal isOpen={true} onClose={handleConvertCloseAll}
            enrollmentId={selectedEnrollmentId} compact={wide && createModalOpen} standalone={false} headerLabel="Trial" />}
          create={createModalOpen && convertFromTrial ? <CreateEnrollmentModal isOpen={true}
            onClose={handleConvertCloseAll} onSuccess={handleConvertSuccess} onBusyChange={setConversionBusy}
            convertFromTrial={convertFromTrial} standalone={false} /> : undefined}
        />}
      </AnimatePresence>
    </>
  );
}
