"use client";

import { useState, useMemo, useCallback, type ComponentProps } from "react";
import {
  PenTool, BookOpen, ChevronDown, Pencil, Plus, FileX,
  Users, FileStack, User, ChevronsDownUp, ChevronsUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getExerciseDisplayName } from "@/lib/exercise-utils";
import { UrlBadge, YouTubeThumbnail } from "@/components/ui/url-badge";
import { getPageLabel, getStudentIdDisplay, getPrintButtonTitle, type PrintingState } from "@/lib/lesson-utils";
import { motion, AnimatePresence } from "framer-motion";
import { SummerCoursewareWidePanel } from "./SummerCoursewareWidePanel";
import { StudentPickerPopover } from "./StudentPickerPopover";
import { EditableLessonNumberBadge, useSaveLessonNumber } from "@/components/sessions/EditableLessonNumberBadge";
import { SessionLessonBadge } from "@/components/sessions/LessonNumberBadge";
import type { Session, HomeworkCompletion } from "@/types";
import type { StudentExerciseEntry, FileGroup } from "./LessonWideMode";
import { GradeBadge } from "@/components/ui/grade-label";
import { HomeworkCheckSection } from "@/components/homework/HomeworkCheckSection";
import { CheckViewerProvider } from "@/components/homework/CheckViewerProvider";
import { slotCheckItems } from "@/lib/homework-check";
import { PrintIconButton } from "./PrintIconButton";
import { WithSchoolIfItFits } from "./SchoolBadge";
import { LessonDraftRow, type LessonDraftEntry } from "./LessonDraftRow";

interface LessonWideSidebarProps {
  sessions: Session[];
  students: Session[];
  fileGroups: FileGroup[];
  allEntries: StudentExerciseEntry[];
  sidebarMode: "by-student" | "by-file";
  onSidebarModeChange: (mode: "by-student" | "by-file") => void;
  selectedEntry: StudentExerciseEntry | null;
  onEntrySelect: (entry: StudentExerciseEntry) => void;
  /** Opens a student from their name, on the worksheet the view picks for them. */
  onStudentOpen: (session: Session) => void;
  onEditExercises: (session: Session, type: "CW" | "HW") => void;
  isReadOnly?: boolean;
  hasAnnotations?: (exerciseId: number) => boolean;
  selectedLocation: string;
  onPrint?: (entry: StudentExerciseEntry) => void;
  onPrintFileGroup?: (group: FileGroup) => void;
  onBulkPrintStudent?: (session: Session, type: 'CW' | 'HW') => void;
  onBulkAssign?: (type: "CW" | "HW", sessionIds?: number[]) => void;
  /** Bundled printing state: which exercise ID is printing + progress message. */
  printing?: PrintingState;
  /** Homework carried in from earlier lessons, keyed by session. */
  homeworkBySession?: Map<number, HomeworkCompletion[]>;
  onHomeworkMarked?: (updated: HomeworkCompletion) => void;
  /** The slot's own Draft, for its row above the exercises. Leave it out where it can't open, such as on a phone. */
  lessonDraft?: LessonDraftEntry;
}

/** A file's block is the file and its type, because one file can be both classwork and homework. */
const fileGroupKey = (group: FileGroup) => `${group.exerciseType}:${group.pdfName}`;

/** A copy of the folded blocks with one block folded away or opened. */
function withFolded<K>(folded: ReadonlySet<K>, key: K, fold: boolean): ReadonlySet<K> {
  const next = new Set(folded);
  if (fold) next.add(key);
  else next.delete(key);
  return next;
}

// --- By-Student mode components ---

