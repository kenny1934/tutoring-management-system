"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/controls";
import type { StudentContactStatus } from "@/lib/api";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  MessageSquarePlus,
  AlertTriangle,
  Clock
} from "lucide-react";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";

interface PendingFollowupsSectionProps {
  followups: StudentContactStatus[];
  onRecordContact: (studentId: number) => void;
  onMarkDone?: (communicationId: number, studentName: string) => void;
  onStudentClick?: (student: StudentContactStatus) => void;
  selectedStudentId?: number | null;
  showLocationPrefix?: boolean;
  /** When true, disables record contact buttons (Supervisor mode) */
  readOnly?: boolean;
}

export function PendingFollowupsSection({
  followups,
  onRecordContact,
  onMarkDone,
  onStudentClick,
  selectedStudentId,
  showLocationPrefix,
  readOnly = false,
}: PendingFollowupsSectionProps) {
  const [expanded, setExpanded] = useState(true);

  // Sort by follow-up date (overdue first, then upcoming)
  const sortedFollowups = useMemo(() =>
    [...followups].sort((a, b) => {
      if (!a.follow_up_date) return 1;
      if (!b.follow_up_date) return -1;
      return new Date(a.follow_up_date).getTime() - new Date(b.follow_up_date).getTime();
    }),
    [followups]
  );

  const today = useMemo(() => new Date().toISOString().split('T')[0], [followups]);

  const overdueCount = useMemo(() =>
    sortedFollowups.filter(f =>
      f.follow_up_date && f.follow_up_date < today
    ).length,
    [sortedFollowups, today]
  );

  if (followups.length === 0) return null;

  return (
    <div className={cn(
      "bg-paper rounded-lg border border-line",
      "overflow-hidden"
    )}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-2 px-4 py-2",
          "hover:bg-tint transition-colors"
        )}
      >
        <Bell className="h-4 w-4 text-ink-subtle" />
        <span className="flex-1 text-left text-sm font-medium text-gray-900 dark:text-gray-100">
          Pending follow-ups
        </span>
        <span className={cn(
          "px-2 py-0.5 rounded-full text-xs font-medium",
          overdueCount > 0
            ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
            : "bg-tint text-gray-700 dark:text-gray-300"
        )}>
          {overdueCount === 0
            ? followups.length
            : overdueCount === followups.length
              ? `${overdueCount} overdue`
              : `${followups.length}, ${overdueCount} overdue`}
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-ink-subtle" />
        ) : (
          <ChevronDown className="h-4 w-4 text-ink-subtle" />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-4 pb-3">
          <div className="space-y-2">
            {sortedFollowups.map(followup => {
              const isOverdue = followup.follow_up_date && followup.follow_up_date < today;
              const isToday = followup.follow_up_date === today;

              return (
                <div
                  key={followup.student_id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md",
                    "bg-field-fill border",
                    onStudentClick && "cursor-pointer hover:bg-tint transition-colors",
                    selectedStudentId === followup.student_id && "ring-2 ring-accent-ink/50",
                    isOverdue
                      ? "border-red-200 dark:border-red-800"
                      : isToday
                        ? "border-orange-200 dark:border-orange-800"
                        : "border-line"
                  )}
                  onClick={() => onStudentClick?.(followup)}
                >
                  {/* Status Icon */}
                  {isOverdue ? (
                    <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
                  ) : isToday ? (
                    <Clock className="h-4 w-4 text-orange-700 flex-shrink-0" />
                  ) : (
                    <Bell className="h-4 w-4 text-ink-subtle flex-shrink-0" />
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <StudentInfoBadges
                      student={{
                        student_id: followup.student_id,
                        student_name: followup.student_name,
                        school_student_id: followup.school_student_id || undefined,
                        grade: followup.grade || undefined,
                        lang_stream: followup.lang_stream || undefined,
                        school: followup.school || undefined,
                        home_location: followup.home_location || undefined,
                      }}
                      showLocationPrefix={showLocationPrefix}
                    />
                    <p className={cn(
                      "text-xs",
                      isOverdue
                        ? "text-red-600 dark:text-red-400"
                        : isToday
                          ? "text-orange-700 dark:text-orange-400"
                          : "text-gray-500 dark:text-gray-400"
                    )}>
                      {followup.follow_up_date ? (
                        isOverdue ? (
                          <>Overdue since {new Date(followup.follow_up_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                        ) : isToday ? (
                          'Due today'
                        ) : (
                          <>Due {new Date(followup.follow_up_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>
                        )
                      ) : (
                        'No date set'
                      )}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {followup.follow_up_communication_id && onMarkDone && (
                      <Button
                        size="sm"
                        icon={Check}
                        iconClassName="text-green-600 dark:text-green-400"
                        onClick={(e) => { e.stopPropagation(); onMarkDone(followup.follow_up_communication_id!, followup.student_name); }}
                        disabled={readOnly}
                        title={readOnly ? "Read-only access" : "Mark follow-up as done"}
                      >
                        Done
                      </Button>
                    )}
                    <Button
                      size="sm"
                      icon={MessageSquarePlus}
                      onClick={(e) => { e.stopPropagation(); onRecordContact(followup.student_id); }}
                      disabled={readOnly}
                      title={readOnly ? "Read-only access" : undefined}
                    >
                      Contact
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
