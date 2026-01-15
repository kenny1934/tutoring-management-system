"use client";

import { useState, useMemo, useCallback } from "react";
import useSWR from "swr";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useLocation } from "@/contexts/LocationContext";
import { useToast } from "@/contexts/ToastContext";
import { sessionsAPI } from "@/lib/api";
import {
  toDateString,
  getToday,
  isSameDay,
  getMonthCalendarDates,
  getMonthName,
  getPreviousMonth,
  getNextMonth,
  getMonthBounds,
  groupSessionsByTimeSlot,
  parseTimeSlot,
  timeToMinutes,
} from "@/lib/calendar-utils";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  X,
  Loader2,
  Check,
  CalendarDays,
  Users,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getGradeColor } from "@/lib/constants";
import type { Session } from "@/types";
import type { FileSelection } from "@/components/ui/folder-tree-modal";
import { SessionDetailPopover } from "./SessionDetailPopover";

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Helper to sort tutors by first name (stripping Mr/Ms/Mrs prefix)
const getTutorSortName = (name: string) => name.replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, '');

// Session selection with exercise type
interface SessionSelection {
  sessionId: number;
  exerciseType: "CW" | "HW";
  session: Session; // For display
}

interface SessionSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileSelection[];
  onAssignComplete?: () => void;
}

