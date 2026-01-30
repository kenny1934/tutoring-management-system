"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import { cn } from "@/lib/utils";
import { useLocation } from "@/contexts/LocationContext";
import { useAuth } from "@/contexts/AuthContext";
import { enrollmentsAPI, TrialListItem } from "@/lib/api";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { RecordContactModal } from "@/components/parent-contacts/RecordContactModal";
import { CreateEnrollmentModal } from "@/components/enrollments/CreateEnrollmentModal";
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

interface TrialsQuickLinkProps {
  className?: string;
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

// Compact trial card for scheduled trials - links to session detail
function ScheduledTrialCard({
  trial,
  onClose,
}: {
  trial: TrialListItem;
  onClose: () => void;
}) {
  const sessionDate = new Date(trial.session_date);
  const isToday = new Date().toDateString() === sessionDate.toDateString();

  return (
    <Link
      href={`/sessions/${trial.session_id}`}
      onClick={onClose}
      className="block px-3 py-2.5 hover:bg-[#faf6f1] dark:hover:bg-[#2d2820] transition-colors border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 last:border-b-0"
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
              compact
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
            <span>{trial.tutor_name}</span>
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
  const sessionDate = new Date(trial.session_date);
  const isToday = new Date().toDateString() === sessionDate.toDateString();
  const isPast = sessionDate < new Date() && !isToday;

  return (
    <div className="px-3 py-2.5 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50 last:border-b-0">
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
          compact
        />
      </div>

      {/* Session details */}
      <div className="flex items-center gap-1.5 text-xs text-foreground/60">
        <Calendar className="h-3 w-3 flex-shrink-0" />
        <span
          className={cn(
            isToday && "text-blue-600 dark:text-blue-400 font-medium",
            isPast && "text-red-500 dark:text-red-400"
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
        <span>{trial.tutor_name}</span>
        <span className="text-foreground/30">•</span>
        <MapPin className="h-3 w-3 flex-shrink-0" />
        <span>{trial.location}</span>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => onRecordContact(trial.student_id)}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <Phone className="h-3 w-3" />
          Contact
        </button>
        {isAdmin && (
          <button
            onClick={() => onConvert(trial)}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded transition-colors"
          >
            <ArrowRight className="h-3 w-3" />
            Convert
          </button>
        )}
      </div>
    </div>
  );
}

export function TrialsQuickLink({ className }: TrialsQuickLinkProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedLocation } = useLocation();
  const { user, isAdmin, effectiveRole } = useAuth();

  // Modal state
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactStudentId, setContactStudentId] = useState<number | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [convertFromTrial, setConvertFromTrial] = useState<TrialListItem | null>(null);

  // Fetch trials
  const { data: trials = [], isLoading } = useSWR(
    ["trials-quicklink", selectedLocation],
    () =>
      enrollmentsAPI.getTrials({
        location:
          selectedLocation !== "All Locations" ? selectedLocation : undefined,
      }),
    { revalidateOnFocus: false }
  );

  // 2-week threshold for "Lost" categorization (must match trials page)
  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

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
    setCreateModalOpen(true);
    setIsOpen(false);
  };

  // Floating UI
  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [
      offset(8),
      flip({ fallbackAxisSideDirection: "end" }),
      shift({ padding: 8 }),
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
            "inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-all",
            "bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#8b6f47]",
            "text-[#a0704b] dark:text-[#cd853f]",
            "hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] hover:shadow-sm",
            isOpen && "bg-[#f5ede3] dark:bg-[#3d3628] shadow-sm"
          )}
        >
          <FlaskConical className="h-4 w-4" />
          <span>Trials</span>
          {totalCount > 0 && (
            <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-teal-500 rounded-full">
              {totalCount > 99 ? "99+" : totalCount}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
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
                "bg-white dark:bg-[#1a1a1a] rounded-lg shadow-lg",
                "border border-[#e8d4b8] dark:border-[#6b5a4a]"
              )}
            >
              {/* Header */}
              <div className="px-3 py-2 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf6f1] dark:bg-[#2d2820] rounded-t-lg">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-teal-600 dark:text-teal-400" />
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
                        <div className="px-3 py-1.5 text-xs font-semibold text-foreground/60 bg-blue-50 dark:bg-blue-900/20 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
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
                        <div className="px-3 py-1.5 text-xs font-semibold text-foreground/60 bg-amber-50 dark:bg-amber-900/20 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
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
                className="block px-3 py-2 text-xs text-center text-[#a0704b] hover:bg-[#faf6f1] dark:hover:bg-[#2d2820] border-t border-[#e8d4b8] dark:border-[#6b5a4a] transition-colors rounded-b-lg"
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

      {/* Create Enrollment Modal (for conversion) */}
      <CreateEnrollmentModal
        isOpen={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setConvertFromTrial(null);
        }}
        convertFromTrial={convertFromTrial || undefined}
      />
    </>
  );
}
