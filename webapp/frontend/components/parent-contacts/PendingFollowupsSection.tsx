"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
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
      "bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800",
      "overflow-hidden"
    )}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center gap-2 px-4 py-2",
          "hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
        )}
      >
        <Bell className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span className="flex-1 text-left text-sm font-medium text-blue-800 dark:text-blue-200">
          Pending Follow-ups
        </span>
        <span className={cn(
          "px-2 py-0.5 rounded-full text-xs font-medium",
          overdueCount > 0
            ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
            : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
        )}>
          {followups.length}
          {overdueCount > 0 && ` (${overdueCount} overdue)`}
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-blue-600 dark:text-blue-400" />
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
                    "bg-white dark:bg-[#1a1a1a] border",
                    onStudentClick && "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
                    selectedStudentId === followup.student_id && "ring-2 ring-[#a0704b]/50 dark:ring-[#cd853f]/50",
                    isOverdue
                      ? "border-red-200 dark:border-red-800"
                      : isToday
                        ? "border-orange-200 dark:border-orange-800"
                        : "border-blue-200 dark:border-blue-800"
                  )}
                  onClick={() => onStudentClick?.(followup)}
                >
                  {/* Status Icon */}
                  {isOverdue ? (
                    <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  ) : isToday ? (
                    <Clock className="h-4 w-4 text-orange-500 flex-shrink-0" />
                  ) : (
                    <Bell className="h-4 w-4 text-blue-500 flex-shrink-0" />
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
                          ? "text-orange-600 dark:text-orange-400"
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
                      <button
                        onClick={(e) => { e.stopPropagation(); onMarkDone(followup.follow_up_communication_id!, followup.student_name); }}
                        disabled={readOnly}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors",
                          readOnly
                            ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                            : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50"
                        )}
                        title={readOnly ? "Read-only access" : "Mark follow-up as done"}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Done
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onRecordContact(followup.student_id); }}
                      disabled={readOnly}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors",
                        readOnly
                          ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                          : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                      )}
                      title={readOnly ? "Read-only access" : undefined}
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                      Contact
                    </button>
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
