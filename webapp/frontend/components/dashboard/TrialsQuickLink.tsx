"use client";

import { useState, useMemo, useEffect, type MouseEvent } from "react";
import Link from "next/link";
import { TutorLink } from "@/components/tutors/TutorLink";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import { QUICK_LINK, QUICK_LINK_BADGE, QUICK_LINK_CHEVRON } from "./quick-link-style";
import { formatDateCompact } from "@/lib/formatters";
import { useSession } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { SessionDetailPopover } from "@/components/sessions/SessionDetailPopover";
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


type OpenTrialSession = (trial: TrialListItem, event: MouseEvent<HTMLButtonElement>) => void;

function TrialSummary({ trial, onOpenSession }: { trial: TrialListItem; onOpenSession: OpenTrialSession }) {
  const sessionDate = new Date(trial.session_date + 'T00:00:00');
  const isToday = new Date().toDateString() === sessionDate.toDateString();
  const isPast = trial.trial_status !== 'scheduled' && sessionDate < new Date() && !isToday;
  return <>
    <div className="mb-1"><StudentInfoBadges nameHref={`/students/${trial.student_id}`} student={{
      student_id: trial.student_id, student_name: trial.student_name, school_student_id: trial.school_student_id,
      grade: trial.grade, lang_stream: trial.lang_stream, school: trial.school, home_location: trial.location,
    }} /></div>
    <button type="button" onClick={event => onOpenSession(trial, event)} aria-label={`View trial session for ${trial.student_name}`}
      className="flex min-h-8 w-full flex-wrap items-center gap-x-1.5 text-left text-xs text-ink-subtle hover:text-accent-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
      <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className={cn(isToday && "text-blue-600 dark:text-blue-400 font-medium", isPast && "text-red-600 dark:text-red-400")}>
        {formatDateCompact(trial.session_date)}{isToday && " (Today)"}
      </span><span>{trial.time_slot}</span>
    </button>
    <div className="flex items-center gap-1.5 text-xs text-ink-subtle mt-0.5">
      <User className="h-3 w-3 shrink-0" aria-hidden="true" /><TutorLink tutorId={trial.tutor_id} tutorName={trial.tutor_name} />
      <MapPin className="ml-1 h-3 w-3 shrink-0" aria-hidden="true" /><span>{trial.location}</span>
    </div>
  </>;
}

function ScheduledTrialCard({ trial, onOpenSession }: { trial: TrialListItem; onOpenSession: OpenTrialSession }) {
  return <div className="px-3 py-2.5 border-b border-line/50 last:border-b-0"><TrialSummary trial={trial} onOpenSession={onOpenSession} /></div>;
}

// Compact trial card for awaiting conversion - with action buttons
function AwaitingTrialCard({
  trial,
  onRecordContact,
  onOpenSession,
  onConvert,
  isAdmin,
}: {
  trial: TrialListItem;
  onOpenSession: OpenTrialSession;
  onRecordContact: (studentId: number) => void;
  onConvert: (trial: TrialListItem) => void;
  isAdmin: boolean;
}) {
  return (
    <div className="px-3 py-2.5 border-b border-line/50 last:border-b-0">
      <TrialSummary trial={trial} onOpenSession={onOpenSession} />

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
  const { showError } = useToast();
  const [sessionSelection, setSessionSelection] = useState<{ id: number; position: { x: number; y: number } } | null>(null);
  const { data: session, isLoading: sessionLoading, error: sessionError } = useSession(sessionSelection?.id);
  useEffect(() => {
    if (!sessionSelection || !sessionError) return;
    setSessionSelection(null);
    showError('Could not load the trial session. Please try again.');
  }, [sessionSelection, sessionError, showError]);
  const handleOpenSession: OpenTrialSession = (trial, event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setSessionSelection({ id: trial.session_id, position: event.detail === 0
      ? { x: bounds.left, y: bounds.bottom } : { x: event.clientX, y: event.clientY } });
    setIsOpen(false);
  };

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
                            onOpenSession={handleOpenSession}
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
                            onOpenSession={handleOpenSession}
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

      {sessionSelection && <SessionDetailPopover session={session?.id === sessionSelection.id ? session : null}
        isOpen isLoading={sessionLoading} clickPosition={sessionSelection.position}
        onClose={() => { setSessionSelection(null); const trigger = refs.domReference.current; if (trigger instanceof HTMLElement) trigger.focus(); }}
        onNavigate={() => setSessionSelection(null)} />}

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
