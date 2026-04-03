"use client";

import { useState, useCallback, useMemo } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "@/contexts/LocationContext";
import { useToast } from "@/contexts/ToastContext";
import { usePageTitle } from "@/lib/hooks";
import { waitlistAPI, enrollmentsAPI, studentsAPI } from "@/lib/api";
import { getGradeColor, GRADES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/lib/formatters";
import { WaitlistEntryModal } from "@/components/admin/WaitlistEntryModal";
import { BRANCH_COLORS } from "@/components/summer/prospect-badges";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { WaitlistTimetable } from "@/components/admin/WaitlistTimetable";
import { EnrollmentDetailPopover } from "@/components/enrollments/EnrollmentDetailPopover";
import { AddStudentModal } from "@/components/students/AddStudentModal";
import { CreateEnrollmentModal } from "@/components/enrollments/CreateEnrollmentModal";
import {
  ClipboardList,
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Play,
  Eye,
  X,
  ToggleLeft,
  ToggleRight,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  ClipboardPaste,
  Trash2,
  Upload,
  List,
  CalendarDays,
} from "lucide-react";
import type { WaitlistEntry, WaitlistEntryBulkItem, Enrollment, Student } from "@/types";

const HEADER_PATTERNS: Record<string, RegExp> = {
  name: /^(name|student|student.?name|姓名|學生)/i,
  school: /^(school|學校)/i,
  grade: /^(grade|form|class|年級|班別)/i,
  phone: /^(phone|tel|contact|電話|聯絡)/i,
  lang_stream: /^(stream|lang|language|語言)/i,
  parent_name: /^(parent|guardian|家長)/i,
};
const IS_PHONE = /^\d{8}$/;
const IS_GRADE = /^[FfPp]\d$/;

export default function AdminWaitlistPage() {
  usePageTitle("Waitlist");
  const { isLoading: authLoading, canViewAdminPages, isReadOnly } = useAuth();
  const { selectedLocation } = useLocation();
  const { showToast, showError } = useToast();

  // View mode
  const [viewMode, setViewMode] = useState<"list" | "timetable">("list");

  // Timetable: highlighted Slot Change entry
  const [highlightedEntry, setHighlightedEntry] = useState<WaitlistEntry | null>(null);

  // Filters
  const [showActive, setShowActive] = useState(true);
  const [gradeFilter, setGradeFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Modals
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WaitlistEntry | null>(null);
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [addStudentForEntry, setAddStudentForEntry] =
    useState<WaitlistEntry | null>(null);
  const [createEnrollmentOpen, setCreateEnrollmentOpen] = useState(false);
  const [enrollmentPrefillStudent, setEnrollmentPrefillStudent] =
    useState<Student | null>(null);
  const [enrollmentTrialMode, setEnrollmentTrialMode] = useState(false);

  const addStudentInitialData = useMemo(
    () => addStudentForEntry ? {
      student_name: addStudentForEntry.student_name,
      school: addStudentForEntry.school,
      grade: addStudentForEntry.grade,
      lang_stream: addStudentForEntry.lang_stream || undefined,
      phone: addStudentForEntry.phone,
    } : undefined,
    [addStudentForEntry]
  );

  // Enrollment detail popover
  const [popoverEnrollment, setPopoverEnrollment] =
    useState<Enrollment | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverClickPos, setPopoverClickPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Paste zone
  const [pasteExpanded, setPasteExpanded] = useState(false);
  const [pastedRows, setPastedRows] = useState<WaitlistEntryBulkItem[]>([]);
  const [pasteInfo, setPasteInfo] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const locationParam =
    selectedLocation !== "All Locations" ? selectedLocation : undefined;

  const {
    data: entries,
    isLoading,
    mutate,
  } = useSWR(
    [
      "waitlist",
      showActive,
      locationParam,
      gradeFilter,
      typeFilter,
      search,
      sortBy,
      sortOrder,
    ],
    () =>
      waitlistAPI.getAll({
        is_active: showActive,
        location: locationParam,
        grade: gradeFilter || undefined,
        entry_type: typeFilter || undefined,
        search: search || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      }),
    { refreshInterval: 60000 }
  );

  const handleToggleActive = useCallback(
    async (entry: WaitlistEntry) => {
      try {
        const updates: Record<string, unknown> = { is_active: !entry.is_active };
        if (entry.is_active) {
          const reason = prompt("Reason for closing (optional):");
          if (reason) {
            const existing = entry.notes || "";
            updates.notes = existing ? `${existing}\n[Closed] ${reason}` : `[Closed] ${reason}`;
          }
        }
        await waitlistAPI.update(entry.id, updates);
        showToast(entry.is_active ? "Marked as closed" : "Reactivated");
        mutate();
      } catch {
        showError("Failed to update");
      }
    },
    [mutate, showToast, showError]
  );

  const handleCreateStudent = useCallback((entry: WaitlistEntry) => {
    setAddStudentForEntry(entry);
    setAddStudentOpen(true);
  }, []);

  const handleStudentCreated = useCallback(
    async (student: Student) => {
      if (addStudentForEntry) {
        try {
          await waitlistAPI.update(addStudentForEntry.id, {
            student_id: student.id,
          });
          mutate();
          showToast(`Student created & linked`);
        } catch {
          showError("Student created but failed to link to waitlist entry");
        }
      }
      setAddStudentOpen(false);
      setAddStudentForEntry(null);
    },
    [addStudentForEntry, mutate, showToast, showError]
  );

  const handleOpenEnrollment = useCallback(
    async (entry: WaitlistEntry, trialMode: boolean) => {
      if (!entry.student_id) {
        showError("Link a student first");
        return;
      }
      try {
        const student = await studentsAPI.getById(entry.student_id!);
        setEnrollmentPrefillStudent(student);
        setEnrollmentTrialMode(trialMode);
        setCreateEnrollmentOpen(true);
      } catch {
        showError("Failed to load student");
      }
    },
    [showError]
  );

  const handleViewEnrollment = useCallback(
    async (enrollmentId: number, event: React.MouseEvent) => {
      try {
        const enrollment = await enrollmentsAPI.getById(enrollmentId);
        setPopoverClickPos({ x: event.clientX, y: event.clientY });
        setPopoverEnrollment(enrollment as unknown as Enrollment);
        setPopoverOpen(true);
      } catch {
        showError("Failed to load enrollment");
      }
    },
    [showError]
  );

  const handleSort = useCallback(
    (field: string) => {
      if (sortBy === field) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(field);
        setSortOrder("asc");
      }
    },
    [sortBy]
  );

  // ---- Paste logic ----

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData("text/plain");
      if (!text.trim()) return;

      const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
      if (lines.length === 0) return;

      // Detect header row
      const firstCols = lines[0].split("\t").map((c) => c.trim());
      let columnMap: Record<string, number> | null = null;

      // Try header detection
      const headerMap: Record<string, number> = {};
      let headerMatches = 0;
      firstCols.forEach((col, idx) => {
        for (const [field, pattern] of Object.entries(HEADER_PATTERNS)) {
          if (pattern.test(col) && !(field in headerMap)) {
            headerMap[field] = idx;
            headerMatches++;
          }
        }
      });
      if (headerMatches >= 2) {
        columnMap = headerMap;
      }

      const startIdx = columnMap ? 1 : 0;
      const rows: WaitlistEntryBulkItem[] = [];
      let skipped = 0;

      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split("\t").map((c) => c?.trim() ?? "");
        if (cols.length < 2) {
          skipped++;
          continue;
        }

        let name = "",
          school = "",
          grade = "",
          phone = "",
          lang_stream = "",
          parent_name = "";

        if (columnMap) {
          name = columnMap.name != null ? cols[columnMap.name] || "" : "";
          school = columnMap.school != null ? cols[columnMap.school] || "" : "";
          grade = columnMap.grade != null ? cols[columnMap.grade] || "" : "";
          phone = columnMap.phone != null ? cols[columnMap.phone] || "" : "";
          lang_stream =
            columnMap.lang_stream != null
              ? cols[columnMap.lang_stream] || ""
              : "";
          parent_name =
            columnMap.parent_name != null
              ? cols[columnMap.parent_name] || ""
              : "";
        } else {
          // Auto-detect from data patterns
          const remaining = [...cols];
          // Find phone (8-digit number)
          const phoneIdx = remaining.findIndex((c) => IS_PHONE.test(c));
          if (phoneIdx >= 0) {
            phone = remaining.splice(phoneIdx, 1)[0];
          }
          // Find grade (F1-F6, P1-P6)
          const gradeIdx = remaining.findIndex((c) => IS_GRADE.test(c));
          if (gradeIdx >= 0) {
            grade = remaining.splice(gradeIdx, 1)[0].toUpperCase();
          }
          // First remaining is likely name, second is school
          if (remaining.length >= 1) name = remaining[0];
          if (remaining.length >= 2) school = remaining[1];
        }

        // Normalize grade
        if (grade && /^[fp]\d$/i.test(grade)) {
          grade = grade.toUpperCase();
        }

        if (!name && !phone) {
          skipped++;
          continue;
        }

        rows.push({
          student_name: name,
          school: school || "Unknown",
          grade: grade || "F1",
          phone: phone || "",
          lang_stream: lang_stream || null,
          parent_name: parent_name || null,
        });
      }

      setPastedRows(rows);
      setPasteInfo(
        `Parsed ${rows.length} row${rows.length !== 1 ? "s" : ""}${skipped > 0 ? `, skipped ${skipped}` : ""}`
      );
    },
    []
  );

  const handleBulkSubmit = useCallback(async () => {
    if (pastedRows.length === 0) return;
    setBulkSaving(true);
    try {
      const result = await waitlistAPI.bulkCreate(pastedRows);
      showToast(`Added ${result.created} entries to waitlist`);
      setPastedRows([]);
      setPasteInfo("");
      setPasteExpanded(false);
      mutate();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : "Bulk create failed");
    } finally {
      setBulkSaving(false);
    }
  }, [pastedRows, mutate, showToast, showError]);

  const removePastedRow = useCallback((index: number) => {
    setPastedRows((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const SortHeader = ({
    field,
    children,
  }: {
    field: string;
    children: React.ReactNode;
  }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-xs font-medium text-foreground/60 hover:text-foreground/80 uppercase tracking-wider"
    >
      {children}
      {sortBy === field && (
        sortOrder === "asc"
          ? <ArrowUp className="h-3 w-3 text-[#a0704b]" />
          : <ArrowDown className="h-3 w-3 text-[#a0704b]" />
      )}
    </button>
  );

  const activeCount = entries?.length ?? 0;

  return (
    <DeskSurface>
      <PageTransition className="min-h-full p-4 sm:p-6">
        <div className="bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm p-4 sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <ClipboardList className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Waitlist</h1>
                <p className="text-sm text-foreground/60">
                  {activeCount} {showActive ? "active" : "closed"} entr
                  {activeCount === 1 ? "y" : "ies"}
                  {isReadOnly && (
                    <span className="ml-2 text-amber-600">(Read-only)</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors",
                    viewMode === "list"
                      ? "bg-[#a0704b] text-white"
                      : "bg-transparent text-foreground/60 hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                >
                  <List className="h-4 w-4" />
                  List
                </button>
                <button
                  onClick={() => setViewMode("timetable")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors",
                    viewMode === "timetable"
                      ? "bg-[#a0704b] text-white"
                      : "bg-transparent text-foreground/60 hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                >
                  <CalendarDays className="h-4 w-4" />
                  Timetable
                </button>
              </div>

              {!isReadOnly && (
                <button
                  onClick={() => {
                    setEditingEntry(null);
                    setEntryModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-[#a0704b] hover:bg-[#8b6040] text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                >
                  <Plus className="h-4 w-4" />
                  Add Entry
                </button>
              )}
            </div>
          </div>

          {viewMode === "timetable" ? (
            <>
              {/* Slot Change entry selector */}
              {entries && entries.filter((e) => e.entry_type === "Slot Change" && e.enrollment_context?.current_day).length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-foreground/50">Highlight Slot Change:</span>
                  {entries
                    .filter((e) => e.entry_type === "Slot Change" && e.enrollment_context?.current_day)
                    .map((e) => (
                      <button
                        key={e.id}
                        onClick={() => setHighlightedEntry(highlightedEntry?.id === e.id ? null : e)}
                        className={cn(
                          "px-2 py-1 rounded-lg text-xs font-medium transition-colors border",
                          highlightedEntry?.id === e.id
                            ? "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400"
                            : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-foreground/60 hover:border-blue-300"
                        )}
                      >
                        {e.student_name}
                      </button>
                    ))}
                  {highlightedEntry && (
                    <button
                      onClick={() => setHighlightedEntry(null)}
                      className="text-xs text-foreground/40 hover:text-foreground/60"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
              {(search || gradeFilter || typeFilter) && (
                <div className="mb-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400 flex items-center justify-between">
                  <span>Filters active — timetable may not show all waitlist entries</span>
                  <button
                    onClick={() => { setSearch(""); setGradeFilter(""); setTypeFilter(""); }}
                    className="font-medium hover:underline"
                  >
                    Clear
                  </button>
                </div>
              )}
              <WaitlistTimetable
                location={selectedLocation}
                waitlistEntries={entries || []}
                onEntryClick={(entry) => {
                  setEditingEntry(entry);
                  setEntryModalOpen(true);
                }}
                highlight={highlightedEntry ? {
                  currentDay: highlightedEntry.enrollment_context?.current_day,
                  currentTime: highlightedEntry.enrollment_context?.current_time,
                  currentLocation: highlightedEntry.enrollment_context?.current_location,
                  preferredSlots: highlightedEntry.slot_preferences.map((sp) => ({
                    day: sp.day_of_week,
                    time: sp.time_slot,
                    location: sp.location,
                  })),
                } : null}
              />
              {entries && (() => {
                const noSlotCount = entries.filter((e) => e.slot_preferences.length === 0).length;
                return noSlotCount > 0 ? (
                  <p className="text-xs text-foreground/40 mt-2 text-center">
                    {noSlotCount} entr{noSlotCount === 1 ? "y" : "ies"} with no slot preference not shown in timetable
                  </p>
                ) : null;
              })()}
            </>
          ) : (
          <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {/* Active/Closed toggle */}
            <button
              onClick={() => setShowActive(!showActive)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                showActive
                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
                  : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-foreground/60"
              )}
            >
              {showActive ? (
                <ToggleRight className="h-4 w-4" />
              ) : (
                <ToggleLeft className="h-4 w-4" />
              )}
              {showActive ? "Active" : "Closed"}
            </button>

            {/* Grade filter */}
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
            >
              <option value="">All Grades</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            {/* Type filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
            >
              <option value="">All Types</option>
              <option value="New">New</option>
              <option value="Slot Change">Slot Change</option>
            </select>

            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, school, phone..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-[#d4a574] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-[#a0704b]"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                >
                  <X className="h-3.5 w-3.5 text-foreground/40" />
                </button>
              )}
            </div>
          </div>

          {/* Summary bar */}
          {entries && entries.length > 0 && (() => {
            const newCount = entries.filter((e) => e.entry_type === "New").length;
            const scCount = entries.filter((e) => e.entry_type === "Slot Change").length;
            const gradeCounts = new Map<string, number>();
            for (const e of entries) {
              const key = `${e.grade}${e.lang_stream || ""}`;
              gradeCounts.set(key, (gradeCounts.get(key) || 0) + 1);
            }
            const topGrades = [...gradeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
            const oldest = entries.reduce((min, e) => {
              if (!e.created_at) return min;
              const d = new Date(e.created_at).getTime();
              return d < min ? d : min;
            }, Date.now());
            const oldestDays = Math.floor((Date.now() - oldest) / 86400000);
            return (
              <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px]">
                {newCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-foreground/60 font-medium">
                    New: {newCount}
                  </span>
                )}
                {scCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium">
                    Slot Change: {scCount}
                  </span>
                )}
                <span className="text-foreground/30">|</span>
                {topGrades.map(([grade, count]) => (
                  <span
                    key={grade}
                    className="px-1.5 py-0.5 rounded text-gray-800 font-medium"
                    style={{ backgroundColor: getGradeColor(grade.replace(/[CE]$/, ""), grade.match(/[CE]$/)?.[0]) }}
                  >
                    {grade}: {count}
                  </span>
                ))}
                {oldestDays > 0 && (
                  <>
                    <span className="text-foreground/30">|</span>
                    <span className={cn(
                      "font-medium",
                      oldestDays > 30 ? "text-red-500" : oldestDays > 7 ? "text-amber-500" : "text-foreground/50"
                    )}>
                      Longest wait: {oldestDays}d
                    </span>
                  </>
                )}
              </div>
            );
          })()}

          {/* Paste Zone */}
          {!isReadOnly && (
            <div className="mb-4">
              <button
                onClick={() => setPasteExpanded(!pasteExpanded)}
                className="flex items-center gap-2 text-sm text-foreground/50 hover:text-foreground/70 transition-colors"
              >
                <ClipboardPaste className="h-4 w-4" />
                Bulk paste from spreadsheet
                {pasteExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>

              {pasteExpanded && (
                <div className="mt-2">
                  {pastedRows.length === 0 ? (
                    <div
                      className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-[#a0704b] transition-colors cursor-text"
                      onPaste={handlePaste}
                      tabIndex={0}
                    >
                      <ClipboardPaste className="h-8 w-8 mx-auto mb-2 text-foreground/30" />
                      <p className="text-sm text-foreground/50">
                        Click here and paste (Ctrl+V) tab-separated data
                      </p>
                      <p className="text-xs text-foreground/30 mt-1">
                        Columns: Name, School, Grade, Phone (auto-detected)
                      </p>
                      <textarea
                        className="sr-only"
                        onPaste={handlePaste}
                        aria-label="Paste zone"
                      />
                    </div>
                  ) : (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      {pasteInfo && (
                        <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-700 dark:text-blue-400 flex items-center justify-between">
                          <span>{pasteInfo}</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setPastedRows([]);
                                setPasteInfo("");
                              }}
                              className="text-red-500 hover:text-red-700 text-xs font-medium"
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="max-h-60 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                              <th className="text-left py-1.5 px-3 font-medium text-foreground/60">
                                Name
                              </th>
                              <th className="text-left py-1.5 px-3 font-medium text-foreground/60">
                                School
                              </th>
                              <th className="text-left py-1.5 px-3 font-medium text-foreground/60">
                                Grade
                              </th>
                              <th className="text-left py-1.5 px-3 font-medium text-foreground/60">
                                Phone
                              </th>
                              <th className="w-8" />
                            </tr>
                          </thead>
                          <tbody>
                            {pastedRows.map((row, i) => (
                              <tr
                                key={i}
                                className="border-b border-gray-100 dark:border-gray-800"
                              >
                                <td className="py-1.5 px-3">
                                  {row.student_name}
                                </td>
                                <td className="py-1.5 px-3">{row.school}</td>
                                <td className="py-1.5 px-3">
                                  <span
                                    className="px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-800"
                                    style={{
                                      backgroundColor: getGradeColor(
                                        row.grade,
                                        row.lang_stream || undefined
                                      ),
                                    }}
                                  >
                                    {row.grade}
                                    {row.lang_stream}
                                  </span>
                                </td>
                                <td className="py-1.5 px-3 font-mono">
                                  {row.phone}
                                </td>
                                <td className="py-1.5 px-1">
                                  <button
                                    onClick={() => removePastedRow(i)}
                                    className="p-0.5 text-red-400 hover:text-red-600 rounded"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                        <button
                          onClick={handleBulkSubmit}
                          disabled={bulkSaving || pastedRows.length === 0}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#a0704b] hover:bg-[#8b6040] text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {bulkSaving
                            ? "Saving..."
                            : `Add ${pastedRows.length} to Waitlist`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Table */}
          {authLoading || isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="p-4 rounded-lg border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                >
                  <div className="flex gap-4">
                    <div className="h-4 w-32 rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 w-20 rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                    <div className="h-4 w-24 rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                  </div>
                </div>
              ))}
            </div>
          ) : entries && entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3">
                      <SortHeader field="student_name">Name</SortHeader>
                    </th>
                    <th className="text-left py-2 px-3">
                      <SortHeader field="school">School</SortHeader>
                    </th>
                    <th className="text-left py-2 px-3">
                      <SortHeader field="grade">Grade</SortHeader>
                    </th>
                    <th className="text-left py-2 px-3">
                      <span className="text-xs font-medium text-foreground/60 uppercase tracking-wider">
                        Phone
                      </span>
                    </th>
                    <th className="text-left py-2 px-3">
                      <span className="text-xs font-medium text-foreground/60 uppercase tracking-wider">
                        Preferred Slots
                      </span>
                    </th>
                    <th className="text-left py-2 px-3">
                      <span className="text-xs font-medium text-foreground/60 uppercase tracking-wider">
                        Status
                      </span>
                    </th>
                    <th className="text-left py-2 px-3">
                      <SortHeader field="created_at">Added</SortHeader>
                    </th>
                    <th className="text-right py-2 px-3">
                      <span className="text-xs font-medium text-foreground/60 uppercase tracking-wider">
                        Actions
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <WaitlistRow
                      key={entry.id}
                      entry={entry}
                      isReadOnly={isReadOnly}
                      onEdit={() => {
                        setEditingEntry(entry);
                        setEntryModalOpen(true);
                      }}
                      onToggleActive={() => handleToggleActive(entry)}
                      onCreateStudent={() => handleCreateStudent(entry)}
                      onScheduleTrial={() => handleOpenEnrollment(entry, true)}
                      onEnrollDirectly={() => handleOpenEnrollment(entry, false)}
                      onViewEnrollment={(e) => {
                        if (entry.enrollment_context?.enrollment_id) {
                          handleViewEnrollment(
                            entry.enrollment_context.enrollment_id,
                            e
                          );
                        }
                      }}
                      onDelete={async () => {
                        try {
                          await waitlistAPI.remove(entry.id);
                          showToast("Entry deleted");
                          mutate();
                        } catch {
                          showError("Failed to delete");
                        }
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-foreground/40">
              <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No waitlist entries</p>
              <p className="text-sm mt-1">
                {(search || gradeFilter || typeFilter) ? (
                  <>
                    No entries match your filters.{" "}
                    <button
                      onClick={() => { setSearch(""); setGradeFilter(""); setTypeFilter(""); }}
                      className="text-[#a0704b] hover:underline font-medium"
                    >
                      Clear filters
                    </button>
                  </>
                ) : showActive
                  ? "Add a new entry to start tracking prospects"
                  : "No closed entries found"}
              </p>
            </div>
          )}
          </>
          )}
        </div>
      </PageTransition>

      {/* Modals */}
      <WaitlistEntryModal
        isOpen={entryModalOpen}
        onClose={() => {
          setEntryModalOpen(false);
          setEditingEntry(null);
        }}
        onSuccess={() => mutate()}
        entry={editingEntry}
      />

      {addStudentOpen && (
        <AddStudentModal
          isOpen={addStudentOpen}
          onClose={() => {
            setAddStudentOpen(false);
            setAddStudentForEntry(null);
          }}
          onSuccess={handleStudentCreated}
          initialData={addStudentInitialData}
        />
      )}

      {createEnrollmentOpen && (
        <CreateEnrollmentModal
          isOpen={createEnrollmentOpen}
          onClose={() => {
            setCreateEnrollmentOpen(false);
            setEnrollmentPrefillStudent(null);
          }}
          trialMode={enrollmentTrialMode}
          prefillStudent={enrollmentPrefillStudent || undefined}
          onSuccess={() => {
            mutate();
            // Also invalidate the timetable's enrollment cache
            globalMutate((key: unknown) => Array.isArray(key) && key[0] === "all-students");
            setCreateEnrollmentOpen(false);
            setEnrollmentPrefillStudent(null);
          }}
        />
      )}

      <EnrollmentDetailPopover
        enrollment={popoverEnrollment}
        isOpen={popoverOpen}
        onClose={() => {
          setPopoverOpen(false);
          setPopoverEnrollment(null);
        }}
        clickPosition={popoverClickPos}
        onStatusChange={() => mutate()}
      />
      <ScrollToTopButton />
    </DeskSurface>
  );
}

// ============================================
// Row Component
// ============================================

function WaitlistRow({
  entry,
  isReadOnly,
  onEdit,
  onToggleActive,
  onCreateStudent,
  onScheduleTrial,
  onEnrollDirectly,
  onViewEnrollment,
  onDelete,
}: {
  entry: WaitlistEntry;
  isReadOnly: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onCreateStudent: () => void;
  onScheduleTrial: () => void;
  onEnrollDirectly: () => void;
  onViewEnrollment: (e: React.MouseEvent) => void;
  onDelete: () => void;
}) {
  const [showActions, setShowActions] = useState(false);

  const ctx = entry.enrollment_context;
  const hasStudent = !!entry.student_id;
  const hasEnrollment = !!ctx?.enrollment_id;

  return (
    <tr
      className="border-b border-gray-100 dark:border-gray-800 hover:bg-white/50 dark:hover:bg-white/5 transition-colors cursor-pointer"
      onClick={onEdit}
    >
      {/* Name */}
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">
            {entry.student_name}
          </span>
          {entry.entry_type === "Slot Change" && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
              Slot Change
            </span>
          )}
        </div>
        {entry.parent_name && (
          <div className="text-xs text-foreground/40 mt-0.5">
            Parent: {entry.parent_name}
          </div>
        )}
        {entry.entry_type === "Slot Change" && ctx?.current_day && (
          <div className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
            Currently: {ctx.current_day} {ctx.current_time} {ctx.current_location}
            {ctx.current_tutor && ` · ${ctx.current_tutor}`}
          </div>
        )}
      </td>

      {/* School */}
      <td className="py-2.5 px-3 text-foreground/70">{entry.school}</td>

      {/* Grade */}
      <td className="py-2.5 px-3">
        <span
          className="px-2 py-0.5 rounded text-xs font-medium text-gray-800"
          style={{
            backgroundColor: getGradeColor(
              entry.grade,
              entry.lang_stream || undefined
            ),
          }}
        >
          {entry.grade}
          {entry.lang_stream}
        </span>
      </td>

      {/* Phone */}
      <td className="py-2.5 px-3 text-foreground/70 font-mono text-xs">
        {entry.phone || <span className="text-foreground/30">—</span>}
      </td>

      {/* Preferred Slots */}
      <td className="py-2.5 px-3">
        {entry.slot_preferences.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {entry.slot_preferences.map((sp) => (
              <span
                key={sp.id}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[10px] font-medium text-foreground/60"
              >
                <span className={cn("px-1 rounded", BRANCH_COLORS[sp.location]?.badge || "text-[#a0704b]")}>{sp.location}</span>
                {sp.day_of_week && <span>{sp.day_of_week}</span>}
                {sp.time_slot && <span>{sp.time_slot}</span>}
                {!sp.day_of_week && !sp.time_slot && <span>Any</span>}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-foreground/30 italic">Any slot</span>
        )}
      </td>

      {/* Enrollment Context */}
      <td className="py-2.5 px-3">
        {ctx && (
          <span
            className={cn(
              "px-2 py-0.5 rounded text-xs font-medium",
              ctx.label === "Enrolled" &&
                "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
              ctx.label === "Trial scheduled" &&
                "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
              ctx.label === "Student created" &&
                "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
              ctx.label === "No student record" &&
                "bg-gray-100 dark:bg-gray-800 text-foreground/50",
              ctx.label === "Cancelled" &&
                "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
            )}
          >
            {ctx.label}
          </span>
        )}
      </td>

      {/* Date Added */}
      <td className="py-2.5 px-3 text-xs">
        {entry.created_at ? (() => {
          const diffDays = Math.floor((Date.now() - new Date(entry.created_at!).getTime()) / 86400000);
          const color = diffDays > 30 ? "text-red-600 dark:text-red-400" : diffDays > 7 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400";
          const absDate = new Date(entry.created_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
          return (
            <span className={cn("font-medium", color)} title={`${absDate}${entry.created_by_name ? ` by ${entry.created_by_name}` : ""}`}>
              {formatTimeAgo(entry.created_at!)}
            </span>
          );
        })() : "—"}
      </td>

      {/* Actions */}
      <td className="py-2.5 px-3 text-right">
        <div
          className="relative inline-block"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setShowActions(!showActions)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <MoreHorizontal className="h-4 w-4 text-foreground/50" />
          </button>
          {showActions && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setShowActions(false)}
              />
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-[#2a2a2a] rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg z-40 min-w-[180px] py-1">
                {!hasStudent && !isReadOnly && (
                  <button
                    onClick={() => {
                      setShowActions(false);
                      onCreateStudent();
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <UserPlus className="h-4 w-4 text-foreground/50" />
                    Create Student
                  </button>
                )}
                {hasStudent && !hasEnrollment && !isReadOnly && (
                  <>
                    <button
                      onClick={() => {
                        setShowActions(false);
                        onScheduleTrial();
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <Play className="h-4 w-4 text-foreground/50" />
                      Schedule Trial
                    </button>
                    <button
                      onClick={() => {
                        setShowActions(false);
                        onEnrollDirectly();
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <UserPlus className="h-4 w-4 text-foreground/50" />
                      Enroll Directly
                    </button>
                  </>
                )}
                {hasEnrollment && (
                  <button
                    onClick={(e) => {
                      setShowActions(false);
                      onViewEnrollment(e);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <Eye className="h-4 w-4 text-foreground/50" />
                    View Enrollment
                  </button>
                )}
                {!isReadOnly && (
                  <>
                    <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                    <button
                      onClick={() => {
                        setShowActions(false);
                        onToggleActive();
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      {entry.is_active ? (
                        <>
                          <ToggleLeft className="h-4 w-4 text-foreground/50" />
                          Close Entry
                        </>
                      ) : (
                        <>
                          <ToggleRight className="h-4 w-4 text-foreground/50" />
                          Reactivate
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setShowActions(false);
                        if (confirm(`Delete "${entry.student_name}" from waitlist?`)) {
                          onDelete();
                        }
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
