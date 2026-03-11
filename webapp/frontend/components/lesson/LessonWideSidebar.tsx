"use client";

import { useState, useMemo } from "react";
import {
  PenTool, BookOpen, ChevronDown, Pencil, Plus, FileX,
  Users, FileStack, User, Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDisplayName } from "@/lib/exercise-utils";
import { getPageLabel, getStudentIdDisplay } from "@/lib/lesson-utils";
import { getGradeColor } from "@/lib/constants";
import { motion, AnimatePresence } from "framer-motion";
import type { Session, SessionExercise } from "@/types";
import type { StudentExerciseEntry, FileGroup } from "./LessonWideMode";

interface LessonWideSidebarProps {
  sessions: Session[];
  students: Session[];
  fileGroups: FileGroup[];
  allEntries: StudentExerciseEntry[];
  sidebarMode: "by-student" | "by-file";
  onSidebarModeChange: (mode: "by-student" | "by-file") => void;
  selectedEntry: StudentExerciseEntry | null;
  onEntrySelect: (entry: StudentExerciseEntry) => void;
  onEditExercises: (session: Session, type: "CW" | "HW") => void;
  isReadOnly?: boolean;
  hasAnnotations?: (exerciseId: number) => boolean;
  selectedLocation: string;
  onPrint?: (entry: StudentExerciseEntry) => void;
  onPrintFileGroup?: (group: FileGroup) => void;
}

// --- By-Student mode components ---

function StudentExerciseItem({
  entry,
  isSelected,
  onClick,
  hasAnnotations,
  onPrint,
}: {
  entry: StudentExerciseEntry;
  isSelected: boolean;
  onClick: () => void;
  hasAnnotations?: boolean;
  onPrint?: (entry: StudentExerciseEntry) => void;
}) {
  const displayName = getDisplayName(entry.exercise.pdf_name);
  const pageLabel = getPageLabel(entry.exercise);

  return (
    <div
      onClick={onClick}
      className={cn(
        "w-full text-left px-2.5 py-2 rounded-md transition-all text-sm group cursor-pointer",
        "border border-transparent min-h-[44px] md:min-h-0",
        isSelected
          ? "bg-[#f5e6d0] dark:bg-[#3d3020] border-[#d4a574] dark:border-[#8b6f47] shadow-sm"
          : "hover:bg-[#faf3e8] dark:hover:bg-[#2a2318] hover:border-[#e8d4b8]/50 dark:hover:border-[#5a4d3a]/50"
      )}
    >
      <div className="flex items-start gap-1.5 min-w-0">
        <div className="flex-1 min-w-0">
          <div className={cn(
            "truncate font-medium",
            isSelected ? "text-[#6b4c30] dark:text-[#d4a574]" : "text-gray-700 dark:text-gray-300"
          )}>
            {entry.exercise.pdf_name ? displayName : "(no file)"}
          </div>
          {pageLabel && (
            <span className="text-[10px] text-[#a0906e] dark:text-[#8a7a60]">{pageLabel}</span>
          )}
        </div>
        {entry.exercise.pdf_name && onPrint && (
          <button
            onClick={(e) => { e.stopPropagation(); onPrint(entry); }}
            className="p-1 rounded hover:bg-[#e8d4b8]/50 dark:hover:bg-[#3a3228] transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
            title="Print"
          >
            <Printer className="h-3 w-3 text-[#a0906e] dark:text-[#8a7a60]" />
          </button>
        )}
        {hasAnnotations && (
          <span className="w-2 h-2 rounded-full bg-[#a0704b] mt-1.5 flex-shrink-0" title="Has annotations" />
        )}
      </div>
    </div>
  );
}

