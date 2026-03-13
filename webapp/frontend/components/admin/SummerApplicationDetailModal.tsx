"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { Modal } from "@/components/ui/modal";
import { StatusBadge, ALL_STATUSES, STATUS_COLORS, STATUS_ICONS } from "./SummerApplicationCard";
import { summerAPI, studentsAPI } from "@/lib/api";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { getGradeColor } from "@/lib/constants";
import { useToast } from "@/contexts/ToastContext";
import { useDebouncedValue } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { formatPreferences, LOCATION_TO_CODE } from "@/lib/summer-utils";
import { parseHKTimestamp } from "@/lib/formatters";
import {
  Copy, Check, Loader2, ChevronLeft, ChevronRight, X, Search, UserCheck, Unlink,
  User, Phone, MapPin, FileText, Users, ExternalLink,
  Clock,
} from "lucide-react";
import type { SummerApplication, SummerApplicationUpdate, SummerLocation } from "@/types";

const inputClass = "w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-foreground text-sm disabled:opacity-50";

const NEXT_STATUS_MAP: Record<string, string[]> = {
  "Submitted":           ["Under Review", "Rejected"],
  "Under Review":        ["Placement Offered", "Waitlisted", "Rejected"],
  "Placement Offered":   ["Placement Confirmed", "Withdrawn"],
  "Placement Confirmed": ["Fee Sent"],
  "Fee Sent":            ["Paid"],
  "Paid":                ["Enrolled"],
};

