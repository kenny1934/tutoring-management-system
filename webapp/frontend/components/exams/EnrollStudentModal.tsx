"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { CURRENT_USER_TUTOR } from "@/lib/constants";
import { useEligibleStudents, useTutors, useFilteredList } from "@/lib/hooks";
import { examRevisionAPI } from "@/lib/api";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import type { ExamRevisionSlot, EligibleStudent } from "@/types";
import {
  X,
  Loader2,
  Search,
  Calendar,
  Clock,
  User,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface EnrollStudentModalProps {
  slot: ExamRevisionSlot;
  isOpen: boolean;
  onClose: () => void;
  onEnrolled: () => void;
  showLocationPrefix?: boolean;
}

export function EnrollStudentModal({
  slot,
  isOpen,
  onClose,
  onEnrolled,
  showLocationPrefix,
}: EnrollStudentModalProps) {
  const { data: eligibleStudents = [], isLoading } = useEligibleStudents(
    isOpen ? slot.id : null
  );
  const { data: tutors = [] } = useTutors();

  // Get current user's email for audit trail
  const currentUserEmail = useMemo(() => {
    const tutor = tutors.find(t => t.tutor_name === CURRENT_USER_TUTOR);
    return tutor?.user_email;
  }, [tutors]);

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedStudentId, setExpandedStudentId] = useState<number | null>(null);
  const [selectedSession, setSelectedSession] = useState<{
    studentId: number;
    sessionId: number;
  } | null>(null);
  const [enrollingStudent, setEnrollingStudent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter students by search
  const filteredStudents = useFilteredList(
    eligibleStudents,
    searchQuery,
    ['student_name', 'school_student_id', 'grade', 'school']
  );

  const handleToggleStudent = (studentId: number) => {
    if (expandedStudentId === studentId) {
      setExpandedStudentId(null);
      setSelectedSession(null);
    } else {
      setExpandedStudentId(studentId);
      setSelectedSession(null);
    }
  };

  const handleSelectSession = (studentId: number, sessionId: number) => {
    setSelectedSession({ studentId, sessionId });
  };

  const handleEnroll = async (student: EligibleStudent, sessionId: number) => {
    setError(null);
    setSuccessMessage(null);
    setEnrollingStudent(student.student_id);

    try {
      await examRevisionAPI.enrollStudent(slot.id, {
        student_id: student.student_id,
        consume_session_id: sessionId,
        created_by: currentUserEmail,
      });

      setSuccessMessage(`${student.student_name} enrolled successfully!`);
      setExpandedStudentId(null);
      setSelectedSession(null);

      // Auto-dismiss success and refresh parent after a delay
      setTimeout(() => {
        setSuccessMessage(null);
        onEnrolled();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enroll student");
    } finally {
      setEnrollingStudent(null);
    }
  };

  const getSessionStatusBadge = (status: string) => {
    if (status.includes("Pending Make-up")) {
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    }
    if (status === "Scheduled" || status === "Make-up Class") {
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    }
    return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={cn(
        "relative z-10 w-full max-w-2xl min-w-[550px] max-h-[80vh] mx-4 rounded-xl overflow-hidden flex flex-col",
        "bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a]",
        "shadow-2xl paper-texture"
      )}>
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Enroll Student
            </h2>
            <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400 mt-0.5">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(slot.session_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {slot.time_slot}
              </span>
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {slot.tutor_name}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Success/Error messages */}
        {(error || successMessage) && (
          <div className="flex-shrink-0 px-6 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}
            {successMessage && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm">
                <CheckCircle className="h-4 w-4 flex-shrink-0" />
                {successMessage}
              </div>
            )}
          </div>
        )}

        {/* Search */}
        <div className="flex-shrink-0 px-6 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#faf6f1]/50 dark:bg-[#2d2820]/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search students..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg bg-white dark:bg-[#1a1a1a] placeholder-gray-400"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#a0704b]" />
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {searchQuery
                  ? "No matching students found"
                  : "No eligible students for this revision slot. Eligible students must match the exam's school/grade criteria and have pending sessions at this location."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredStudents.map((student) => (
                <div
                  key={student.student_id}
                  className={cn(
                    "rounded-lg border overflow-hidden transition-all",
                    "border-[#e8d4b8] dark:border-[#6b5a4a]",
                    expandedStudentId === student.student_id && "ring-2 ring-[#a0704b] ring-offset-1"
                  )}
                >
                  {/* Student header */}
                  <button
                    onClick={() => handleToggleStudent(student.student_id)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#faf6f1]/50 dark:hover:bg-[#2d2820]/50 transition-colors"
                  >
                    <StudentInfoBadges student={student} showLink showLocationPrefix={showLocationPrefix} />
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {student.pending_sessions.length} session{student.pending_sessions.length !== 1 ? "s" : ""}
                      </span>
                      {expandedStudentId === student.student_id ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded - session selection */}
                  {expandedStudentId === student.student_id && (
                    <div className="border-t border-[#e8d4b8] dark:border-[#6b5a4a] p-4 bg-[#faf6f1]/30 dark:bg-[#2d2820]/30">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                        Select a session to consume:
                      </p>
                      <div className="space-y-2">
                        {student.pending_sessions.map((session) => (
                          <button
                            key={session.id}
                            onClick={() => handleSelectSession(student.student_id, session.id)}
                            className={cn(
                              "w-full px-3 py-2 rounded-lg border text-left text-sm transition-all",
                              selectedSession?.studentId === student.student_id &&
                                selectedSession?.sessionId === session.id
                                ? "border-[#a0704b] bg-[#a0704b]/10 ring-2 ring-[#a0704b]/30"
                                : "border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] hover:border-[#a0704b]/50"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                <span className="text-gray-700 dark:text-gray-300">
                                  {new Date(session.session_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                                </span>
                                {session.time_slot && (
                                  <span className="text-gray-500 dark:text-gray-400">
                                    {session.time_slot}
                                  </span>
                                )}
                              </div>
                              <span className={cn(
                                "px-2 py-0.5 text-xs font-medium rounded-full",
                                getSessionStatusBadge(session.session_status)
                              )}>
                                {session.session_status}
                              </span>
                            </div>
                            {session.tutor_name && (
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Tutor: {session.tutor_name}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>

                      {/* Enroll button */}
                      {selectedSession?.studentId === student.student_id && (
                        <button
                          onClick={() => handleEnroll(student, selectedSession.sessionId)}
                          disabled={enrollingStudent === student.student_id}
                          className={cn(
                            "mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                            "bg-[#a0704b] hover:bg-[#8a5f3e] text-white",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                          )}
                        >
                          {enrollingStudent === student.student_id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Enrolling...
                            </>
                          ) : (
                            "Enroll Student"
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