function StudentExerciseItem({
  entry,
  isSelected,
  onClick,
  hasAnnotations,
  onPrint,
  isPrinting,
  printProgress,
}: {
  entry: StudentExerciseEntry;
  isSelected: boolean;
  onClick: () => void;
  hasAnnotations?: boolean;
  onPrint?: (entry: StudentExerciseEntry) => void;
  isPrinting?: boolean;
  printProgress?: string | null;
}) {
  const displayName = getExerciseDisplayName(entry.exercise);
  const pageLabel = getPageLabel(entry.exercise);

  return (
    <div className="group/row flex items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        aria-current={isSelected || undefined}
        className={cn(
          "flex-1 min-w-0 text-left px-2.5 py-2 rounded-md transition-all text-sm",
          "border border-transparent min-h-10",
          isSelected
            ? "bg-[#f5e6d0] dark:bg-[#3d3020] border-[#d4a574] dark:border-[#8b6f47] shadow-sm"
            : "hover:bg-[#faf3e8] dark:hover:bg-[#2a2318] hover:border-[#e8d4b8]/50 dark:hover:border-[#5a4d3a]/50"
        )}
      >
        <div className="flex items-start gap-1.5 min-w-0">
          {entry.exercise.url && !entry.exercise.pdf_name && (
            <YouTubeThumbnail url={entry.exercise.url} fallbackIcon={null} />
          )}
          <div className="flex-1 min-w-0">
            <div className={cn(
              "truncate font-medium",
              isSelected ? "text-[#6b4c30] dark:text-[#d4a574]" : "text-gray-700 dark:text-gray-300"
            )}>
              {(entry.exercise.pdf_name || entry.exercise.url) ? displayName : "(no file)"}
              <UrlBadge url={entry.exercise.url} />
            </div>
            {pageLabel && (
              <span className="text-[10px] text-[#a0906e] dark:text-[#8a7a60]">{pageLabel}</span>
            )}
          </div>
          {hasAnnotations && (
            <span className="w-2 h-2 rounded-full bg-[#a0704b] mt-1.5 flex-shrink-0" title="Has annotations" />
          )}
        </div>
      </button>
      {entry.exercise.pdf_name && onPrint && (
        <PrintIconButton
          onPrint={() => onPrint(entry)}
          isPrinting={!!isPrinting}
          title={getPrintButtonTitle(!!isPrinting, printProgress, "Print")}
          label={`Print ${displayName}`}
          revealOnHover
        />
      )}
    </div>
  );
}