function FieldValue({ label, value, mono, copyable }: { label: string; value?: string | null; mono?: boolean; copyable?: boolean }) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    showToast("Copied", "success");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="text-xs text-muted-foreground shrink-0 w-20">{label}</span>
      <span className={`text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value}</span>
      {copyable && (
        <button onClick={handleCopy} className="p-0.5 text-muted-foreground hover:text-foreground">
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </div>
  );
}

/** Student suggestion row using StudentInfoBadges */
function StudentSuggestionRow({
  student,
  reason,
  onClick,
}: {
  student: { id: number; student_name: string; school_student_id?: string | null; grade?: string | null; home_location?: string | null; lang_stream?: string | null; school?: string | null };
  reason?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
      <StudentInfoBadges
        student={{
          student_name: student.student_name,
          school_student_id: student.school_student_id || undefined,
          grade: student.grade || undefined,
          lang_stream: student.lang_stream || undefined,
          school: student.school || undefined,
          home_location: student.home_location || undefined,
        }}
      />
      {reason && <span className="ml-auto text-[10px] text-primary/70 shrink-0">{reason}</span>}
    </button>
  );
}

interface SummerApplicationDetailModalProps {
  application: SummerApplication | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  readOnly?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  currentIndex?: number;
  totalCount?: number;
  locations?: SummerLocation[];
  allApplications?: SummerApplication[];
  onSelectApplication?: (app: SummerApplication) => void;
}

export function SummerApplicationDetailModal({
  application: app,
  isOpen,
  onClose,
  onUpdated,
  readOnly = false,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  currentIndex,
  totalCount,
  locations,
  allApplications,
  onSelectApplication,
}: SummerApplicationDetailModalProps) {
  const { showToast } = useToast();
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [langStream, setLangStream] = useState("");
  const [studentId, setStudentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAllStatuses, setShowAllStatuses] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [showManualId, setShowManualId] = useState(false);
  const autoFilledLangRef = useRef<number | null>(null);
  const [manualIdInput, setManualIdInput] = useState("");
  const [manualIdConfirmed, setManualIdConfirmed] = useState("");
  const debouncedStudentSearch = useDebouncedValue(studentSearch, 300);

  // Reset form when application changes or modal opens
  useEffect(() => {
    if (app && isOpen) {
      setStatus(app.application_status);
      setNotes(app.admin_notes || "");
      setLangStream(app.lang_stream || "");
      setStudentId(app.existing_student_id?.toString() || "");
      setShowAllStatuses(false);
      setStudentSearch("");
      setSearchFocused(false);
      setShowManualId(false);
      setManualIdInput("");
      setManualIdConfirmed("");
      autoFilledLangRef.current = null;
    }
  }, [app, isOpen]);

  // Derived values that depend on current app
  const isExisting = app ? (app.is_existing_student && app.is_existing_student !== "None") : false;
  const systemLocation = app ? (LOCATION_TO_CODE[app.preferred_location || ""] || "") : "";

  // --- Student linking SWR hooks ---

  // 1. Auto-suggest via checkDuplicates (name+phone at mapped location)
  const { data: duplicateMatches } = useSWR(
    app && isExisting && !studentId && systemLocation
      ? ["student-dupes", app.student_name, systemLocation, app.contact_phone]
      : null,
    () => studentsAPI.checkDuplicates(app!.student_name, systemLocation, app!.contact_phone || undefined)
  );

  // 2. Broad name search across all locations
  const { data: nameMatches } = useSWR(
    app && isExisting && !studentId
      ? ["student-name-search", app.student_name]
      : null,
    () => studentsAPI.getAll({ search: app!.student_name, limit: 8 })
  );

  // 3. Manual search
  const { data: searchResults } = useSWR(
    debouncedStudentSearch.length >= 2
      ? ["student-manual-search", debouncedStudentSearch]
      : null,
    () => studentsAPI.getAll({ search: debouncedStudentSearch, limit: 8 })
  );

  // 4. Manual ID search (confirm-then-search, uses school_student_id via getAll)
  const { data: manualIdResults } = useSWR(
    manualIdConfirmed.length >= 1
      ? ["student-manual-id", manualIdConfirmed]
      : null,
    () => studentsAPI.getAll({ search: manualIdConfirmed, limit: 5 })
  );

  // 5. Linked student detail
  const parsedStudentId = studentId ? parseInt(studentId, 10) : NaN;
  const { data: linkedStudent } = useSWR(
    !isNaN(parsedStudentId) && parsedStudentId > 0
      ? ["student-detail", parsedStudentId]
      : null,
    () => studentsAPI.getById(parsedStudentId)
  );

  // Auto-fill lang stream from linked student (once per linked student, so manual clear sticks)
  useEffect(() => {
    if (linkedStudent?.lang_stream && !langStream && linkedStudent.id !== autoFilledLangRef.current) {
      setLangStream(linkedStudent.lang_stream);
      autoFilledLangRef.current = linkedStudent.id;
    }
  }, [linkedStudent, langStream]);

  // Merge auto-suggest results: duplicates (with match_reason) + name matches (deduplicated)
  type SuggestionStudent = {
    id: number;
    student_name: string;
    school_student_id?: string | null;
    grade?: string | null;
    home_location?: string | null;
    lang_stream?: string | null;
    school?: string | null;
  };
  const autoSuggestions = useMemo(() => {
    if (studentId) return [];
    const results: { student: SuggestionStudent; reason: string }[] = [];
    const seenIds = new Set<number>();

    // Add checkDuplicates results first (they have match_reason)
    if (duplicateMatches?.duplicates) {
      for (const d of duplicateMatches.duplicates) {
        seenIds.add(d.id);
        results.push({ student: d, reason: d.match_reason });
      }
    }

    // Add name matches that weren't already found
    if (nameMatches) {
      for (const s of nameMatches) {
        if (seenIds.has(s.id)) continue;
        seenIds.add(s.id);
        const reasons: string[] = [];
        if (app?.contact_phone && s.phone === app.contact_phone) reasons.push("phone match");
        if (s.home_location === systemLocation) reasons.push("same location");
        results.push({ student: s, reason: reasons.join(", ") || "name match" });
      }
    }

    return results;
  }, [duplicateMatches, nameMatches, studentId, app?.contact_phone, systemLocation]);

  // Buddy group members (filter from all applications)
  const buddyMembers = useMemo(() => {
    if (!app?.buddy_group_id || !allApplications) return [];
    return allApplications.filter(a => a.buddy_group_id === app.buddy_group_id && a.id !== app.id);
  }, [app?.buddy_group_id, app?.id, allApplications]);

  if (!app) return null;

  const hasChanges =
    status !== app.application_status ||
    notes !== (app.admin_notes || "") ||
    langStream !== (app.lang_stream || "") ||
    studentId !== (app.existing_student_id?.toString() || "");

  const handleSave = async () => {
    if (!hasChanges || saving || readOnly) return;
    setSaving(true);
    try {
      const update: SummerApplicationUpdate = {};
      if (status !== app.application_status) update.application_status = status;
      if (notes !== (app.admin_notes || "")) update.admin_notes = notes;
      if (langStream !== (app.lang_stream || "")) update.lang_stream = langStream;
      const newStudentId = studentId ? parseInt(studentId, 10) : null;
      if (newStudentId !== (app.existing_student_id ?? null)) update.existing_student_id = newStudentId;

      await summerAPI.updateApplication(app.id, update);
      showToast("Application updated", "success");
      onUpdated();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Update failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleLinkStudent = (id: number) => {
    setStudentId(id.toString());
    setStudentSearch("");
    setShowManualId(false);
    setManualIdInput("");
    setManualIdConfirmed("");
    globalMutate(
      (key: unknown) => Array.isArray(key) && key[0] === "student-manual-search",
      undefined, { revalidate: false }
    );
  };

  const handleUnlink = () => {
    setStudentId("");
    setStudentSearch("");
    setShowManualId(false);
    setManualIdInput("");
    setManualIdConfirmed("");
  };

  const { pref1, pref2 } = formatPreferences(app);
  const submittedDate = app.submitted_at ? parseHKTimestamp(app.submitted_at).toLocaleString() : "—";
  const reviewedDate = app.reviewed_at ? parseHKTimestamp(app.reviewed_at).toLocaleString() : null;
  const nextStatuses = NEXT_STATUS_MAP[app.application_status];
  const locationConfig = locations?.find(l => l.name === app.preferred_location);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <span>{app.student_name}</span>
          <StatusBadge status={app.application_status} />
        </div>
      }
      size="xl"
      footer={
        <div className="flex items-center">
          {/* Left: Prev/Next navigation */}
          {(onPrev || onNext) && (
            <div className="flex items-center gap-1">
              <button
                onClick={onPrev}
                disabled={!hasPrev}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Previous (←)"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {currentIndex != null && totalCount != null && (
                <span className="text-xs text-muted-foreground tabular-nums px-1">
                  {currentIndex + 1} / {totalCount}
                </span>
              )}
              <button
                onClick={onNext}
                disabled={!hasNext}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Next (→)"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Right: Cancel + Save */}
          {!readOnly && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Changes
              </button>
            </div>
          )}
        </div>
      }
    >
      <div className={cn(
        readOnly ? "space-y-4" : "grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4"
      )}>
        {/* === LEFT COLUMN: Actions === */}
        {!readOnly && (
        <div className="space-y-4 md:order-2 md:border md:border-gray-200 md:dark:border-gray-700 md:bg-gray-100/60 md:dark:bg-gray-800/50 md:rounded-xl md:p-4">
          {/* === 1. ACTION STRIP === */}
          <div className="space-y-3">
            {/* Quick status pills with icons */}
            {nextStatuses && (
              <div>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Move to</span>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {nextStatuses.map((s) => {
                    const colors = STATUS_COLORS[s];
                    const isSelected = status === s;
                    const Icon = STATUS_ICONS[s];
                    return (
                      <button
                        key={s}
                        onClick={() => setStatus(s)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                          isSelected
                            ? cn(colors.bg, colors.text, "ring-2 ring-offset-1 ring-current")
                            : cn(colors.bg, colors.text, "hover:ring-1 hover:ring-current")
                        )}
                      >
                        {Icon && <Icon className="h-3.5 w-3.5" />}
                        {s}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setShowAllStatuses((v) => !v)}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1"
                  >
                    {showAllStatuses ? "Less" : "All statuses\u2026"}
                  </button>
                </div>
                {showAllStatuses && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                    {ALL_STATUSES.filter(s => !nextStatuses?.includes(s)).map((s) => {
                      const colors = STATUS_COLORS[s];
                      const isSelected = status === s;
                      const Icon = STATUS_ICONS[s];
                      return (
                        <button
                          key={s}
                          onClick={() => setStatus(s)}
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                            isSelected
                              ? cn(colors.bg, colors.text, "ring-2 ring-offset-1 ring-current")
                              : cn(colors.bg, colors.text, "hover:ring-1 hover:ring-current")
                          )}
                        >
                          {Icon && <Icon className="h-3 w-3" />}
                          {s}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Lang stream pills (bare C / E) + linked student hint */}
            <div>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Language Stream</span>
              <div className="flex items-center gap-1 mt-1">
                {["C", "E"].map((ls) => (
                  <button
                    key={ls}
                    onClick={() => setLangStream(ls)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium transition-all",
                      langStream === ls
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700"
                    )}
                  >
                    {ls}
                  </button>
                ))}
                {langStream && (
                  <button
                    onClick={() => setLangStream("")}
                    className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                    title="Clear"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
                {/* Linked student lang stream hint */}
                {linkedStudent?.lang_stream && langStream && linkedStudent.lang_stream === langStream && (
                  <span className="text-[10px] text-green-600 dark:text-green-400 flex items-center gap-0.5 ml-1">
                    <Check className="h-3 w-3" /> matches student
                  </span>
                )}
                {linkedStudent?.lang_stream && langStream && linkedStudent.lang_stream !== langStream && (
                  <button
                    onClick={() => setLangStream(linkedStudent.lang_stream!)}
                    className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline ml-1"
                  >
                    Student is {linkedStudent.lang_stream}
                  </button>
                )}
                {linkedStudent?.lang_stream && !langStream && (
                  <button
                    onClick={() => setLangStream(linkedStudent.lang_stream!)}
                    className="text-[10px] text-primary hover:underline ml-1"
                  >
                    Use student&apos;s: {linkedStudent.lang_stream}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* === 2. STUDENT LINK === */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Link to Student</span>

            {studentId && linkedStudent ? (
              /* Linked state: show real student data via StudentInfoBadges */
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-green-500 shrink-0" />
                    <StudentInfoBadges
                      student={{
                        student_id: linkedStudent.id,
                        student_name: linkedStudent.student_name,
                        school_student_id: linkedStudent.school_student_id || undefined,
                        grade: linkedStudent.grade || undefined,
                        lang_stream: linkedStudent.lang_stream || undefined,
                        school: linkedStudent.school || undefined,
                        home_location: linkedStudent.home_location || undefined,
                      }}
                      showLink
                    />
                  </div>
                  <div className="ml-6 mt-0.5">
                    {linkedStudent.enrollment_count != null && (
                      <span className="text-xs text-muted-foreground">
                        {linkedStudent.enrollment_count} enrollment{linkedStudent.enrollment_count !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {/* Location mismatch warning */}
                  {linkedStudent.home_location && systemLocation && linkedStudent.home_location !== systemLocation && (
                    <div className="mt-1 ml-6 text-[10px] text-amber-600 dark:text-amber-400">
                      ⚠ Student&apos;s home location ({linkedStudent.home_location}) differs from preferred ({systemLocation})
                    </div>
                  )}
                </div>
                <button
                  onClick={handleUnlink}
                  className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                  title="Unlink student"
                >
                  <Unlink className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : studentId ? (
              /* Loading linked student */
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Loading linked student...</span>
                <button onClick={handleUnlink} className="ml-auto text-xs hover:underline">Unlink</button>
              </div>
            ) : (
              /* Unlinked: show suggestions and/or search */
              <div className="space-y-2">
                {/* Applicant context */}
                {isExisting && (
                  <div className="text-xs text-muted-foreground">
                    Applicant says: {app.is_existing_student}
                    {app.current_centers && app.current_centers.length > 0 && (
                      <> · {app.current_centers.join(", ")}</>
                    )}
                  </div>
                )}

                {/* Auto-suggestions */}
                {autoSuggestions.length > 0 && (
                  <div>
                    <span className="text-[10px] text-muted-foreground">Suggested matches:</span>
                    <div className="mt-0.5 border border-gray-100 dark:border-gray-800 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                      {autoSuggestions.map(({ student, reason }) => (
                        <StudentSuggestionRow
                          key={student.id}
                          student={student}
                          reason={reason}
                          onClick={() => handleLinkStudent(student.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Manual search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                    className={cn(inputClass, "pl-8")}
                    placeholder="Search by name, ID, or phone..."
                  />
                </div>

                {/* Search results (hidden on blur) */}
                {searchFocused && searchResults && searchResults.length > 0 && (
                  <div className="border border-gray-100 dark:border-gray-800 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                    {searchResults.map((s) => (
                      <StudentSuggestionRow
                        key={s.id}
                        student={s}
                        onClick={() => handleLinkStudent(s.id)}
                      />
                    ))}
                  </div>
                )}
                {searchFocused && searchResults && searchResults.length === 0 && debouncedStudentSearch.length >= 2 && (
                  <div className="text-xs text-muted-foreground text-center py-1">No students found</div>
                )}

                {/* Manual ID fallback (search by school_student_id on Enter) */}
                {showManualId ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={manualIdInput}
                        onChange={(e) => setManualIdInput(e.target.value.replace(/\D/g, ""))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && manualIdInput) {
                            setManualIdConfirmed(manualIdInput);
                          }
                        }}
                        className={cn(inputClass, "max-w-[140px]")}
                        placeholder="School student ID"
                      />
                      <button
                        onClick={() => manualIdInput && setManualIdConfirmed(manualIdInput)}
                        disabled={!manualIdInput}
                        className="px-2.5 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                      >
                        Search
                      </button>
                      <button
                        onClick={() => { setShowManualId(false); setManualIdInput(""); setManualIdConfirmed(""); }}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        cancel
                      </button>
                    </div>
                    {manualIdResults && manualIdResults.length > 0 && (
                      <div className="border border-gray-100 dark:border-gray-800 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                        {manualIdResults.map((s) => (
                          <StudentSuggestionRow key={s.id} student={s} onClick={() => handleLinkStudent(s.id)} />
                        ))}
                      </div>
                    )}
                    {manualIdResults && manualIdResults.length === 0 && (
                      <div className="text-xs text-muted-foreground">No student found with that ID</div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setShowManualId(true)}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    or enter student ID manually
                  </button>
                )}
              </div>
            )}
          </div>

          {/* === 3. ADMIN NOTES === */}
          <div>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={notes ? 2 : 1}
              onFocus={(e) => { if (!notes) (e.target as HTMLTextAreaElement).rows = 2; }}
              onBlur={(e) => { if (!notes) (e.target as HTMLTextAreaElement).rows = 1; }}
              className={cn(inputClass, "mt-1 resize-none")}
              placeholder="Internal notes..."
            />
          </div>
        </div>
        )}

        {/* === RIGHT COLUMN: Info sections (icon-block layout) === */}
        <div className={cn("space-y-4", !readOnly && "md:order-1")}>
          {/* Student Info */}
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg shrink-0">
              <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-gray-500 dark:text-gray-400">Student Info</div>
              <div className="font-medium text-sm text-foreground">{app.student_name}</div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {app.grade && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded text-gray-800"
                    style={{ backgroundColor: getGradeColor(app.grade, app.lang_stream || undefined) }}
                  >
                    {app.grade}{app.lang_stream || ""}
                  </span>
                )}
                {app.school && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                    {app.school}
                  </span>
                )}
                {isExisting && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    Existing
                  </span>
                )}
              </div>
              {app.current_centers && app.current_centers.length > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  Centers: {app.current_centers.join(", ")}
                </div>
              )}
            </div>
          </div>

          {/* Contact */}
          {(app.wechat_id || app.contact_phone) && (
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded-lg shrink-0">
                <Phone className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-gray-500 dark:text-gray-400">Contact</div>
                <FieldValue label="WeChat" value={app.wechat_id} copyable />
                <FieldValue label="Phone" value={app.contact_phone} copyable />
              </div>
            </div>
          )}

          {/* Location */}
          {(systemLocation || app.preferred_location) && (
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-lg shrink-0">
                <MapPin className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-gray-500 dark:text-gray-400">Location</div>
                <div className="text-sm font-medium font-mono text-foreground">{systemLocation || app.preferred_location}</div>
              </div>
            </div>
          )}

          {/* Schedule Preferences */}
          {(pref1 || pref2 || app.unavailability_notes) && (
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-lg shrink-0">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-gray-500 dark:text-gray-400">Schedule Preferences</div>
                {pref1 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground w-6 shrink-0">1st</span>
                    <span className="text-sm font-medium text-foreground">{pref1}</span>
                  </div>
                )}
                {pref2 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground w-6 shrink-0">2nd</span>
                    <span className="text-sm font-medium text-foreground">{pref2}</span>
                  </div>
                )}
                {app.unavailability_notes && (
                  <div className="text-xs text-red-500 dark:text-red-400 mt-1">Unavailable: {app.unavailability_notes}</div>
                )}
              </div>
            </div>
          )}

          {/* Buddy Group */}
          {(app.buddy_group_id || app.buddy_names) && (
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-violet-100 dark:bg-violet-900/30 rounded-lg shrink-0">
                <Users className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-gray-500 dark:text-gray-400">Buddy Group</div>
                {app.buddy_code && <FieldValue label="Code" value={app.buddy_code} mono copyable />}
                {app.buddy_names && <div className="text-xs text-muted-foreground">Requested: {app.buddy_names}</div>}
                {buddyMembers.length > 0 ? (
                  <div className="mt-1 space-y-0.5">
                    <span className="text-[10px] text-muted-foreground">Members:</span>
                    {buddyMembers.map(b => (
                      <div
                        key={b.id}
                        className="flex items-center gap-2 py-1 text-sm px-1 -mx-1"
                      >
                        <span className="text-foreground">{b.student_name}</span>
                        {b.reference_code && (
                          <span className="text-[10px] font-mono text-muted-foreground">{b.reference_code}</span>
                        )}
                        {b.school && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                            {b.school}
                          </span>
                        )}
                        {b.grade && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-muted-foreground">
                            {b.grade}
                          </span>
                        )}
                        <StatusBadge status={b.application_status} />
                        <button
                          onClick={() => onSelectApplication?.(b)}
                          className="ml-auto p-0.5 text-muted-foreground hover:text-foreground shrink-0"
                          title="View application"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : app.buddy_group_id ? (
                  <div className="text-xs text-muted-foreground mt-1">No other members yet</div>
                ) : null}
              </div>
            </div>
          )}

          {/* Application Meta */}
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg shrink-0">
              <FileText className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-gray-500 dark:text-gray-400">Application</div>
              <FieldValue label="Reference" value={app.reference_code} mono copyable />
              <FieldValue label="Language" value={app.form_language === "en" ? "English" : "中文"} />
              <FieldValue label="Submitted" value={submittedDate} />
              {reviewedDate && <FieldValue label="Reviewed" value={`${app.reviewed_by} · ${reviewedDate}`} />}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