export function SessionSelectorModal({
  isOpen,
  onClose,
  files,
  onAssignComplete,
}: SessionSelectorModalProps) {
  const { selectedLocation } = useLocation();
  const { showToast } = useToast();
  const today = getToday();

  // Calendar state
  const [viewDate, setViewDate] = useState<Date>(today);
  const [selectedDayDate, setSelectedDayDate] = useState<string | null>(null);

  // Sessions data - use SWR for caching
  const monthKey = `${viewDate.getFullYear()}-${viewDate.getMonth()}`;
  const { data: sessions = [], isLoading, error: loadError } = useSWR(
    isOpen ? ["session-selector", monthKey, selectedLocation] : null,
    async () => {
      const { start, end } = getMonthBounds(viewDate);
      const filters: {
        from_date: string;
        to_date: string;
        location?: string;
        limit: number;
      } = {
        from_date: toDateString(start),
        to_date: toDateString(end),
        limit: 2000,
      };
      if (selectedLocation && selectedLocation !== "All Locations") {
        filters.location = selectedLocation;
      }
      return sessionsAPI.getAll(filters);
    },
    { revalidateOnFocus: false }
  );

  // Selection state: Map<sessionId, exerciseType>
  const [selections, setSelections] = useState<Map<number, SessionSelection>>(
    new Map()
  );

  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  // Confirmation step
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Build sessions lookup by date
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Session[]>();
    sessions.forEach((session) => {
      const dateKey = session.session_date;
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(session);
    });
    return map;
  }, [sessions]);

  // Generate calendar grid data
  const calendarData = useMemo(() => {
    const calendarDates = getMonthCalendarDates(viewDate);
    const currentMonth = viewDate.getMonth();

    return calendarDates.map((date) => {
      const dateString = toDateString(date);
      const daySessions = sessionsByDate.get(dateString) || [];
      const dayOfWeek = date.getDay();

      return {
        date,
        dateString,
        isCurrentMonth: date.getMonth() === currentMonth,
        isToday: isSameDay(date, today),
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        sessions: daySessions,
        sessionCount: daySessions.length,
        // Count how many are selected
        selectedCount: daySessions.filter((s) => selections.has(s.id)).length,
      };
    });
  }, [viewDate, sessionsByDate, today, selections]);

  // Navigation handlers
  const goToPreviousMonth = () => setViewDate(getPreviousMonth(viewDate));
  const goToNextMonth = () => setViewDate(getNextMonth(viewDate));
  const goToToday = () => setViewDate(today);

  // Handle day click
  const handleDayClick = (dateString: string, sessionCount: number) => {
    if (sessionCount > 0) {
      setSelectedDayDate(dateString);
    }
  };

  // Toggle session selection
  const toggleSession = useCallback(
    (session: Session, exerciseType: "CW" | "HW" = "CW") => {
      setSelections((prev) => {
        const next = new Map(prev);
        if (next.has(session.id)) {
          next.delete(session.id);
        } else {
          next.set(session.id, { sessionId: session.id, exerciseType, session });
        }
        return next;
      });
    },
    []
  );

  // Update exercise type for a selection
  const updateExerciseType = useCallback(
    (sessionId: number, exerciseType: "CW" | "HW") => {
      setSelections((prev) => {
        const next = new Map(prev);
        const existing = next.get(sessionId);
        if (existing) {
          next.set(sessionId, { ...existing, exerciseType });
        }
        return next;
      });
    },
    []
  );

  // Remove selection
  const removeSelection = useCallback((sessionId: number) => {
    setSelections((prev) => {
      const next = new Map(prev);
      next.delete(sessionId);
      return next;
    });
  }, []);

  // Select all sessions for a day
  const selectAllForDay = useCallback(
    (daySessions: Session[], exerciseType: "CW" | "HW" = "CW") => {
      setSelections((prev) => {
        const next = new Map(prev);
        daySessions.forEach((session) => {
          if (!next.has(session.id)) {
            next.set(session.id, {
              sessionId: session.id,
              exerciseType,
              session,
            });
          }
        });
        return next;
      });
    },
    []
  );

  // Clear all selections for a day
  const clearSelectionsForDay = useCallback((daySessions: Session[]) => {
    setSelections((prev) => {
      const next = new Map(prev);
      daySessions.forEach((session) => {
        next.delete(session.id);
      });
      return next;
    });
  }, []);

  // Parse page range from FileSelection
  const parsePageRange = (
    pages: string
  ): { pageStart?: number; pageEnd?: number; complexPages?: string } => {
    if (!pages || !pages.trim()) return {};

    // Check if it's a complex range (contains comma)
    if (pages.includes(",")) {
      return { complexPages: pages };
    }

    // Simple range like "1-5" or single page "3"
    const normalized = pages.replace(/[~–—−]/g, "-");
    const match = normalized.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : start;
      return { pageStart: start, pageEnd: end };
    }

    // Treat as complex if parsing failed
    return { complexPages: pages };
  };

  // Handle save/assign
  const handleAssign = async () => {
    if (selections.size === 0 || files.length === 0) return;

    setIsSaving(true);
    setSaveProgress({ current: 0, total: selections.size });

    try {
      let completed = 0;

      // Group selections by exercise type
      const cwSelections = Array.from(selections.values()).filter(
        (s) => s.exerciseType === "CW"
      );
      const hwSelections = Array.from(selections.values()).filter(
        (s) => s.exerciseType === "HW"
      );

      // Save CW exercises
      for (const selection of cwSelections) {
        const exercises = files.map((file) => {
          const pageRange = parsePageRange(file.pages);
          return {
            exercise_type: "CW" as const,
            pdf_name: file.path,
            page_start: pageRange.pageStart || null,
            page_end: pageRange.pageEnd || null,
            remarks: pageRange.complexPages || null,
          };
        });

        await sessionsAPI.saveExercises(selection.sessionId, "CW", exercises);
        completed++;
        setSaveProgress({ current: completed, total: selections.size });
      }

      // Save HW exercises
      for (const selection of hwSelections) {
        const exercises = files.map((file) => {
          const pageRange = parsePageRange(file.pages);
          return {
            exercise_type: "HW" as const,
            pdf_name: file.path,
            page_start: pageRange.pageStart || null,
            page_end: pageRange.pageEnd || null,
            remarks: pageRange.complexPages || null,
          };
        });

        await sessionsAPI.saveExercises(selection.sessionId, "HW", exercises);
        completed++;
        setSaveProgress({ current: completed, total: selections.size });
      }

      // Success - show toast and close modal
      showToast(
        `Assigned ${files.length} file${files.length !== 1 ? "s" : ""} to ${selections.size} session${selections.size !== 1 ? "s" : ""}`,
        "success"
      );
      onAssignComplete?.();
      onClose();
    } catch (err) {
      console.error("Failed to assign exercises:", err);
      showToast("Failed to assign exercises", "error");
      // Keep modal open on error
    } finally {
      setIsSaving(false);
      setSaveProgress(null);
    }
  };

  // Get selected day sessions for popover
  const selectedDaySessions = useMemo(() => {
    if (!selectedDayDate) return [];
    return sessionsByDate.get(selectedDayDate) || [];
  }, [selectedDayDate, sessionsByDate]);

  // Sort and group selected day sessions by time slot
  const sortedSelectedDaySessions = useMemo(() => {
    const sorted = [...selectedDaySessions].sort((a, b) => {
      const aTime = parseTimeSlot(a.time_slot);
      const bTime = parseTimeSlot(b.time_slot);
      if (!aTime || !bTime) return 0;
      return timeToMinutes(aTime.start) - timeToMinutes(bTime.start);
    });
    return sorted;
  }, [selectedDaySessions]);

  // Format file display
  const formatFileName = (path: string): string => {
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
  };

  // Get selection summary
  const selectionsList = Array.from(selections.values());
  const cwCount = selectionsList.filter((s) => s.exerciseType === "CW").length;
  const hwCount = selectionsList.filter((s) => s.exerciseType === "HW").length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
          <span>Assign Files to Sessions</span>
        </div>
      }
      size="xl"
      persistent={isSaving}
      footer={
        <div className="flex items-center justify-between w-full">
          {showConfirmation ? (
            <>
              <Button variant="outline" onClick={() => setShowConfirmation(false)} disabled={isSaving}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button
                onClick={handleAssign}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Assigning... ({saveProgress?.current}/{saveProgress?.total})
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Confirm Assignment
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                onClick={() => setShowConfirmation(true)}
                disabled={selections.size === 0}
              >
                <ChevronRight className="h-4 w-4 mr-2" />
                Review ({selections.size})
              </Button>
            </>
          )}
        </div>
      }
    >
      {showConfirmation ? (
        /* Confirmation View */
        <div className="space-y-4">
          <div className="text-center py-2">
            <div className="text-lg font-semibold text-[#5d4e37] dark:text-[#e8d4b8]">
              Confirm Assignment
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Please review before confirming
            </div>
          </div>

          {/* Files summary */}
          <div className="bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-3">
            <div className="text-xs font-semibold text-[#8b6f47] dark:text-[#cd853f] mb-2">
              {files.length} FILE{files.length !== 1 ? "S" : ""} TO ASSIGN
            </div>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {files.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <FileText className="h-3.5 w-3.5 text-[#a0704b] dark:text-[#cd853f] flex-shrink-0" />
                  <span className="truncate">{formatFileName(file.path)}</span>
                  {file.pages && (
                    <span className="text-xs text-[#8b6f47] dark:text-[#cd853f] bg-[#f5ede3] dark:bg-[#3d3628] px-1.5 py-0.5 rounded">
                      p.{file.pages}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Sessions summary grouped by type */}
          <div className="bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-3">
            <div className="text-xs font-semibold text-[#8b6f47] dark:text-[#cd853f] mb-2">
              TO {selections.size} SESSION{selections.size !== 1 ? "S" : ""}
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {/* CW sessions */}
              {cwCount > 0 && (
                <div>
                  <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                    Classwork ({cwCount})
                  </div>
                  <div className="space-y-0.5 pl-2">
                    {selectionsList
                      .filter((s) => s.exerciseType === "CW")
                      .map((sel) => (
                        <div key={sel.sessionId} className="text-sm text-gray-700 dark:text-gray-300">
                          {sel.session.session_date} · {sel.session.time_slot?.split("-")[0]?.trim()} · {sel.session.student_name}
                        </div>
                      ))}
                  </div>
                </div>
              )}
              {/* HW sessions */}
              {hwCount > 0 && (
                <div>
                  <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
                    Homework ({hwCount})
                  </div>
                  <div className="space-y-0.5 pl-2">
                    {selectionsList
                      .filter((s) => s.exerciseType === "HW")
                      .map((sel) => (
                        <div key={sel.sessionId} className="text-sm text-gray-700 dark:text-gray-300">
                          {sel.session.session_date} · {sel.session.time_slot?.split("-")[0]?.trim()} · {sel.session.student_name}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Calendar Selection View */
        <div className="space-y-4">
          {/* Files to assign */}
          <div className="bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-3">
            <div className="text-xs font-semibold text-[#8b6f47] dark:text-[#cd853f] mb-2">
              FILES TO ASSIGN ({files.length})
            </div>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {files.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <FileText className="h-3.5 w-3.5 text-[#a0704b] dark:text-[#cd853f] flex-shrink-0" />
                  <span className="truncate">{formatFileName(file.path)}</span>
                  {file.pages && (
                    <span className="text-xs text-[#8b6f47] dark:text-[#cd853f] bg-[#f5ede3] dark:bg-[#3d3628] px-1.5 py-0.5 rounded">
                      p.{file.pages}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Location indicator */}
          <div className="text-xs text-[#8b6f47] dark:text-[#cd853f]">
            Location:{" "}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {selectedLocation || "All Locations"}
            </span>
          </div>

          {/* Calendar */}
        <div className="bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg overflow-hidden">
          {/* Month navigation */}
          <div className="flex items-center justify-between px-3 py-2 bg-[#fef9f3] dark:bg-[#2d2618] border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
            <Button
              variant="ghost"
              size="sm"
              onClick={goToPreviousMonth}
              className="h-7 px-2"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={goToToday}
                className="h-6 px-2 text-xs"
              >
                Today
              </Button>
              <span className="font-semibold text-[#5d4e37] dark:text-[#e8d4b8]">
                {getMonthName(viewDate)} {viewDate.getFullYear()}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={goToNextMonth}
              className="h-7 px-2"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[#a0704b] dark:text-[#cd853f]" />
              <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                Loading sessions...
              </span>
            </div>
          )}

          {/* Error state */}
          {loadError && (
            <div className="flex items-center justify-center py-8 text-red-500 text-sm">
              {loadError instanceof Error ? loadError.message : "Failed to load sessions"}
            </div>
          )}

          {/* Calendar grid */}
          {!isLoading && !loadError && (
            <>
              {/* Weekday headers */}
              <div className="grid grid-cols-7 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
                {WEEKDAY_NAMES.map((day, idx) => (
                  <div
                    key={day}
                    className={cn(
                      "py-1 px-1 text-center text-xs font-semibold bg-[#fef9f3] dark:bg-[#2d2618]",
                      idx > 0 && "border-l border-[#e8d4b8] dark:border-[#6b5a4a]",
                      (idx === 0 || idx === 6) &&
                        "text-[#a0704b]/70 dark:text-[#cd853f]/70"
                    )}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Days grid */}
              <div className="grid grid-cols-7">
                {calendarData.map((dayData, idx) => {
                  const dayOfWeek = dayData.date.getDay();
                  const isFirstCol = dayOfWeek === 0;

                  return (
                    <div
                      key={dayData.dateString}
                      onClick={() =>
                        handleDayClick(dayData.dateString, dayData.sessionCount)
                      }
                      className={cn(
                        "p-1.5 min-h-[60px] border-b border-[#e8d4b8] dark:border-[#6b5a4a] transition-colors",
                        !isFirstCol && "border-l",
                        !dayData.isCurrentMonth &&
                          "bg-gray-50 dark:bg-[#1f1f1f] opacity-40",
                        dayData.isCurrentMonth &&
                          dayData.sessionCount > 0 &&
                          "cursor-pointer hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]",
                        dayData.isToday &&
                          "ring-2 ring-inset ring-[#d4a574] dark:ring-[#cd853f]",
                        dayData.selectedCount > 0 &&
                          "bg-[#f5ede3] dark:bg-[#3d3628]"
                      )}
                    >
                      {/* Day number */}
                      <div
                        className={cn(
                          "text-xs font-semibold mb-0.5",
                          dayData.isToday &&
                            "text-[#a0704b] dark:text-[#cd853f]",
                          !dayData.isToday &&
                            dayData.isCurrentMonth &&
                            "text-[#5d4e37] dark:text-[#e8d4b8]",
                          dayData.isWeekend &&
                            dayData.isCurrentMonth &&
                            !dayData.isToday &&
                            "text-[#a0704b]/70 dark:text-[#cd853f]/70"
                        )}
                      >
                        {dayData.date.getDate()}
                      </div>

                      {/* Session count */}
                      {dayData.sessionCount > 0 && (
                        <div className="text-[10px] text-[#8b6f47] dark:text-[#cd853f]">
                          {dayData.sessionCount} session
                          {dayData.sessionCount !== 1 ? "s" : ""}
                          {dayData.selectedCount > 0 && (
                            <span className="ml-1 text-green-600 dark:text-green-400">
                              ({dayData.selectedCount} selected)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Selected sessions summary */}
        {selections.size > 0 && (
          <div className="bg-white dark:bg-[#1a1a1a] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-[#8b6f47] dark:text-[#cd853f]">
                SELECTED SESSIONS ({selections.size})
                {cwCount > 0 && hwCount > 0 && (
                  <span className="ml-2 font-normal">
                    {cwCount} CW, {hwCount} HW
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                onClick={() => setSelections(new Map())}
              >
                Clear All
              </Button>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {selectionsList.map((sel) => (
                <div
                  key={sel.sessionId}
                  className="flex items-center justify-between gap-2 text-sm py-1 px-2 bg-[#fef9f3] dark:bg-[#2d2618] rounded"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      onClick={() => updateExerciseType(sel.sessionId, sel.exerciseType === "CW" ? "HW" : "CW")}
                      className={cn(
                        "px-1.5 py-0.5 text-xs font-medium rounded transition-colors",
                        sel.exerciseType === "CW"
                          ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                      )}
                    >
                      {sel.exerciseType}
                    </button>
                    <span className="truncate text-gray-700 dark:text-gray-300">
                      {sel.session.student_name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {sel.session.session_date} {sel.session.time_slot?.split("-")[0]?.trim()}
                    </span>
                  </div>
                  <button
                    onClick={() => removeSelection(sel.sessionId)}
                    className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

          {/* Day session picker popover */}
          {selectedDayDate && (
            <SessionDayPicker
              date={selectedDayDate}
              sessions={sortedSelectedDaySessions}
              selections={selections}
              onToggle={toggleSession}
              onUpdateType={updateExerciseType}
              onSelectAll={selectAllForDay}
              onClearAll={clearSelectionsForDay}
              onClose={() => setSelectedDayDate(null)}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

// Day session picker component (popover-style)
interface SessionDayPickerProps {
  date: string;
  sessions: Session[];
  selections: Map<number, SessionSelection>;
  onToggle: (session: Session, exerciseType: "CW" | "HW") => void;
  onUpdateType: (sessionId: number, exerciseType: "CW" | "HW") => void;
  onSelectAll: (sessions: Session[], exerciseType: "CW" | "HW") => void;
  onClearAll: (sessions: Session[]) => void;
  onClose: () => void;
}

function SessionDayPicker({
  date,
  sessions,
  selections,
  onToggle,
  onUpdateType,
  onSelectAll,
  onClearAll,
  onClose,
}: SessionDayPickerProps) {
  const { selectedLocation } = useLocation();
  const [defaultType, setDefaultType] = useState<"CW" | "HW">("CW");
  const [filterTutorId, setFilterTutorId] = useState<number | "all">("all");
  const [showTutorDropdown, setShowTutorDropdown] = useState(false);

  // Popover state for session details
  const [openSessionId, setOpenSessionId] = useState<number | null>(null);
  const [popoverClickPosition, setPopoverClickPosition] = useState<{ x: number; y: number } | null>(null);

  // Parse date for display
  const dateObj = new Date(date + "T00:00:00");
  const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = dateObj.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Get unique tutors from sessions
  const tutors = useMemo(() => {
    const tutorMap = new Map<number, string>();
    sessions.forEach((s) => {
      if (s.tutor_id && s.tutor_name) {
        tutorMap.set(s.tutor_id, s.tutor_name);
      }
    });
    return Array.from(tutorMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => getTutorSortName(a.name).localeCompare(getTutorSortName(b.name)));
  }, [sessions]);

  // Filter sessions by tutor
  const filteredSessions = useMemo(() => {
    return filterTutorId === "all"
      ? sessions
      : sessions.filter((s) => s.tutor_id === filterTutorId);
  }, [sessions, filterTutorId]);

  // Group by time slot first, then by tutor within each slot
  const groupedByTimeSlot = useMemo(() => {
    // Group by time slot
    const byTimeSlot = groupSessionsByTimeSlot(filteredSessions);

    // Sort time slots chronologically
    const sortedTimeSlots = [...byTimeSlot.keys()].sort((a, b) => {
      const aTime = parseTimeSlot(a);
      const bTime = parseTimeSlot(b);
      return timeToMinutes(aTime.start) - timeToMinutes(bTime.start);
    });

    // Within each time slot, group by tutor and sort
    return sortedTimeSlots.map((timeSlot) => {
      const slotSessions = byTimeSlot.get(timeSlot) || [];

      // Group by tutor within this time slot
      const byTutor = new Map<string, Session[]>();
      slotSessions.forEach((s) => {
        const tutor = s.tutor_name || "";
        if (!byTutor.has(tutor)) byTutor.set(tutor, []);
        byTutor.get(tutor)!.push(s);
      });

      // Sort tutors alphabetically
      const sortedTutors = [...byTutor.keys()].sort((a, b) =>
        getTutorSortName(a).localeCompare(getTutorSortName(b))
      );

      // Flatten with tutor grouping preserved
      const orderedSessions: { session: Session; isFirstInTutor: boolean }[] = [];
      sortedTutors.forEach((tutorName, tutorIdx) => {
        const tutorSessions = byTutor.get(tutorName) || [];
        tutorSessions.forEach((session, idx) => {
          orderedSessions.push({
            session,
            isFirstInTutor: idx === 0 && tutorIdx > 0, // Show divider for 2nd+ tutor
          });
        });
      });

      return { timeSlot, sessions: orderedSessions };
    });
  }, [filteredSessions]);

  const selectedCount = filteredSessions.filter((s) => selections.has(s.id)).length;

  // Use Portal to render outside Modal (avoids transform constraints on fixed positioning)
  if (typeof document === "undefined") return null;

  const selectedTutorName = filterTutorId === "all"
    ? "All Tutors"
    : tutors.find((t) => t.id === filterTutorId)?.name || "Unknown";

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/20"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-[#fef9f3] dark:bg-[#2d2618] border-2 border-[#d4a574] dark:border-[#8b6f47] rounded-lg shadow-xl w-full max-w-[450px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          <div className="flex items-center gap-3">
            <div>
              <div className="font-semibold text-[#5d4e37] dark:text-[#e8d4b8]">
                {dayName}
              </div>
              <div className="text-xs text-[#8b6f47] dark:text-[#cd853f]">
                {monthDay} · {filteredSessions.length} sessions
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Tutor filter dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowTutorDropdown(!showTutorDropdown)}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                {filterTutorId === "all" ? (
                  <Users className="h-3 w-3 text-[#a0704b]" />
                ) : (
                  <User className="h-3 w-3 text-[#a0704b]" />
                )}
                <span className="max-w-[80px] truncate">{selectedTutorName}</span>
                <ChevronDown className={cn("h-3 w-3 transition-transform", showTutorDropdown && "rotate-180")} />
              </button>
              {showTutorDropdown && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-[#1a1a1a] border border-[#d4a574] dark:border-[#6b5a4a] rounded-md shadow-lg z-10 min-w-[150px] max-h-[200px] overflow-y-auto">
                  <button
                    onClick={() => { setFilterTutorId("all"); setShowTutorDropdown(false); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-800",
                      filterTutorId === "all" && "bg-gray-100 dark:bg-gray-800 font-medium"
                    )}
                  >
                    <Users className="h-3 w-3" />
                    All Tutors
                  </button>
                  {tutors.map((tutor) => (
                    <button
                      key={tutor.id}
                      onClick={() => { setFilterTutorId(tutor.id); setShowTutorDropdown(false); }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-800",
                        filterTutorId === tutor.id && "bg-gray-100 dark:bg-gray-800 font-medium"
                      )}
                    >
                      <User className="h-3 w-3" />
                      <span className="truncate">{tutor.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-[#e8d4b8] dark:hover:bg-[#4a3f2f] transition-colors"
            >
              <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredSessions.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-4 text-sm">
              No sessions {filterTutorId !== "all" ? "for this tutor " : ""}on this day
            </div>
          ) : (
            <div className="space-y-3">
              {groupedByTimeSlot.map(({ timeSlot, sessions: slotSessions }, slotIdx) => (
                <div key={timeSlot}>
                  {/* Time slot header */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono font-medium text-[#8b6f47] dark:text-[#cd853f] whitespace-nowrap">
                      {timeSlot}
                    </span>
                    <div className="flex-1 border-t border-[#d4a574] dark:border-[#6b5a4a]" />
                  </div>

                  {/* Sessions in this time slot */}
                  <div className="space-y-1">
                    {slotSessions.map(({ session, isFirstInTutor }) => {
                      const isSelected = selections.has(session.id);
                      const selection = selections.get(session.id);
                      const exerciseType = selection?.exerciseType || defaultType;

                      return (
                        <div key={session.id}>
                          {/* Tutor divider within time slot */}
                          {isFirstInTutor && filterTutorId === "all" && (
                            <div className="border-t border-dashed border-[#d4a574]/50 dark:border-[#8b6f47]/50 my-1.5" />
                          )}

                          <div
                            className={cn(
                              "group flex items-start gap-2 p-2 rounded-md transition-colors border border-transparent cursor-pointer",
                              isSelected
                                ? "bg-[#f5ede3] dark:bg-[#3d3628] border-[#d4a574] dark:border-[#8b6f47]"
                                : "hover:bg-[#fef9f3] dark:hover:bg-[#2d2618]"
                            )}
                            onClick={(e) => {
                              // Open popover on card click (not checkbox)
                              setPopoverClickPosition({ x: e.clientX, y: e.clientY });
                              setOpenSessionId(session.id);
                            }}
                          >
                            {/* Checkbox */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent popover from opening
                                onToggle(session, exerciseType);
                              }}
                              className={cn(
                                "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 mt-0.5",
                                isSelected
                                  ? "bg-[#a0704b] border-[#a0704b] dark:bg-[#cd853f] dark:border-[#cd853f]"
                                  : "border-[#d4a574] dark:border-[#8b6f47] hover:border-[#a0704b] dark:hover:border-[#cd853f]"
                              )}
                            >
                              {isSelected && <Check className="h-3 w-3 text-white" />}
                            </button>

                            {/* Session info - mimics MonthlyCalendarView SessionCard */}
                            <div className="flex-1 min-w-0">
                              {/* Top row: school_student_id */}
                              <div className="flex items-center justify-between text-[9px] text-gray-500 dark:text-gray-400 mb-0.5">
                                <span className="flex-shrink-0">
                                  {selectedLocation === "All Locations" && session.location && `${session.location}-`}
                                  {session.school_student_id || "N/A"}
                                </span>
                              </div>

                              {/* Middle row: student name + grade badge + school badge */}
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="font-semibold text-xs text-[#5d4e37] dark:text-[#e8d4b8] truncate">
                                  {session.student_name || "Unknown"}
                                </span>
                                {session.grade && (
                                  <span
                                    className="text-[8px] px-1 py-0.5 rounded text-gray-800 whitespace-nowrap"
                                    style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
                                  >
                                    {session.grade}{session.lang_stream || ""}
                                  </span>
                                )}
                                {session.school && (
                                  <span className="text-[8px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 whitespace-nowrap">
                                    {session.school}
                                  </span>
                                )}
                              </div>

                              {/* Bottom row: tutor name */}
                              <div className="text-[10px] text-[#8b6f47] dark:text-[#cd853f] truncate">
                                {session.tutor_name || "No tutor"}
                              </div>
                            </div>

                            {/* Exercise type toggle */}
                            {isSelected && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevent popover from opening
                                  onUpdateType(session.id, exerciseType === "CW" ? "HW" : "CW");
                                }}
                                className={cn(
                                  "px-2 py-0.5 text-xs font-medium rounded transition-colors flex-shrink-0",
                                  exerciseType === "CW"
                                    ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                    : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                                )}
                              >
                                {exerciseType}
                              </button>
                            )}

                            {/* Hover arrow - indicates clickable */}
                            <ChevronRight className="h-4 w-4 text-[#8b6f47] dark:text-[#cd853f] opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0 self-center" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {filteredSessions.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ebe0] dark:bg-[#251f15]">
            <div className="flex items-center gap-2">
              {/* Default type selector */}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Default:
              </span>
              <button
                onClick={() => setDefaultType("CW")}
                className={cn(
                  "px-2 py-0.5 text-xs font-medium rounded transition-colors",
                  defaultType === "CW"
                    ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                )}
              >
                CW
              </button>
              <button
                onClick={() => setDefaultType("HW")}
                className={cn(
                  "px-2 py-0.5 text-xs font-medium rounded transition-colors",
                  defaultType === "HW"
                    ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                    : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                )}
              >
                HW
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onClearAll(filteredSessions)}
              >
                Clear
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onSelectAll(filteredSessions, defaultType)}
              >
                Select All
              </Button>
            </div>
          </div>
        )}

        {/* Session detail popover */}
        {openSessionId !== null && (() => {
          const session = filteredSessions.find((s) => s.id === openSessionId);
          if (!session) return null;
          return (
            <SessionDetailPopover
              session={session}
              isOpen={true}
              onClose={() => setOpenSessionId(null)}
              clickPosition={popoverClickPosition}
            />
          );
        })()}
      </div>
    </div>,
    document.body
  );
}