function StudentBlock({
  session,
  entries,
  selectedEntry,
  onEntrySelect,
  onEditExercises,
  isReadOnly,
  hasAnnotations,
  selectedLocation,
  defaultExpanded,
  onPrint,
}: {
  session: Session;
  entries: StudentExerciseEntry[];
  selectedEntry: StudentExerciseEntry | null;
  onEntrySelect: (entry: StudentExerciseEntry) => void;
  onEditExercises: (session: Session, type: "CW" | "HW") => void;
  isReadOnly?: boolean;
  hasAnnotations?: (exerciseId: number) => boolean;
  selectedLocation: string;
  defaultExpanded: boolean;
  onPrint?: (entry: StudentExerciseEntry) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const studentId = getStudentIdDisplay(session, selectedLocation);

  const cwEntries = useMemo(
    () => entries.filter(e => e.exercise.exercise_type === "CW" || e.exercise.exercise_type === "Classwork"),
    [entries]
  );
  const hwEntries = useMemo(
    () => entries.filter(e => e.exercise.exercise_type === "HW" || e.exercise.exercise_type === "Homework"),
    [entries]
  );

  return (
    <div>
      <button
        onClick={() => setExpanded(e => !e)}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors min-h-[44px] md:min-h-0",
          "hover:bg-[#f0e6d4]/60 dark:hover:bg-[#252018]/60"
        )}
      >
        <div className={cn("transition-transform", expanded ? "rotate-0" : "-rotate-90")}>
          <ChevronDown className="h-3.5 w-3.5 text-[#a0906e] dark:text-[#8a7a60]" />
        </div>
        <User className="h-3.5 w-3.5 text-[#a0906e] dark:text-[#8a7a60]" />
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {studentId && (
            <span className="text-[10px] font-mono text-[#a0906e] dark:text-[#8a7a60]">{studentId}</span>
          )}
          <span className="text-xs font-semibold text-[#6b5a42] dark:text-[#c4a882] truncate">
            {session.student_name}
          </span>
          {session.grade && (
            <span
              className="text-[9px] px-1 py-0.5 rounded font-medium text-gray-800 flex-shrink-0"
              style={{ backgroundColor: getGradeColor(session.grade, session.lang_stream) }}
            >
              {session.grade}{session.lang_stream || ""}
            </span>
          )}
        </div>
        <span className="text-[10px] text-[#b0a090] dark:text-[#706050] tabular-nums">
          {entries.length}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pl-3 pr-1 pt-1 pb-2 flex flex-col gap-3 border-l-2 border-[#e8d4b8] dark:border-[#3a3228] ml-4">
              {cwEntries.length > 0 && (
                <ExerciseTypeSection
                  label="Classwork"
                  icon={PenTool}
                  iconColor="text-rose-500 dark:text-rose-400"
                  entries={cwEntries}
                  selectedEntry={selectedEntry}
                  onEntrySelect={onEntrySelect}
                  onEdit={() => onEditExercises(session, "CW")}
                  isReadOnly={isReadOnly}
                  hasAnnotations={hasAnnotations}
                  onPrint={onPrint}
                />
              )}
              {hwEntries.length > 0 && (
                <ExerciseTypeSection
                  label="Homework"
                  icon={BookOpen}
                  iconColor="text-blue-500 dark:text-blue-400"
                  entries={hwEntries}
                  selectedEntry={selectedEntry}
                  onEntrySelect={onEntrySelect}
                  onEdit={() => onEditExercises(session, "HW")}
                  isReadOnly={isReadOnly}
                  hasAnnotations={hasAnnotations}
                  onPrint={onPrint}
                />
              )}
              {cwEntries.length === 0 && hwEntries.length === 0 && (
                <p className="text-xs text-[#b0a090] dark:text-[#706050] italic text-center py-2">
                  No exercises assigned
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ExerciseTypeSection({
  label,
  icon: Icon,
  iconColor,
  entries,
  selectedEntry,
  onEntrySelect,
  onEdit,
  isReadOnly,
  hasAnnotations,
  onPrint,
}: {
  label: string;
  icon: typeof PenTool;
  iconColor: string;
  entries: StudentExerciseEntry[];
  selectedEntry: StudentExerciseEntry | null;
  onEntrySelect: (entry: StudentExerciseEntry) => void;
  onEdit: () => void;
  isReadOnly?: boolean;
  hasAnnotations?: (exerciseId: number) => boolean;
  onPrint?: (entry: StudentExerciseEntry) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Icon className={cn("h-3.5 w-3.5", iconColor)} />
          <span className="text-xs font-semibold text-[#8b7355] dark:text-[#a09080] uppercase tracking-wider">
            {label}
          </span>
          <span className="text-[10px] text-[#b0a090] dark:text-[#706050]">({entries.length})</span>
        </div>
        {!isReadOnly && (
          <button
            onClick={onEdit}
            className="p-1 rounded hover:bg-[#e8d4b8]/50 dark:hover:bg-[#3a3228] transition-colors"
            title={`Edit ${label}`}
          >
            <Pencil className="h-3 w-3 text-[#a0906e] dark:text-[#8a7a60]" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {entries.map((entry) => (
          <StudentExerciseItem
            key={entry.exercise.id}
            entry={entry}
            isSelected={
              selectedEntry?.exercise.id === entry.exercise.id &&
              selectedEntry?.session.id === entry.session.id
            }
            onClick={() => onEntrySelect(entry)}
            hasAnnotations={hasAnnotations?.(entry.exercise.id)}
            onPrint={onPrint}
          />
        ))}
      </div>
    </div>
  );
}

// --- By-File mode components ---

function FileGroupItem({
  group,
  selectedEntry,
  onEntrySelect,
  hasAnnotations,
  selectedLocation,
  onPrint,
  onPrintFileGroup,
}: {
  group: FileGroup;
  selectedEntry: StudentExerciseEntry | null;
  onEntrySelect: (entry: StudentExerciseEntry) => void;
  hasAnnotations?: (exerciseId: number) => boolean;
  selectedLocation: string;
  onPrint?: (entry: StudentExerciseEntry) => void;
  onPrintFileGroup?: (group: FileGroup) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      {/* File header */}
      <div className="flex items-center group">
        <button
          onClick={() => setExpanded(e => !e)}
          className={cn(
            "flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left transition-colors min-h-[36px] md:min-h-0 min-w-0",
            "hover:bg-[#f0e6d4]/60 dark:hover:bg-[#252018]/60"
          )}
        >
          <div className={cn("transition-transform flex-shrink-0", expanded ? "rotate-0" : "-rotate-90")}>
            <ChevronDown className="h-3 w-3 text-[#a0906e] dark:text-[#8a7a60]" />
          </div>
          <span className="text-xs font-medium text-[#6b5a42] dark:text-[#c4a882] truncate flex-1">
            {group.displayName}
          </span>
          <span className="text-[10px] text-[#b0a090] dark:text-[#706050] tabular-nums flex-shrink-0">
            {group.entries.length}
          </span>
        </button>
        {onPrintFileGroup && group.entries.length > 0 && (
          <button
            onClick={() => onPrintFileGroup(group)}
            className="p-1 mr-1 rounded hover:bg-[#e8d4b8]/50 dark:hover:bg-[#3a3228] transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
            title={`Print for all ${group.entries.length} students`}
          >
            <Printer className="h-3 w-3 text-[#a0906e] dark:text-[#8a7a60]" />
          </button>
        )}
      </div>

      {/* Student entries */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="pl-5 pr-1 flex flex-col gap-0.5 pb-1">
              {group.entries.map((entry) => {
                const isSelected =
                  selectedEntry?.exercise.id === entry.exercise.id &&
                  selectedEntry?.session.id === entry.session.id;
                const studentId = getStudentIdDisplay(entry.session, selectedLocation);
                const pageLabel = getPageLabel(entry.exercise);
                const hasAnno = hasAnnotations?.(entry.exercise.id);

                return (
                  <div
                    key={`${entry.session.id}-${entry.exercise.id}`}
                    onClick={() => onEntrySelect(entry)}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded-md transition-all text-xs group cursor-pointer",
                      "border border-transparent min-h-[36px] md:min-h-0",
                      isSelected
                        ? "bg-[#f5e6d0] dark:bg-[#3d3020] border-[#d4a574] dark:border-[#8b6f47] shadow-sm"
                        : "hover:bg-[#faf3e8] dark:hover:bg-[#2a2318]"
                    )}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <User className="h-3 w-3 text-[#a0906e] dark:text-[#8a7a60] flex-shrink-0" />
                      {studentId && (
                        <span className="text-[10px] font-mono text-[#a0906e] dark:text-[#8a7a60]">{studentId}</span>
                      )}
                      <span className={cn(
                        "truncate font-medium",
                        isSelected ? "text-[#6b4c30] dark:text-[#d4a574]" : "text-gray-700 dark:text-gray-300"
                      )}>
                        {entry.studentName}
                      </span>
                      {entry.grade && (
                        <span
                          className="text-[8px] px-1 py-0.5 rounded font-medium text-gray-800 flex-shrink-0"
                          style={{ backgroundColor: getGradeColor(entry.grade, entry.langStream) }}
                        >
                          {entry.grade}
                        </span>
                      )}
                      {pageLabel && (
                        <span className="text-[10px] text-[#b0a090] dark:text-[#706050] flex-shrink-0">
                          {pageLabel}
                        </span>
                      )}
                      <div className="flex-1" />
                      {entry.exercise.pdf_name && onPrint && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onPrint(entry); }}
                          className="p-0.5 rounded hover:bg-[#e8d4b8]/50 dark:hover:bg-[#3a3228] transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                          title="Print"
                        >
                          <Printer className="h-3 w-3 text-[#a0906e] dark:text-[#8a7a60]" />
                        </button>
                      )}
                      {hasAnno && (
                        <span className="w-2 h-2 rounded-full bg-[#a0704b] flex-shrink-0" title="Has annotations" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Main sidebar ---

export function LessonWideSidebar({
  sessions,
  students,
  fileGroups,
  allEntries,
  sidebarMode,
  onSidebarModeChange,
  selectedEntry,
  onEntrySelect,
  onEditExercises,
  isReadOnly,
  hasAnnotations,
  selectedLocation,
  onPrint,
  onPrintFileGroup,
}: LessonWideSidebarProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
        <FileX className="h-8 w-8 text-[#c4a882]" />
        <p className="text-sm text-[#8b7355] dark:text-[#a09080]">No sessions in this slot</p>
      </div>
    );
  }

  // Group file groups by type for by-file view
  const cwFileGroups = useMemo(() => fileGroups.filter(g => g.exerciseType === "CW"), [fileGroups]);
  const hwFileGroups = useMemo(() => fileGroups.filter(g => g.exerciseType === "HW"), [fileGroups]);

  return (
    <div className="flex flex-col h-full">
      {/* Mode toggle (visible on mobile too since header toggle is desktop-only) */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[#e8d4b8] dark:border-[#3a3228]">
        <button
          onClick={() => onSidebarModeChange("by-student")}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors",
            sidebarMode === "by-student"
              ? "bg-[#e8d4b8] dark:bg-[#3a3228] text-[#6b4c30] dark:text-[#d4a574]"
              : "text-[#8b7355] dark:text-[#a09080] hover:bg-[#f0e6d4]/60 dark:hover:bg-[#252018]/60"
          )}
        >
          <Users className="h-3 w-3" />
          Students
        </button>
        <button
          onClick={() => onSidebarModeChange("by-file")}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors",
            sidebarMode === "by-file"
              ? "bg-[#e8d4b8] dark:bg-[#3a3228] text-[#6b4c30] dark:text-[#d4a574]"
              : "text-[#8b7355] dark:text-[#a09080] hover:bg-[#f0e6d4]/60 dark:hover:bg-[#252018]/60"
          )}
        >
          <FileStack className="h-3 w-3" />
          Files
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto py-2 px-1">
        {sidebarMode === "by-student" ? (
          // By-student mode: one block per student
          <div className="flex flex-col gap-1">
            {students.map((session) => {
              const studentEntries = allEntries.filter(e => e.session.id === session.id);
              return (
                <StudentBlock
                  key={session.id}
                  session={session}
                  entries={studentEntries}
                  selectedEntry={selectedEntry}
                  onEntrySelect={onEntrySelect}
                  onEditExercises={onEditExercises}
                  isReadOnly={isReadOnly}
                  hasAnnotations={hasAnnotations}
                  selectedLocation={selectedLocation}
                  defaultExpanded
                  onPrint={onPrint}
                />
              );
            })}
          </div>
        ) : (
          // By-file mode: CW files then HW files
          <div className="flex flex-col gap-2">
            {cwFileGroups.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 px-2 mb-1">
                  <PenTool className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400" />
                  <span className="text-xs font-semibold text-[#8b7355] dark:text-[#a09080] uppercase tracking-wider">
                    Classwork
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {cwFileGroups.map((group) => (
                    <FileGroupItem
                      key={group.pdfName}
                      group={group}
                      selectedEntry={selectedEntry}
                      onEntrySelect={onEntrySelect}
                      hasAnnotations={hasAnnotations}
                      selectedLocation={selectedLocation}
                      onPrint={onPrint}
                      onPrintFileGroup={onPrintFileGroup}
                    />
                  ))}
                </div>
              </div>
            )}
            {hwFileGroups.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 px-2 mb-1">
                  <BookOpen className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                  <span className="text-xs font-semibold text-[#8b7355] dark:text-[#a09080] uppercase tracking-wider">
                    Homework
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {hwFileGroups.map((group) => (
                    <FileGroupItem
                      key={group.pdfName}
                      group={group}
                      selectedEntry={selectedEntry}
                      onEntrySelect={onEntrySelect}
                      hasAnnotations={hasAnnotations}
                      selectedLocation={selectedLocation}
                      onPrint={onPrint}
                      onPrintFileGroup={onPrintFileGroup}
                    />
                  ))}
                </div>
              </div>
            )}
            {cwFileGroups.length === 0 && hwFileGroups.length === 0 && (
              <p className="text-xs text-[#b0a090] dark:text-[#706050] italic text-center py-4">
                No exercises assigned
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