function StudentBlock({
  session,
  entries,
  selectedEntry,
  onEntrySelect,
  onStudentOpen,
  onEditExercises,
  isReadOnly,
  hasAnnotations,
  selectedLocation,
  expanded,
  onExpandedChange,
  onPrint,
  onBulkPrintStudent,
  printing,
  homework,
  onHomeworkMarked,
}: {
  session: Session;
  entries: StudentExerciseEntry[];
  selectedEntry: StudentExerciseEntry | null;
  onEntrySelect: (entry: StudentExerciseEntry) => void;
  onStudentOpen: (session: Session) => void;
  onEditExercises: (session: Session, type: "CW" | "HW") => void;
  isReadOnly?: boolean;
  hasAnnotations?: (exerciseId: number) => boolean;
  selectedLocation: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onPrint?: (entry: StudentExerciseEntry) => void;
  onBulkPrintStudent?: (session: Session, type: 'CW' | 'HW') => void;
  printing?: PrintingState;
  homework: HomeworkCompletion[];
  onHomeworkMarked?: (updated: HomeworkCompletion) => void;
}) {
  const studentId = getStudentIdDisplay(session, selectedLocation);
  const isBulkPrinting = printing?.id === -session.id;
  const saveLessonNumber = useSaveLessonNumber(session.id);

  const cwEntries = useMemo(
    () => entries.filter(e => e.exercise.exercise_type === "CW" || e.exercise.exercise_type === "Classwork"),
    [entries]
  );
  const hwEntries = useMemo(
    () => entries.filter(e => e.exercise.exercise_type === "HW" || e.exercise.exercise_type === "Homework"),
    [entries]
  );

  // Tapping the name means "go to this student" at the board, so it opens
  // them. Only the chevron folds their list away.
  const open = () => {
    onStudentOpen(session);
    onExpandedChange(true);
  };

  return (
    <div>
      {/* The student's number, name, grade and language are what the pane is
          grouped by, so they sit on a tinted band in the largest text here.
          Their school follows whenever there's room for all of it. */}
      <div className="flex items-center rounded-md bg-[#f0e6d4] dark:bg-[#252018]">
        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse" : "Expand"}
          className="flex-none w-8 h-10 grid place-items-center rounded-l-md hover:bg-[#e8d4b8]/70 dark:hover:bg-[#3a3228] transition-colors"
        >
          <ChevronDown className={cn("h-4 w-4 text-[#a0906e] dark:text-[#8a7a60] transition-transform", !expanded && "-rotate-90")} />
        </button>
        {/* div, not button: the lesson badge nests its own button/input. */}
        <div
          role="button"
          tabIndex={0}
          onClick={open}
          onKeyDown={(e) => {
            // Only open for keys on the row itself, not the badge input.
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              open();
            }
          }}
          className={cn(
            "flex-1 flex items-center gap-1.5 pr-2 py-1.5 rounded-r-md text-left transition-colors min-h-10 min-w-0 cursor-pointer",
            "hover:bg-[#e8d4b8]/70 dark:hover:bg-[#3a3228]"
          )}
        >
          <WithSchoolIfItFits school={session.school} lineClass="h-5" className="flex-1 gap-x-1.5" badgeClassName="text-[10px] leading-4 py-0.5">
            {studentId && (
              <span className="text-xs font-mono text-[#8b7355] dark:text-[#a09080] whitespace-nowrap flex-shrink-0">{studentId}</span>
            )}
            <span className="text-sm font-bold text-[#4a3520] dark:text-[#e8d4b8] truncate">
              {session.student_name}
            </span>
            {session.grade && (
              <GradeBadge className="text-[10px] px-1 py-0.5 rounded font-medium text-gray-800 flex-shrink-0" grade={session.grade} langStream={session.lang_stream} />
            )}
          </WithSchoolIfItFits>
          {/* The badge puts its class on the badge inside its own button, so a span pushes it to the right edge. */}
          <span className="ml-auto flex-none">
            <EditableLessonNumberBadge
              lessonNumber={session.lesson_number}
              movedLessonNumber={session.moved_lesson_number}
              size="xs"
              disabled={isReadOnly}
              onSave={saveLessonNumber}
            />
          </span>
        </div>
      </div>

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
              {/* Last lesson's homework comes first: it is the thing to settle
                  before starting on today's work. */}
              {homework.length > 0 && (
                <HomeworkCheckSection
                  sessionId={session.id}
                  items={homework}
                  isReadOnly={isReadOnly}
                  onMarked={onHomeworkMarked}
                />
              )}
              {cwEntries.length > 0 && (
                <ExerciseTypeSection
                  label="Classwork"
                  icon={PenTool}
                  iconColor="text-rose-500 dark:text-rose-400"
                  printAll={onBulkPrintStudent && {
                    onPrint: () => onBulkPrintStudent(session, 'CW'),
                    isPrinting: isBulkPrinting,
                    title: getPrintButtonTitle(isBulkPrinting, printing?.progress, `Print all CW (${cwEntries.length})`),
                    label: `Print all CW for ${session.student_name}`,
                    iconClassName: "text-rose-400 dark:text-rose-300",
                  }}
                  entries={cwEntries}
                  selectedEntry={selectedEntry}
                  onEntrySelect={onEntrySelect}
                  onEdit={() => onEditExercises(session, "CW")}
                  isReadOnly={isReadOnly}
                  hasAnnotations={hasAnnotations}
                  onPrint={onPrint}
                  printing={printing}
                />
              )}
              {hwEntries.length > 0 && (
                <ExerciseTypeSection
                  label="Homework"
                  icon={BookOpen}
                  iconColor="text-blue-500 dark:text-blue-400"
                  printAll={onBulkPrintStudent && {
                    onPrint: () => onBulkPrintStudent(session, 'HW'),
                    isPrinting: isBulkPrinting,
                    title: getPrintButtonTitle(isBulkPrinting, printing?.progress, `Print all HW (${hwEntries.length})`),
                    label: `Print all HW for ${session.student_name}`,
                    iconClassName: "text-blue-400 dark:text-blue-300",
                  }}
                  entries={hwEntries}
                  selectedEntry={selectedEntry}
                  onEntrySelect={onEntrySelect}
                  onEdit={() => onEditExercises(session, "HW")}
                  isReadOnly={isReadOnly}
                  hasAnnotations={hasAnnotations}
                  onPrint={onPrint}
                  printing={printing}
                />
              )}
              {cwEntries.length === 0 && hwEntries.length === 0 && homework.length === 0 && (
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
  printAll,
  entries,
  selectedEntry,
  onEntrySelect,
  onEdit,
  isReadOnly,
  hasAnnotations,
  onPrint,
  printing,
}: {
  label: string;
  icon: typeof PenTool;
  iconColor: string;
  /** The heading's button that prints every exercise in the section for this student. */
  printAll?: ComponentProps<typeof PrintIconButton>;
  entries: StudentExerciseEntry[];
  selectedEntry: StudentExerciseEntry | null;
  onEntrySelect: (entry: StudentExerciseEntry) => void;
  onEdit: () => void;
  isReadOnly?: boolean;
  hasAnnotations?: (exerciseId: number) => boolean;
  onPrint?: (entry: StudentExerciseEntry) => void;
  printing?: PrintingState;
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
        <div className="flex items-center gap-0.5">
          {printAll && <PrintIconButton {...printAll} />}
          {!isReadOnly && (
            <button
              onClick={onEdit}
              className="w-8 h-8 grid place-items-center rounded-md hover:bg-[#e8d4b8]/60 dark:hover:bg-[#3a3228] transition-colors"
              title={`Edit ${label}`}
              aria-label={`Edit ${label}`}
            >
              <Pencil className="h-3.5 w-3.5 text-[#a0906e] dark:text-[#8a7a60]" />
            </button>
          )}
        </div>
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
            isPrinting={printing?.id === entry.exercise.id}
            printProgress={printing?.id === entry.exercise.id ? printing.progress : undefined}
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
  printing,
  expanded,
  onExpandedChange,
}: {
  group: FileGroup;
  selectedEntry: StudentExerciseEntry | null;
  onEntrySelect: (entry: StudentExerciseEntry) => void;
  hasAnnotations?: (exerciseId: number) => boolean;
  selectedLocation: string;
  onPrint?: (entry: StudentExerciseEntry) => void;
  onPrintFileGroup?: (group: FileGroup) => void;
  printing?: PrintingState;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const isGroupPrinting = printing?.id === -2;

  return (
    <div>
      {/* File header */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onExpandedChange(!expanded)}
          aria-expanded={expanded}
          className={cn(
            "flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-md text-left transition-colors min-h-10 min-w-0",
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
          <PrintIconButton
            onPrint={() => onPrintFileGroup(group)}
            isPrinting={isGroupPrinting}
            title={getPrintButtonTitle(isGroupPrinting, printing?.progress, `Print for all ${group.entries.length} students`)}
            label={`Print ${group.displayName} for all ${group.entries.length} students`}
            iconClassName={group.exerciseType === "CW" ? "text-rose-400 dark:text-rose-300" : "text-blue-400 dark:text-blue-300"}
          />
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

                const isEntryPrinting = printing?.id === entry.exercise.id;

                return (
                  <div key={`${entry.session.id}-${entry.exercise.id}`} className="group/row flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEntrySelect(entry)}
                      aria-current={isSelected || undefined}
                      className={cn(
                        "flex-1 min-w-0 text-left px-2 py-1.5 rounded-md transition-all text-xs",
                        "border border-transparent min-h-10",
                        isSelected
                          ? "bg-[#f5e6d0] dark:bg-[#3d3020] border-[#d4a574] dark:border-[#8b6f47] shadow-sm"
                          : "hover:bg-[#faf3e8] dark:hover:bg-[#2a2318]"
                      )}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {/* The school takes whatever room is left, which puts the lesson and pages at the right end. */}
                        <WithSchoolIfItFits school={entry.session.school} lineClass="h-5" className="flex-1 gap-x-1.5" badgeClassName="text-[10px] leading-4 py-0.5">
                          <User className="h-3 w-3 text-[#a0906e] dark:text-[#8a7a60] flex-shrink-0" />
                          {studentId && (
                            <span className="text-[10px] font-mono text-[#a0906e] dark:text-[#8a7a60] whitespace-nowrap flex-shrink-0">{studentId}</span>
                          )}
                          <span className={cn(
                            "truncate font-medium",
                            isSelected ? "text-[#6b4c30] dark:text-[#d4a574]" : "text-gray-700 dark:text-gray-300"
                          )}>
                            {entry.studentName}
                          </span>
                          <GradeBadge
                            className="text-[8px] px-1 py-0.5 rounded font-medium text-gray-800 flex-shrink-0"
                            grade={entry.grade}
                            langStream={entry.langStream}
                          />
                        </WithSchoolIfItFits>
                        <SessionLessonBadge session={entry.session} size="xs" className="flex-shrink-0" />
                        {pageLabel && (
                          <span className="text-[10px] text-[#b0a090] dark:text-[#706050] flex-shrink-0">
                            {pageLabel}
                          </span>
                        )}
                        {hasAnno && (
                          <span className="w-2 h-2 rounded-full bg-[#a0704b] flex-shrink-0" title="Has annotations" />
                        )}
                      </div>
                    </button>
                    {entry.exercise.pdf_name && onPrint && (
                      <PrintIconButton
                        onPrint={() => onPrint(entry)}
                        isPrinting={isEntryPrinting}
                        title={getPrintButtonTitle(isEntryPrinting, printing?.progress, "Print")}
                        label={`Print for ${entry.studentName}`}
                        revealOnHover
                      />
                    )}
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
  onStudentOpen,
  onEditExercises,
  isReadOnly,
  hasAnnotations,
  selectedLocation,
  onPrint,
  onPrintFileGroup,
  onBulkPrintStudent,
  onBulkAssign,
  printing,
  homeworkBySession,
  onHomeworkMarked,
  lessonDraft,
}: LessonWideSidebarProps) {
  // Student picker popover state (both modes)
  const [pickerType, setPickerType] = useState<"CW" | "HW" | null>(null);
  const handlePickerClose = useCallback(() => setPickerType(null), []);

  // The blocks folded away, by student and by file. Each block still opens
  // and folds on its own, and the top bar's toggle does every block in the
  // grouping that's showing.
  const [foldedStudents, setFoldedStudents] = useState<ReadonlySet<number>>(() => new Set());
  const [foldedFiles, setFoldedFiles] = useState<ReadonlySet<string>>(() => new Set());
  const blockCount = sidebarMode === "by-student" ? students.length : fileGroups.length;
  const anyOpen = sidebarMode === "by-student"
    ? students.some((s) => !foldedStudents.has(s.id))
    : fileGroups.some((g) => !foldedFiles.has(fileGroupKey(g)));
  const foldAll = () => {
    if (sidebarMode === "by-student") setFoldedStudents(anyOpen ? new Set(students.map((s) => s.id)) : new Set());
    else setFoldedFiles(anyOpen ? new Set(fileGroups.map(fileGroupKey)) : new Set());
  };

  // Group file groups by type for by-file view
  const cwFileGroups = useMemo(() => fileGroups.filter(g => g.exerciseType === "CW"), [fileGroups]);
  const hwFileGroups = useMemo(() => fileGroups.filter(g => g.exerciseType === "HW"), [fileGroups]);

  // Every student's homework to check, in the order the students are listed.
  const slotHomework = useMemo(() => slotCheckItems(students, homeworkBySession), [students, homeworkBySession]);

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
        <FileX className="h-8 w-8 text-[#c4a882]" />
        <p className="text-sm text-[#8b7355] dark:text-[#a09080]">No sessions in this slot</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Mode toggle. In a narrow sidebar, Collapse all shows only its icon, so the row still fits. */}
      <div className="@container/sidebarhead flex items-center gap-1 px-2 py-1.5 border-b border-[#e8d4b8] dark:border-[#3a3228]">
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
        {blockCount > 0 && (
          <button
            type="button"
            onClick={foldAll}
            title={anyOpen ? "Collapse all" : "Expand all"}
            aria-label={anyOpen ? "Collapse all" : "Expand all"}
            className="ml-auto flex flex-none items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors text-[#8b7355] dark:text-[#a09080] hover:bg-[#f0e6d4]/60 dark:hover:bg-[#252018]/60"
          >
            {anyOpen ? <ChevronsDownUp className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3" />}
            <span className="hidden @[280px]/sidebarhead:inline">{anyOpen ? "Collapse all" : "Expand all"}</span>
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto py-2 px-1">
        {/* The slot's own Draft, above everything the students have */}
        {lessonDraft && (
          <div className="px-1 pb-2">
            <LessonDraftRow {...lessonDraft} />
          </div>
        )}

        {/* Summer materials (lang-aware class assignment) */}
        <SummerCoursewareWidePanel
          sessions={students}
          selectedLocation={selectedLocation}
          isReadOnly={isReadOnly}
          onPreviewEntry={onEntrySelect}
        />

        {/* Bulk assign buttons (both modes) */}
        {!isReadOnly && onBulkAssign && (
          <div className="relative flex gap-1.5 px-1 pb-3">
            <button
              onClick={() => setPickerType(pickerType === "CW" ? null : "CW")}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded-md border border-dashed border-rose-300 dark:border-rose-700/50 text-rose-500 dark:text-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-900/10 hover:text-rose-600 dark:hover:text-rose-300 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Assign CW
            </button>
            <button
              onClick={() => setPickerType(pickerType === "HW" ? null : "HW")}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded-md border border-dashed border-blue-300 dark:border-blue-700/50 text-blue-500 dark:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Assign HW
            </button>
            {pickerType && (
              <StudentPickerPopover
                students={students}
                selectedLocation={selectedLocation}
                onAssign={(ids) => { onBulkAssign(pickerType, ids); handlePickerClose(); }}
                onClose={handlePickerClose}
              />
            )}
          </div>
        )}

        {sidebarMode === "by-student" ? (
          // By-student mode: one block per student
          // The Check Viewer steps through the whole slot, student by student,
          // in the order they are listed here.
          <CheckViewerProvider items={slotHomework} readOnly={isReadOnly} onMarked={onHomeworkMarked}>
            <div className="flex flex-col gap-2">
              {students.map((session) => {
                const studentEntries = allEntries.filter(e => e.session.id === session.id);
                return (
                  <StudentBlock
                    key={session.id}
                    session={session}
                    entries={studentEntries}
                    selectedEntry={selectedEntry}
                    onEntrySelect={onEntrySelect}
                    onStudentOpen={onStudentOpen}
                    onEditExercises={onEditExercises}
                    isReadOnly={isReadOnly}
                    hasAnnotations={hasAnnotations}
                    selectedLocation={selectedLocation}
                    expanded={!foldedStudents.has(session.id)}
                    onExpandedChange={(open) => setFoldedStudents((folded) => withFolded(folded, session.id, !open))}
                    onPrint={onPrint}
                    onBulkPrintStudent={onBulkPrintStudent}
                    printing={printing}
                    homework={homeworkBySession?.get(session.id) ?? []}
                    onHomeworkMarked={onHomeworkMarked}
                  />
                );
              })}
            </div>
          </CheckViewerProvider>
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
                      expanded={!foldedFiles.has(fileGroupKey(group))}
                      onExpandedChange={(open) => setFoldedFiles((folded) => withFolded(folded, fileGroupKey(group), !open))}
                      selectedEntry={selectedEntry}
                      onEntrySelect={onEntrySelect}
                      hasAnnotations={hasAnnotations}
                      selectedLocation={selectedLocation}
                      onPrint={onPrint}
                      onPrintFileGroup={onPrintFileGroup}
                      printing={printing}
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
                      expanded={!foldedFiles.has(fileGroupKey(group))}
                      onExpandedChange={(open) => setFoldedFiles((folded) => withFolded(folded, fileGroupKey(group), !open))}
                      selectedEntry={selectedEntry}
                      onEntrySelect={onEntrySelect}
                      hasAnnotations={hasAnnotations}
                      selectedLocation={selectedLocation}
                      onPrint={onPrint}
                      onPrintFileGroup={onPrintFileGroup}
                      printing={printing}
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
