"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useSWR, { mutate as globalMutate } from "swr";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge, ALL_STATUSES, STATUS_COLORS, STATUS_ICONS } from "./SummerApplicationCard";
import { PrimaryBranchChip } from "./PrimaryBranchChip";
import { summerAPI, studentsAPI, enrollmentsAPI } from "@/lib/api";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { getGradeColor } from "@/lib/constants";
import { useToast } from "@/contexts/ToastContext";
import { useDebouncedValue } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { formatPreferences, LOCATION_TO_CODE, BRANCH_INFO, formatCompactDate, sortSessionsByDate, getDayFromDate, getStartTime, sessionStatusBg, RESCHEDULED_STATUS, nonRejectedSiblings, COURSE_TYPE_COLORS, SUMMER_GRADE_BG } from "@/lib/summer-utils";
import { getTutorFirstName } from "@/components/zen/utils/sessionSorting";
import { computeBestDiscount, type DiscountResult } from "@/lib/summer-discounts";
import { classifyPrefs } from "@/lib/summer-preferences";
import { parseHKTimestamp } from "@/lib/formatters";
import {
  Copy, Check, Loader2, ChevronLeft, ChevronRight, ChevronDown, X, Search, UserCheck, Unlink,
  User, Phone, MapPin, FileText, Users, ExternalLink, Link2, ArrowRight, AlertTriangle,
  Clock, Grid3X3, Pencil, History, DollarSign, RotateCcw, Send, CheckCircle2, Trash2,
} from "lucide-react";
import type {
  SummerApplication,
  SummerApplicationUpdate,
  SummerApplicationEditEntry,
  SummerCourseConfig,
  SummerLocation,
  SiblingVerificationStatus,
  Enrollment,
} from "@/types";
import { ClassPreferencesStep } from "@/components/summer/steps/ClassPreferencesStep";
import { TierStatusCallout } from "@/components/summer/TierStatusCallout";
import { PaidAtEditor } from "@/components/summer/PaidAtEditor";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
import { SummerMessagePanel, type SummerMessageMode } from "./SummerMessagePanel";
import { AddStudentModal } from "@/components/students/AddStudentModal";
import { EnrollmentDetailPopover } from "@/components/enrollments/EnrollmentDetailPopover";
import { UserPlus } from "lucide-react";

const inputClass = "w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-foreground text-sm disabled:opacity-50";

const NEXT_STATUS_MAP: Record<string, string[]> = {
  "Submitted":           ["Under Review", "Rejected"],
  "Under Review":        ["Placement Offered", "Waitlisted", "Rejected"],
  "Placement Offered":   ["Placement Confirmed", "Withdrawn"],
  "Placement Confirmed": ["Fee Sent"],
  "Fee Sent":            ["Paid"],
  "Paid":                ["Enrolled"],
};

function FieldValue({ label, value, mono, copyable }: { label: React.ReactNode; value?: string | null; mono?: boolean; copyable?: boolean }) {
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
      type="button"
      onClick={onClick}
      className="group/row w-full flex items-center gap-2 px-2.5 py-2 text-left text-sm cursor-pointer transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <StudentInfoBadges
          student={{
            student_id: student.id,
            student_name: student.student_name,
            school_student_id: student.school_student_id || undefined,
            grade: student.grade || undefined,
            lang_stream: student.lang_stream || undefined,
            school: student.school || undefined,
            home_location: student.home_location || undefined,
          }}
          showLocationPrefix
        />
        {reason && (
          <span
            className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium"
            title="Why this student was suggested"
          >
            {reason}
          </span>
        )}
      </div>
      <span
        className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-medium text-primary opacity-0 group-hover/row:opacity-100 transition-opacity"
        aria-hidden
      >
        Link <ArrowRight className="h-3 w-3" />
      </span>
    </button>
  );
}

/** Collapsible workflow-step row for the admin action pane. */
function ChecklistRow({
  index,
  title,
  done,
  summary,
  open,
  onToggle,
  disabled,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  summary?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white dark:bg-gray-900/40 overflow-hidden",
        done
          ? "border-green-200/70 dark:border-green-900/40"
          : "border-gray-200 dark:border-gray-700",
      )}
    >
      <button
        type="button"
        onClick={disabled ? undefined : onToggle}
        disabled={disabled}
        aria-expanded={open}
        className={cn(
          "w-full flex items-center gap-2.5 px-2.5 py-2 text-left",
          disabled
            ? "cursor-default"
            : "hover:bg-gray-50 dark:hover:bg-gray-800/50",
        )}
      >
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
            done
              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
          )}
        >
          {done ? <Check className="h-3 w-3" /> : index + 1}
        </span>
        <span
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wider",
            done ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {title}
        </span>
        <span className="ml-auto flex items-center gap-2 min-w-0">
          {!open && summary ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {summary}
            </span>
          ) : null}
          {!disabled && (
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                open && "rotate-180",
              )}
            />
          )}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="border-t border-gray-100 dark:border-gray-800 p-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const FEE_SENT_OR_LATER = new Set(["Fee Sent", "Paid", "Enrolled"]);

/** Picks the first incomplete step in the workflow checklist. Returns null when every step is done. */
function firstUndoneStep(a: SummerApplication): number | null {
  if (!a.lang_stream) return 0;
  if (!a.existing_student_id) return 1;
  if (!FEE_SENT_OR_LATER.has(a.application_status)) return 2;
  if (!a.published_enrollment_id) return 3;
  return null;
}

// Matches both the applications-page list cache (["summer-apps", ...]) and
// the arrangement-page single-app cache (["summer-app", id]) that feed this
// modal — the caches each parent owns but this component reads via props.
function appCachesMatcher(appId: number) {
  return (key: unknown) => {
    if (!Array.isArray(key)) return false;
    if (key[0] === "summer-apps") return true;
    if (key[0] === "summer-app" && key[1] === appId) return true;
    return false;
  };
}

interface SummerApplicationDetailModalProps {
  application: SummerApplication | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void | Promise<unknown>;
  // Optional optimistic cache patcher — when provided, side actions (mark
  // fee sent, etc.) patch the SWR cache immediately so the modal reflects
  // the change before the onUpdated() refetch lands over the network.
  onOptimisticUpdate?: (id: number, patch: Partial<SummerApplication>) => void;
  readOnly?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  currentIndex?: number;
  totalCount?: number;
  locations?: SummerLocation[];
  onSelectApplication?: (app: SummerApplication) => void;
  baseFee?: number;
  config?: SummerCourseConfig | null;
}

export function SummerApplicationDetailModal({
  application: app,
  isOpen,
  onClose,
  onUpdated,
  onOptimisticUpdate,
  readOnly = false,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  currentIndex,
  totalCount,
  locations,
  onSelectApplication,
  baseFee,
  config,
}: SummerApplicationDetailModalProps) {
  const { showToast } = useToast();
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [langStream, setLangStream] = useState("");
  const [studentId, setStudentId] = useState("");
  const [branchOrigin, setBranchOrigin] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [showAllStatuses, setShowAllStatuses] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [showManualId, setShowManualId] = useState(false);
  const autoFilledLangRef = useRef<number | null>(null);
  const prevAppIdRef = useRef<number | null>(null);
  const [manualIdInput, setManualIdInput] = useState("");
  const [manualIdConfirmed, setManualIdConfirmed] = useState("");
  const [messagePanel, setMessagePanel] = useState<SummerMessageMode | null>(null);
  // Which workflow checklist row is expanded in the admin action pane. Only one
  // row is open at a time (accordion). `null` = all collapsed.
  const [openStepIdx, setOpenStepIdx] = useState<number | null>(null);
  const [createStudentOpen, setCreateStudentOpen] = useState(false);
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [planDraft, setPlanDraft] = useState<number | null>(null);
  const [planSaving, setPlanSaving] = useState(false);
  // Publish bridge state (Phase 5): drives the Publish/Unpublish buttons.
  const [publishing, setPublishing] = useState(false);
  const [pendingUnpublish, setPendingUnpublish] = useState(false);
  // Floating EnrollmentDetailPopover opened from the "Enrollment #X" chip.
  const [enrollmentPopover, setEnrollmentPopover] = useState<
    { enrollment: Enrollment; pos: { x: number; y: number } } | null
  >(null);
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);
  // Sync studentId synchronously on app change to avoid a one-frame flash of
  // the previous student's data (e.g. amber home-location warning) when
  // navigating prev/next.
  if (app && prevAppIdRef.current !== app.id) {
    prevAppIdRef.current = app.id;
    const nextStudentId = app.existing_student_id?.toString() || "";
    if (studentId !== nextStudentId) setStudentId(nextStudentId);
    const nextLangStream = app.lang_stream || "";
    if (langStream !== nextLangStream) setLangStream(nextLangStream);
    const nextBranch = app.verified_branch_origin || "";
    if (branchOrigin !== nextBranch) setBranchOrigin(nextBranch);
    autoFilledLangRef.current = null;
    if (planEditorOpen) setPlanEditorOpen(false);
    if (planDraft !== null) setPlanDraft(null);
  }
  const debouncedStudentSearch = useDebouncedValue(studentSearch, 300);

  // Buddy edit state
  const [buddyEditing, setBuddyEditing] = useState(false);
  const [buddyEditMode, setBuddyEditMode] = useState<"code" | "search">("code");
  const [buddyEditCode, setBuddyEditCode] = useState("");
  const [buddyEditValid, setBuddyEditValid] = useState<boolean | null>(null);
  const [buddyEditGroupFull, setBuddyEditGroupFull] = useState(false);
  const [buddyEditMaxMembers, setBuddyEditMaxMembers] = useState(3);
  const [buddyEditLoading, setBuddyEditLoading] = useState(false);
  const [buddySearchQuery, setBuddySearchQuery] = useState("");
  const debouncedBuddySearch = useDebouncedValue(buddySearchQuery, 300);
  const [buddySearchResults, setBuddySearchResults] = useState<SummerApplication[]>([]);
  const [buddySearchLoading, setBuddySearchLoading] = useState(false);
  const [buddyPendingAction, setBuddyPendingAction] = useState<
    | { type: "join"; code: string; targetLabel: string }
    | { type: "create" }
    | { type: "remove" }
    | null
  >(null);

  const [siblingOverrides, setSiblingOverrides] = useState<
    Record<number, SiblingVerificationStatus>
  >({});
  const [siblingPendingReject, setSiblingPendingReject] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [buddySectionCollapsed, setBuddySectionCollapsed] = useState(false);

  const [editingDetails, setEditingDetails] = useState(false);
  const [dStudentName, setDStudentName] = useState("");
  const [dGrade, setDGrade] = useState("");
  const [dSchool, setDSchool] = useState("");
  const [dWechat, setDWechat] = useState("");
  const [dLocation, setDLocation] = useState("");
  const [dSessionsPerWeek, setDSessionsPerWeek] = useState(1);
  const [dPref1Day, setDPref1Day] = useState("");
  const [dPref1Time, setDPref1Time] = useState("");
  const [dPref2Day, setDPref2Day] = useState("");
  const [dPref2Time, setDPref2Time] = useState("");
  const [dPref3Day, setDPref3Day] = useState("");
  const [dPref3Time, setDPref3Time] = useState("");
  const [dPref4Day, setDPref4Day] = useState("");
  const [dPref4Time, setDPref4Time] = useState("");
  const [dUnavail, setDUnavail] = useState("");

  const [pendingStatusConfirm, setPendingStatusConfirm] = useState<string | null>(null);
  // Holds a navigation/close action to run after the user confirms discarding
  // unsaved changes. `null` means no discard prompt is showing.
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    { kind: "reschedule" | "delete"; id: number; lessonNumber: number; dateLabel: string } | null
  >(null);
  const [actionBusy, setActionBusy] = useState(false);

  const { data: formConfig } = useSWR(
    editingDetails ? "summer-form-config" : null,
    () => summerAPI.getFormConfig()
  );
  const { data: editHistory } = useSWR(
    historyOpen && app ? ["summer-edits", app.id] : null,
    () => summerAPI.getApplicationEdits(app!.id)
  );

  useEffect(() => {
    if (buddyEditMode !== "search" || !debouncedBuddySearch.trim() || !app) {
      setBuddySearchResults((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const appId = app.id;
    const configId = app.config_id;
    let cancelled = false;
    setBuddySearchLoading(true);
    summerAPI
      .getApplications({ config_id: configId, search: debouncedBuddySearch.trim() })
      .then((results) => {
        if (cancelled) return;
        setBuddySearchResults(results.filter((r) => r.id !== appId).slice(0, 8));
      })
      .catch(() => {
        if (!cancelled) setBuddySearchResults((prev) => (prev.length === 0 ? prev : []));
      })
      .finally(() => {
        if (!cancelled) setBuddySearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedBuddySearch, buddyEditMode, app?.id, app?.config_id]);

  const runBuddyUpdate = async (
    buddyCode: string,
    successMsg: string,
    allowOverflow = false,
  ) => {
    if (!app) return;
    setBuddyEditLoading(true);
    try {
      await summerAPI.updateApplication(app.id, {
        buddy_code: buddyCode,
        ...(allowOverflow ? { allow_buddy_overflow: true } : {}),
      });
      showToast(successMsg, "success");
      setBuddyEditing(false);
      setBuddyEditMode("code");
      setBuddyPendingAction(null);
      setBuddyEditCode("");
      setBuddyEditValid(null);
      setBuddyEditGroupFull(false);
      setBuddySearchQuery("");
      setBuddySearchResults([]);
      onUpdated();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      if (msg.includes("buddy_cap_exceeded")) {
        showToast(
          "Buddy group is now full — please re-verify the code before trying again.",
          "error",
        );
        setBuddyEditValid(null);
        setBuddyEditGroupFull(false);
        setBuddyPendingAction(null);
      } else {
        showToast(msg, "error");
      }
    } finally {
      setBuddyEditLoading(false);
    }
  };

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
      setBuddyEditing(false);
      setBuddyEditMode("code");
      setBuddyEditCode("");
      setBuddyEditValid(null);
      setBuddyEditGroupFull(false);
      setBuddySearchQuery("");
      setBuddySearchResults([]);
      setBuddyPendingAction(null);
      setSiblingOverrides({});
      setSiblingPendingReject(null);
      setMessagePanel(null);
      setOpenStepIdx(app.published_enrollment_id ? null : firstUndoneStep(app));
      setBuddySectionCollapsed(false);
      setEditingDetails(false);
      setPendingStatusConfirm(null);
      setHistoryOpen(false);
      setDStudentName(app.student_name || "");
      setDGrade(app.grade || "");
      setDSchool(app.school || "");
      setDWechat(app.wechat_id || "");
      setDLocation(app.preferred_location || "");
      setDSessionsPerWeek(app.sessions_per_week ?? 1);
      setDPref1Day(app.preference_1_day || "");
      setDPref1Time(app.preference_1_time || "");
      setDPref2Day(app.preference_2_day || "");
      setDPref2Time(app.preference_2_time || "");
      setDPref3Day(app.preference_3_day || "");
      setDPref3Time(app.preference_3_time || "");
      setDPref4Day(app.preference_4_day || "");
      setDPref4Time(app.preference_4_time || "");
      setDUnavail(app.unavailability_notes || "");
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

  // Fetch by group id, not the page's applications list — that list may be
  // filtered, which would silently drop members and skew the discount math.
  const { data: fetchedBuddyMembers } = useSWR(
    app?.buddy_group_id
      ? ["summer-buddy-group", app.buddy_group_id]
      : null,
    () => summerAPI.getApplications({ buddy_group_id: app!.buddy_group_id! })
  );

  const buddyMembers = useMemo(() => {
    if (!app?.buddy_group_id || !fetchedBuddyMembers) return [];
    return fetchedBuddyMembers.filter(a => a.id !== app.id);
  }, [app?.buddy_group_id, app?.id, fetchedBuddyMembers]);

  const effectiveDiscount = useMemo((): DiscountResult | null => {
    if (!app || !config?.pricing_config) return null;
    if (!app.buddy_group_id) {
      return computeBestDiscount(app, [app], config.pricing_config);
    }
    if (!fetchedBuddyMembers) return null;
    return computeBestDiscount(app, fetchedBuddyMembers, config.pricing_config);
  }, [app, config, fetchedBuddyMembers]);

  const verifySibling = async (id: number, status: SiblingVerificationStatus) => {
    setSiblingOverrides((prev) => ({ ...prev, [id]: status }));
    try {
      await summerAPI.adminUpdateSibling(id, { verification_status: status });
      showToast(`Sibling ${status.toLowerCase()}`, "success");
      onUpdated();
    } catch (e) {
      setSiblingOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      showToast(e instanceof Error ? e.message : "Failed", "error");
    }
  };

  if (!app) return null;

  // Once published, edits flow through the enrollment or require unpublish.
  // The Publish-bridge section stays interactive so the user can unpublish.
  const isPublished = !!app.published_enrollment_id;
  const canEdit = !readOnly && !isPublished;

  const detailChanged =
    dStudentName !== (app.student_name || "") ||
    dGrade !== (app.grade || "") ||
    dSchool !== (app.school || "") ||
    dWechat !== (app.wechat_id || "") ||
    dLocation !== (app.preferred_location || "") ||
    dSessionsPerWeek !== (app.sessions_per_week ?? 1) ||
    dPref1Day !== (app.preference_1_day || "") ||
    dPref1Time !== (app.preference_1_time || "") ||
    dPref2Day !== (app.preference_2_day || "") ||
    dPref2Time !== (app.preference_2_time || "") ||
    dPref3Day !== (app.preference_3_day || "") ||
    dPref3Time !== (app.preference_3_time || "") ||
    dPref4Day !== (app.preference_4_day || "") ||
    dPref4Time !== (app.preference_4_time || "") ||
    dUnavail !== (app.unavailability_notes || "");

  const hasChanges =
    status !== app.application_status ||
    notes !== (app.admin_notes || "") ||
    langStream !== (app.lang_stream || "") ||
    studentId !== (app.existing_student_id?.toString() || "") ||
    branchOrigin !== (app.verified_branch_origin || "") ||
    detailChanged;

  const buildUpdate = (): SummerApplicationUpdate => {
    const update: SummerApplicationUpdate = {};
    if (status !== app.application_status) update.application_status = status;
    if (notes !== (app.admin_notes || "")) update.admin_notes = notes;
    if (langStream !== (app.lang_stream || "")) update.lang_stream = langStream;
    const newStudentId = studentId ? parseInt(studentId, 10) : null;
    if (newStudentId !== (app.existing_student_id ?? null)) update.existing_student_id = newStudentId;
    const newBranch = branchOrigin || null;
    if (newBranch !== (app.verified_branch_origin ?? null)) update.verified_branch_origin = newBranch;
    if (dStudentName !== (app.student_name || "")) update.student_name = dStudentName;
    if (dGrade !== (app.grade || "")) update.grade = dGrade;
    if (dSchool !== (app.school || "")) update.school = dSchool;
    if (dWechat !== (app.wechat_id || "")) update.wechat_id = dWechat;
    if (dLocation !== (app.preferred_location || "")) update.preferred_location = dLocation;
    if (dSessionsPerWeek !== (app.sessions_per_week ?? 1)) update.sessions_per_week = dSessionsPerWeek;
    if (dPref1Day !== (app.preference_1_day || "")) update.preference_1_day = dPref1Day;
    if (dPref1Time !== (app.preference_1_time || "")) update.preference_1_time = dPref1Time;
    if (dPref2Day !== (app.preference_2_day || "")) update.preference_2_day = dPref2Day;
    if (dPref2Time !== (app.preference_2_time || "")) update.preference_2_time = dPref2Time;
    if (dPref3Day !== (app.preference_3_day || "")) update.preference_3_day = dPref3Day;
    if (dPref3Time !== (app.preference_3_time || "")) update.preference_3_time = dPref3Time;
    if (dPref4Day !== (app.preference_4_day || "")) update.preference_4_day = dPref4Day;
    if (dPref4Time !== (app.preference_4_time || "")) update.preference_4_time = dPref4Time;
    if (dUnavail !== (app.unavailability_notes || "")) update.unavailability_notes = dUnavail;
    return update;
  };

  const doSave = async () => {
    setSaving(true);
    try {
      await summerAPI.updateApplication(app.id, buildUpdate());
      showToast("Application updated", "success");
      onUpdated();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Update failed", "error");
    } finally {
      setSaving(false);
    }
  };

  // ─── Publish bridge ─────────────────────────────────────────────────────
  // Compute the same hard blocks the backend enforces, so we can disable
  // the Publish button with a clear tooltip explaining why. The backend
  // remains the source of truth and will re-validate on POST.
  const publishBlocker = ((): string | null => {
    if (!app) return "Loading…";
    if (app.published_enrollment_id) return null; // already published — separate UI
    if (!app.existing_student_id) {
      return "No student record linked — use the Student section below to link or create one.";
    }
    if (!FEE_SENT_OR_LATER.has(app.application_status)) {
      return "Send the fee message first — use the Fee Message section below, then click Mark as Sent.";
    }
    const sessions = app.sessions ?? [];
    if (sessions.length === 0) return "No sessions scheduled yet — go to the Arrangement page to place this student.";
    const tentativeCount = sessions.filter((s) => s.session_status === "Tentative").length;
    if (tentativeCount > 0) {
      return `${tentativeCount} session${tentativeCount !== 1 ? "s" : ""} still tentative — confirm them on the Arrangement page first.`;
    }
    const placedCount = app.placed_count ?? sessions.length;
    if (placedCount !== app.lessons_paid) {
      const diff = app.lessons_paid - placedCount;
      return diff > 0
        ? `Paid for ${app.lessons_paid} lessons but only ${placedCount} scheduled — add ${diff} more on the Arrangement page.`
        : `Scheduled ${placedCount} lessons but only ${app.lessons_paid} paid for — remove ${-diff} or update lessons paid.`;
    }
    return null;
  })();

  const doPublish = async () => {
    if (!app || publishBlocker || publishing) return;
    setPublishing(true);
    try {
      const result = await summerAPI.publishApplication(app.id);
      showToast("Published to enrollments", "success");
      // Patch the cache so the chip flips to "Published" and the
      // status advances to Enrolled (backend does the same transition).
      onOptimisticUpdate?.(app.id, {
        published_enrollment_id: result.enrollment_id,
        application_status: "Enrolled",
      });
      setStatus("Enrolled");
      onUpdated();
    } catch (e) {
      // Surface the structured error_code message from the backend.
      const msg = e instanceof Error ? e.message : "Publish failed";
      showToast(msg, "error");
    } finally {
      setPublishing(false);
    }
  };

  const openEnrollmentPopover = async (e: React.MouseEvent, enrollmentId: number) => {
    // Capture the click anchor before the async fetch so the popover
    // doesn't drift if the DOM reflows while loading.
    const pos = { x: e.clientX, y: e.clientY };
    setEnrollmentLoading(true);
    try {
      const enrollment = await enrollmentsAPI.getById(enrollmentId);
      setEnrollmentPopover({ enrollment, pos });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load enrollment", "error");
    } finally {
      setEnrollmentLoading(false);
    }
  };

  const doUnpublish = async () => {
    if (!app || publishing) return;
    setPublishing(true);
    try {
      const result = await summerAPI.unpublishApplication(app.id);
      showToast("Unpublished — enrollment removed", "success");
      onOptimisticUpdate?.(app.id, {
        published_enrollment_id: null,
        application_status: result.application_status,
      });
      setStatus(result.application_status);
      onUpdated();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unpublish failed";
      showToast(msg, "error");
    } finally {
      setPublishing(false);
      setPendingUnpublish(false);
    }
  };

  const handleSave = async () => {
    if (!hasChanges || saving || readOnly) return;
    // Gate the Submitted → anything else transition: admins need to acknowledge
    // that this locks the applicant out of self-service edits on the status page.
    if (
      app.application_status === "Submitted" &&
      status !== "Submitted" &&
      status !== app.application_status
    ) {
      setPendingStatusConfirm(status);
      return;
    }
    await doSave();
  };

  // Wraps any action that would navigate away from or close the modal so that
  // unsaved edits prompt a discard confirmation first. `useState` stores
  // functions wrapped in an extra closure because React treats a bare function
  // value as a lazy initializer / updater.
  const guardNav = (action: () => void) => {
    if (!hasChanges || readOnly) { action(); return; }
    setPendingDiscard(() => action);
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
  const classifiedPrefs = classifyPrefs(app);
  const submittedDate = app.submitted_at ? parseHKTimestamp(app.submitted_at).toLocaleString() : "—";
  const reviewedDate = app.reviewed_at ? parseHKTimestamp(app.reviewed_at).toLocaleString() : null;
  const nextStatuses = NEXT_STATUS_MAP[app.application_status];
  const locationConfig = locations?.find(l => l.name === app.preferred_location);

  const effectiveSiblings = (app.buddy_siblings ?? []).map((s) => ({
    ...s,
    verification_status: siblingOverrides[s.id] ?? s.verification_status,
  }));
  const visibleSiblings = nonRejectedSiblings(effectiveSiblings);
  const pendingSiblingCount = visibleSiblings.filter((s) => s.verification_status === "Pending").length;
  const hasBuddyContent =
    !!app.buddy_group_id || !!app.buddy_names || visibleSiblings.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => guardNav(onClose)}
      title={
        <div className="flex items-center gap-3">
          <span>{app.student_name}</span>
          <StatusBadge status={app.application_status} />
          <PrimaryBranchChip app={app} />
        </div>
      }
      size="xl"
      footer={
        <div className="flex items-center">
          {/* Left: Prev/Next navigation */}
          {(onPrev || onNext) && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onPrev && guardNav(onPrev)}
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
                onClick={() => onNext && guardNav(onNext)}
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
                onClick={() => guardNav(onClose)}
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
        {!readOnly && (
        <div className="space-y-3 md:order-2 md:border md:border-gray-200 md:dark:border-gray-700 md:bg-gray-100/60 md:dark:bg-gray-800/50 md:rounded-xl md:p-4">
          {nextStatuses && canEdit && (
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

          {isPublished && (
            <div className="rounded-md border border-green-200 dark:border-green-900/60 bg-green-50/70 dark:bg-green-900/20 px-2.5 py-2 text-[11px] leading-snug text-green-900 dark:text-green-200">
              This application is published. Status, placement, and linked
              student are locked — unpublish via step 4 to make changes, or
              edit the enrollment directly for tutor-facing updates.
            </div>
          )}

          <div className="space-y-2">
            <ChecklistRow
              index={0}
              title="Language stream"
              done={!!langStream}
              open={openStepIdx === 0}
              onToggle={() => setOpenStepIdx((i) => (i === 0 ? null : 0))}
              disabled={!canEdit}
              summary={langStream ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                  {langStream}
                </span>
              ) : (
                <span className="text-[10px] italic">Not set</span>
              )}
            >
              {(() => {
                const studentLang =
                  linkedStudent?.lang_stream && linkedStudent.id === app.existing_student_id
                    ? linkedStudent.lang_stream
                    : null;
                return studentLang && langStream === studentLang ? (
                  <div className="flex items-center gap-1.5">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      {langStream}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Check className="h-3 w-3" /> from student record
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 flex-wrap">
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
                    {studentLang && langStream && studentLang !== langStream && (
                      <button
                        onClick={() => setLangStream(studentLang)}
                        className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline ml-1"
                      >
                        Student is {studentLang}
                      </button>
                    )}
                    {studentLang && !langStream && (
                      <button
                        onClick={() => setLangStream(studentLang)}
                        className="text-[10px] text-primary hover:underline ml-1"
                      >
                        Use student&apos;s: {studentLang}
                      </button>
                    )}
                  </div>
                );
              })()}
            </ChecklistRow>

            <ChecklistRow
              index={1}
              title="Link student"
              done={!!studentId}
              open={openStepIdx === 1}
              onToggle={() => setOpenStepIdx((i) => (i === 1 ? null : 1))}
              disabled={!canEdit}
              summary={studentId && linkedStudent ? (
                <span className="inline-flex items-center gap-1 text-foreground">
                  <UserCheck className="h-3 w-3 text-green-500 shrink-0" />
                  <StudentInfoBadges
                    compact
                    showLink
                    student={{
                      student_id: linkedStudent.id,
                      student_name: linkedStudent.student_name,
                      school_student_id: linkedStudent.school_student_id || undefined,
                      grade: linkedStudent.grade || undefined,
                      lang_stream: linkedStudent.lang_stream || undefined,
                    }}
                  />
                </span>
              ) : studentId ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span className="text-[10px] italic">Not linked</span>
              )}
            >
              {studentId && linkedStudent ? (
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
                        showLocationPrefix
                      />
                    </div>
                    <div className="ml-6 mt-0.5">
                      {linkedStudent.enrollment_count != null && (
                        <span className="text-xs text-muted-foreground">
                          {linkedStudent.enrollment_count} enrollment{linkedStudent.enrollment_count !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
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
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Loading linked student...</span>
                  <button onClick={handleUnlink} className="ml-auto text-xs hover:underline">Unlink</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {isExisting && (
                    <div className="text-xs text-muted-foreground">
                      Applicant says: {app.is_existing_student}
                      {app.current_centers && app.current_centers.length > 0 && (
                        <> · {app.current_centers.join(", ")}</>
                      )}
                    </div>
                  )}

                  {autoSuggestions.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-1 px-0.5">
                        <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">
                          Suggested matches
                        </span>
                        <span className="text-[10px] text-muted-foreground">({autoSuggestions.length})</span>
                        <span className="ml-auto text-[10px] text-muted-foreground italic">Click a row to link</span>
                      </div>
                      <div className="border border-primary/20 bg-primary/[0.02] dark:bg-primary/[0.04] rounded-lg divide-y divide-primary/10 overflow-hidden">
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

                  <div>
                    {autoSuggestions.length > 0 && (
                      <div className="text-[10px] font-semibold text-foreground uppercase tracking-wider mb-1 px-0.5">
                        Or search manually
                      </div>
                    )}
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
                  </div>

                  {searchFocused && searchResults && searchResults.length > 0 && (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
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
                    <div className="text-xs text-muted-foreground text-center py-2 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                      No students found matching &ldquo;{debouncedStudentSearch}&rdquo;
                    </div>
                  )}

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
                        <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                          {manualIdResults.map((s) => (
                            <StudentSuggestionRow key={s.id} student={s} onClick={() => handleLinkStudent(s.id)} />
                          ))}
                        </div>
                      )}
                      {manualIdResults && manualIdResults.length === 0 && (
                        <div className="text-xs text-muted-foreground text-center py-2 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                          No student found with ID &ldquo;{manualIdConfirmed}&rdquo;
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => setShowManualId(true)}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        <Search className="h-3 w-3" />
                        Can&apos;t find? Enter student ID manually
                      </button>
                      <button
                        onClick={() => setCreateStudentOpen(true)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary border border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 px-3 py-1.5 rounded-md transition-colors shadow-sm"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Create new student
                      </button>
                    </div>
                  )}
                </div>
              )}
            </ChecklistRow>

            <ChecklistRow
              index={2}
              title="Fee message"
              done={FEE_SENT_OR_LATER.has(status)}
              open={openStepIdx === 2}
              onToggle={() => setOpenStepIdx((i) => (i === 2 ? null : 2))}
              disabled={!canEdit}
              summary={FEE_SENT_OR_LATER.has(status) ? (
                <span className="text-[10px] text-green-700 dark:text-green-300 font-medium">{status}</span>
              ) : (
                <span className="text-[10px] italic">Not sent</span>
              )}
            >
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMessagePanel("schedule")}
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                      messagePanel === "schedule"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700",
                    )}
                    title="Copy class schedule for parent"
                  >
                    <Copy className="h-3 w-3" />
                    Schedule
                  </button>
                  {effectiveDiscount && (
                    <button
                      type="button"
                      onClick={() => setMessagePanel("fee")}
                      className={cn(
                        "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                        messagePanel === "fee"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700",
                      )}
                      title="Copy fee message for parent"
                    >
                      <DollarSign className="h-3 w-3" />
                      Fee message
                    </button>
                  )}
                </div>
                {messagePanel && config && (messagePanel === "schedule" || effectiveDiscount) ? (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <SummerMessagePanel
                      app={app}
                      config={config}
                      discount={effectiveDiscount ?? undefined}
                      mode={messagePanel}
                      onClose={() => setMessagePanel(null)}
                      onMarkSent={(newStatus) => {
                        // Sync the local form status so the Move-to pills and the
                        // hasChanges check reflect the new backend state. Without
                        // this, Save would think there are unsaved edits and
                        // overwrite 'Fee Sent' with the stale local value.
                        setStatus(newStatus);
                        // Patch the SWR cache so the title badge and the panel's
                        // own showMarkSent/showUnmarkSent flip instantly.
                        onOptimisticUpdate?.(app.id, { application_status: newStatus });
                        onUpdated();
                      }}
                    />
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">
                    Pick Schedule or Fee message above to generate copy for the parent.
                  </div>
                )}
              </div>
            </ChecklistRow>

            {/* Publish stays interactive when the rest is locked so admins can unpublish. */}
            <ChecklistRow
              index={3}
              title="Publish"
              done={!!app.published_enrollment_id}
              open={openStepIdx === 3}
              onToggle={() => setOpenStepIdx((i) => (i === 3 ? null : 3))}
              summary={app.published_enrollment_id ? (
                <span className="text-[10px] text-green-700 dark:text-green-300 font-medium">
                  Enrollment #{app.published_enrollment_id}
                </span>
              ) : publishBlocker ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <AlertTriangle className="h-3 w-3" />
                  Blocked
                </span>
              ) : (
                <span className="text-[10px] text-primary font-medium">Ready</span>
              )}
            >
              {app.published_enrollment_id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) =>
                      app.published_enrollment_id &&
                      openEnrollmentPopover(e, app.published_enrollment_id)
                    }
                    disabled={enrollmentLoading}
                    title="Open enrollment details"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/60 cursor-pointer disabled:opacity-60"
                  >
                    {enrollmentLoading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Published · Enrollment #{app.published_enrollment_id}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingUnpublish(true)}
                    disabled={publishing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60 disabled:opacity-50"
                  >
                    {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    Unpublish
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={doPublish}
                    disabled={!!publishBlocker || publishing}
                    title={publishBlocker ?? "Create the summer enrollment so tutors can start marking attendance for these sessions."}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                      publishBlocker
                        ? "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500 cursor-not-allowed"
                        : "bg-primary text-primary-foreground hover:bg-primary/90",
                    )}
                  >
                    {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Publish
                  </button>
                  {publishBlocker && (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {publishBlocker}
                    </span>
                  )}
                </div>
              )}
            </ChecklistRow>
          </div>

          {!readOnly && (
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
          )}
        </div>
        )}

        {/* === RIGHT COLUMN: Info sections (icon-block layout) === */}
        <div className={cn("space-y-4", !readOnly && "md:order-1")}>
          {!readOnly && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Details</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <History className="h-3 w-3" />
                  {historyOpen ? "Hide history" : "History"}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setEditingDetails((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80"
                  >
                    <Pencil className="h-3 w-3" />
                    {editingDetails ? "Done editing" : "Edit details"}
                  </button>
                )}
              </div>
            </div>
          )}

          {historyOpen && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-2 max-h-60 overflow-y-auto">
              {!editHistory ? (
                <div className="text-[11px] text-muted-foreground">Loading...</div>
              ) : editHistory.length === 0 ? (
                <div className="text-[11px] text-muted-foreground">No edits yet.</div>
              ) : (
                <ul className="space-y-1.5">
                  {editHistory.map((e: SummerApplicationEditEntry) => (
                    <li key={e.id} className="text-[11px] leading-snug">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground">
                          {parseHKTimestamp(e.edited_at).toLocaleString()}
                        </span>
                        <span className={cn(
                          "px-1 rounded text-[9px] font-medium uppercase",
                          e.edited_via === "admin"
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        )}>
                          {e.edited_via}
                        </span>
                        {e.edited_by && <span className="text-muted-foreground">{e.edited_by}</span>}
                      </div>
                      <div className="text-foreground">
                        <span className="font-medium">{e.field_name}</span>:{" "}
                        <span className="text-muted-foreground line-through">{e.old_value || "—"}</span>
                        {" → "}
                        <span>{e.new_value || "—"}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {editingDetails && !readOnly ? (
            <div className="space-y-3 rounded-lg border border-dashed border-primary/40 p-3 bg-primary/5">
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Student name</label>
                  <input type="text" value={dStudentName} onChange={(e) => setDStudentName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">Grade</label>
                  <input type="text" value={dGrade} onChange={(e) => setDGrade(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-0.5">School</label>
                  <input type="text" value={dSchool} onChange={(e) => setDSchool(e.target.value)} className={inputClass} />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                    <WeChatIcon className="h-3 w-3 text-green-600" />
                    WeChat ID
                  </label>
                  <input type="text" value={dWechat} onChange={(e) => setDWechat(e.target.value)} className={inputClass} />
                </div>
              </div>

              {formConfig ? (
                <ClassPreferencesStep
                  config={formConfig}
                  lang="en"
                  selectedLocation={dLocation}
                  setSelectedLocation={setDLocation}
                  sessionsPerWeek={dSessionsPerWeek}
                  setSessionsPerWeek={setDSessionsPerWeek}
                  pref1Day={dPref1Day}
                  setPref1Day={setDPref1Day}
                  pref1Time={dPref1Time}
                  setPref1Time={setDPref1Time}
                  pref2Day={dPref2Day}
                  setPref2Day={setDPref2Day}
                  pref2Time={dPref2Time}
                  setPref2Time={setDPref2Time}
                  pref3Day={dPref3Day}
                  setPref3Day={setDPref3Day}
                  pref3Time={dPref3Time}
                  setPref3Time={setDPref3Time}
                  pref4Day={dPref4Day}
                  setPref4Day={setDPref4Day}
                  pref4Time={dPref4Time}
                  setPref4Time={setDPref4Time}
                  unavailability={dUnavail}
                  setUnavailability={setDUnavail}
                />
              ) : (
                <div className="text-xs text-muted-foreground">Loading form config...</div>
              )}
            </div>
          ) : (
          <>
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
                <PrimaryBranchChip app={app} />
                {/* Show original claim when verified result overrides it */}
                {(() => {
                  const verified = app.verified_branch_origin;
                  if (!verified) return null;
                  const claimsExisting =
                    !!app.claimed_branch_code &&
                    !!app.is_existing_student &&
                    app.is_existing_student !== "None";
                  const originalLabel = claimsExisting ? app.claimed_branch_code! : "New";
                  if (originalLabel === verified) return null;
                  return (
                    <span
                      className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground border border-gray-300 dark:border-gray-600 px-1.5 py-0.5 rounded line-through opacity-60"
                      title={`Original claim: ${originalLabel} (overridden by verification)`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className={claimsExisting ? "font-mono" : undefined}>{originalLabel}</span>
                    </span>
                  );
                })()}
                {!canEdit ? (
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded shrink-0",
                    app.verified_branch_origin
                      ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-semibold"
                      : "bg-gray-100 dark:bg-gray-800 text-muted-foreground italic"
                  )}>
                    {app.verified_branch_origin ? `✓ ${app.verified_branch_origin}` : "Unverified"}
                  </span>
                ) : (
                  <select
                    value={branchOrigin}
                    onChange={(e) => setBranchOrigin(e.target.value)}
                    title={app.is_existing_student && app.is_existing_student !== "None"
                      ? `Applicant claims: ${app.is_existing_student}`
                      : "Verified branch origin"}
                    className="text-[10px] pl-1.5 pr-5 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-foreground shrink-0 appearance-none bg-[length:12px] bg-[right_2px_center] bg-no-repeat bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')]"
                  >
                    <option value="">Unverified</option>
                    <option value="New">New</option>
                    {[...Object.keys(BRANCH_INFO).filter(c => c !== "KC"), "MSA", "MSB"].map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                )}
              </div>
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
                <FieldValue
                  label={<span className="inline-flex items-center gap-1"><WeChatIcon className="h-3 w-3 text-green-600" />WeChat</span>}
                  value={app.wechat_id}
                  copyable
                />
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
          {(classifiedPrefs.primary.length > 0 || classifiedPrefs.backup.length > 0 || app.unavailability_notes || (app.sessions_per_week ?? 1) > 1) && (
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-lg shrink-0">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-gray-500 dark:text-gray-400">Schedule Preferences</div>
                {(app.sessions_per_week ?? 1) > 1 && (
                  <div className="text-sm font-medium text-foreground">
                    {app.sessions_per_week}× per week
                  </div>
                )}
                {classifiedPrefs.isPair ? (
                  <>
                    {classifiedPrefs.primary.length > 0 && (
                      <div className="mt-1">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Primary pair</div>
                        {classifiedPrefs.primary.map((s, i) => (
                          <div key={`p-${i}`} className="text-sm font-medium text-foreground">{s.day} {s.time}</div>
                        ))}
                      </div>
                    )}
                    {classifiedPrefs.backup.length > 0 && (
                      <div className="mt-1">
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Backup pair</div>
                        {classifiedPrefs.backup.map((s, i) => (
                          <div key={`b-${i}`} className="text-sm font-medium text-foreground">{s.day} {s.time}</div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
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
                  </>
                )}
                {app.unavailability_notes && (
                  <div className="text-xs text-red-500 dark:text-red-400 mt-1">Unavailable: {app.unavailability_notes}</div>
                )}
              </div>
            </div>
          )}
          </>
          )}

          {/* Placement Info */}
          <div className="flex items-start gap-3">
            <div className="p-1.5 bg-teal-100 dark:bg-teal-900/30 rounded-lg shrink-0">
              <Grid3X3 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="min-w-0 flex-1">
              {(() => {
                const planTotal = app.total_lessons ?? 8;
                const planCurrent = app.lessons_paid ?? planTotal;
                const isPartialPlan = planCurrent < planTotal;
                const placedCount = app.placed_count ?? app.sessions?.filter(
                  (s) => s.session_status !== "Cancelled",
                ).length ?? 0;
                const planOptions: number[] = [];
                for (let i = 4; i <= planTotal; i++) planOptions.push(i);
                const handleSavePlan = async () => {
                  const value = planDraft ?? planCurrent;
                  if (value === planCurrent) {
                    setPlanEditorOpen(false);
                    return;
                  }
                  setPlanSaving(true);
                  try {
                    const updatedApp = await summerAPI.updateApplication(app.id, { lessons_paid: value });
                    // Splice directly so the modal's post-save render sees the
                    // new value; parent's onUpdated races otherwise.
                    await globalMutate(
                      appCachesMatcher(app.id),
                      (cached: unknown) => {
                        if (Array.isArray(cached)) {
                          return cached.map((a: SummerApplication) =>
                            a.id === app.id ? updatedApp : a,
                          );
                        }
                        return updatedApp;
                      },
                      { revalidate: false },
                    );
                    await onUpdated();
                    showToast(`Session plan updated to ${value} lesson${value === 1 ? "" : "s"}.`, "success");
                    setPlanEditorOpen(false);
                    setPlanDraft(null);
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : "Please try again";
                    showToast(`Could not update session plan: ${msg}`, "error");
                  } finally {
                    setPlanSaving(false);
                  }
                };
                return (
              <>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-gray-500 dark:text-gray-400">Placement</div>
                {!readOnly && config && (app.sessions?.length ?? 0) > 0 && (() => {
                  const renderToggle = (
                    key: SummerMessageMode,
                    Icon: typeof Copy,
                    label: string,
                    title: string,
                  ) => (
                    <button
                      type="button"
                      onClick={() => {
                        setMessagePanel((m) => (m === key ? null : key));
                        // Placement lives in the info pane but the generated
                        // message renders inside the Fee-message checklist row
                        // on the right — auto-expand it so the toggle has
                        // something visible to show.
                        setOpenStepIdx(2);
                      }}
                      className={cn(
                        "inline-flex items-center gap-1 text-[11px]",
                        messagePanel === key
                          ? "font-medium text-primary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      title={title}
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                    </button>
                  );
                  return (
                    <div className="flex items-center gap-2">
                      {renderToggle("schedule", Copy, "Schedule", "Copy class schedule for parent")}
                      {effectiveDiscount && renderToggle("fee", DollarSign, "Fee message", "Copy fee message for parent")}
                    </div>
                  );
                })()}
              </div>
              {/* Session plan row — visible on every placement, gated editor for admins */}
              <div className="mt-1 text-xs">
                {!planEditorOpen ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground">Session plan:</span>
                    <span className={cn(
                      "tabular-nums font-medium",
                      isPartialPlan ? "text-amber-600 dark:text-amber-400" : "text-foreground",
                    )}>
                      {planCurrent} lessons
                    </span>
                    {isPartialPlan && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0.5"
                        title="Flat per-lesson rate, no discounts apply."
                      >
                        Partial
                      </span>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setPlanDraft(planCurrent);
                          setPlanEditorOpen(true);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                        title="Change how many lessons this student is paying for"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit session plan
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3 space-y-2">
                    <div className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
                      Session plan defaults to all {planTotal} lessons with bulk pricing and
                      eligible discounts. Lower this <strong>only</strong> for students on a
                      negotiated shorter plan — they will pay a flat per-lesson rate with no
                      discounts applied. Any placed sessions beyond the new count must be
                      cancelled first.
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-[11px] font-medium text-foreground/80">Lessons:</label>
                      <select
                        value={planDraft ?? planCurrent}
                        onChange={(e) => setPlanDraft(parseInt(e.target.value, 10))}
                        disabled={planSaving}
                        className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-foreground disabled:opacity-50"
                      >
                        {planOptions.map((n) => (
                          <option key={n} value={n}>{n}{n === planTotal ? " (full plan)" : ""}</option>
                        ))}
                      </select>
                      {placedCount > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          {placedCount} session{placedCount === 1 ? "" : "s"} placed
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPlanEditorOpen(false);
                            setPlanDraft(null);
                          }}
                          disabled={planSaving}
                          className="px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSavePlan}
                          disabled={planSaving || (planDraft ?? planCurrent) === planCurrent}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          {planSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {app.sessions && app.sessions.length > 0 ? (() => {
                const sorted = sortSessionsByDate(app.sessions);
                return (
                  <div className="space-y-0.5 mt-1">
                    {sorted.map((p) => {
                      const day = p.lesson_date ? getDayFromDate(p.lesson_date) : p.slot_day;
                      const startTime = p.time_slot ? getStartTime(p.time_slot) : "";
                      return (
                        <div key={p.id} title={p.session_status} className={cn(
                          "flex items-center gap-2 text-sm px-2 py-1 rounded",
                          sessionStatusBg(p.session_status),
                          p.session_status === RESCHEDULED_STATUS && "opacity-80",
                        )}>
                          <span className={cn(
                            "text-[10px] font-semibold tabular-nums px-1.5 rounded shrink-0 w-7 text-center",
                            p.session_status === RESCHEDULED_STATUS
                              ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 line-through"
                              : "bg-primary/10 text-primary",
                          )}>
                            L{p.lesson_number ?? "—"}
                          </span>
                          {p.session_status === "Confirmed"
                            ? <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                            : p.session_status === RESCHEDULED_STATUS
                              ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                              : <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                          <span className={cn(
                            "font-medium tabular-nums w-16 shrink-0",
                            p.session_status === RESCHEDULED_STATUS
                              ? "line-through text-orange-600 dark:text-orange-400"
                              : "text-foreground"
                          )}>
                            {p.lesson_date ? formatCompactDate(p.lesson_date) : p.slot_day}
                          </span>
                          <span className="text-muted-foreground text-xs shrink-0">
                            {day} {startTime}
                          </span>
                          {(p.grade || p.course_type) && (
                            <span className="inline-flex items-center text-[10px] font-semibold rounded shrink-0 overflow-hidden">
                              {p.grade && (
                                <span className={cn(
                                  "px-1",
                                  SUMMER_GRADE_BG[p.grade] || "bg-gray-100 dark:bg-gray-700 text-muted-foreground",
                                )}>
                                  {p.grade}
                                </span>
                              )}
                              {p.course_type && (
                                <span className={cn(
                                  "px-1",
                                  COURSE_TYPE_COLORS[p.course_type] || "bg-primary/10 text-primary",
                                )}>
                                  {p.course_type}
                                </span>
                              )}
                            </span>
                          )}
                          {p.tutor_name && (
                            <span className="text-xs text-muted-foreground truncate" title={p.tutor_name}>
                              {getTutorFirstName(p.tutor_name)}
                            </span>
                          )}
                          <div className="ml-auto flex items-center gap-1.5 shrink-0">
                            {canEdit
                              && p.session_status !== RESCHEDULED_STATUS
                              && p.session_status !== "Cancelled" && (() => {
                              const target = {
                                id: p.id,
                                lessonNumber: p.lesson_number ?? 0,
                                dateLabel: p.lesson_date ? formatCompactDate(p.lesson_date) : (p.slot_day ?? ""),
                              };
                              return (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setPendingAction({ kind: "reschedule", ...target })}
                                    title="Mark this lesson for make-up"
                                    className="p-0.5 rounded opacity-60 hover:opacity-100 hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-600 dark:text-orange-400 transition-colors"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingAction({ kind: "delete", ...target })}
                                    title="Delete this placement"
                                    className="p-0.5 rounded opacity-60 hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })() : (
                <div className="text-sm text-muted-foreground">Not yet placed</div>
              )}
              </>
                );
              })()}
            </div>
          </div>

          {/* Buddy Group — always shown so admins can assign/change groups */}
          {(
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-violet-100 dark:bg-violet-900/30 rounded-lg shrink-0">
                <Users className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBuddySectionCollapsed((v) => !v)}
                    className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-foreground"
                  >
                    {buddySectionCollapsed ? (
                      <ChevronRight className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                    <span>Buddy Group</span>
                  </button>
                  {pendingSiblingCount > 0 && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 ring-1 ring-amber-300/60"
                      title="Sibling claims awaiting verification"
                    >
                      {pendingSiblingCount} pending
                    </span>
                  )}
                  {!buddyEditing && !buddySectionCollapsed && canEdit && (
                    <button
                      onClick={() => {
                        setBuddyEditing(true);
                        setBuddyEditCode("");
                        setBuddyEditValid(null);
                      }}
                      className="text-[10px] text-primary hover:text-primary-hover underline"
                    >
                      Change
                    </button>
                  )}
                </div>
                {buddySectionCollapsed ? (
                  <div className="text-xs text-muted-foreground mt-1">
                    {app.buddy_code ? (
                      <>
                        <span className="font-mono">{app.buddy_code}</span>
                        {visibleSiblings.length > 0 && (
                          <span> · {visibleSiblings.length} sibling{visibleSiblings.length !== 1 ? "s" : ""}</span>
                        )}
                      </>
                    ) : hasBuddyContent ? (
                      "Buddy details hidden"
                    ) : (
                      "No buddy group"
                    )}
                  </div>
                ) : (
                  <>
                {buddyEditing ? (
                  <div className="mt-1 space-y-2">
                    <div className="flex gap-1 text-[10px]">
                      <button
                        onClick={() => setBuddyEditMode("search")}
                        className={cn(
                          "px-2 py-1 rounded-md border transition-colors",
                          buddyEditMode === "search"
                            ? "bg-primary/10 border-primary text-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        )}
                      >
                        Find application
                      </button>
                      <button
                        onClick={() => setBuddyEditMode("code")}
                        className={cn(
                          "px-2 py-1 rounded-md border transition-colors",
                          buddyEditMode === "code"
                            ? "bg-primary/10 border-primary text-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        )}
                      >
                        Enter code
                      </button>
                    </div>

                    {buddyEditMode === "code" ? (
                      <div className="space-y-1.5">
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={buddyEditCode}
                            onChange={(e) => {
                              setBuddyEditCode(e.target.value.toUpperCase());
                              setBuddyEditValid(null);
                            }}
                            className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-border bg-background"
                            placeholder="BG-XXXX"
                          />
                          <button
                            onClick={async () => {
                              if (!buddyEditCode.trim()) return;
                              setBuddyEditLoading(true);
                              try {
                                const res = await summerAPI.getBuddyGroup(buddyEditCode.trim());
                                setBuddyEditValid(true);
                                setBuddyEditGroupFull(res.is_full);
                                setBuddyEditMaxMembers(res.max_members);
                              } catch {
                                setBuddyEditValid(false);
                                setBuddyEditGroupFull(false);
                              } finally {
                                setBuddyEditLoading(false);
                              }
                            }}
                            disabled={buddyEditLoading}
                            className="text-[10px] px-2 py-1.5 rounded-lg bg-secondary text-secondary-foreground hover:bg-muted"
                          >
                            {buddyEditLoading ? "..." : "Verify"}
                          </button>
                        </div>
                        {buddyEditValid === true && !buddyEditGroupFull && (
                          <div className="text-[10px] text-green-600">Valid code</div>
                        )}
                        {buddyEditValid === true && buddyEditGroupFull && (
                          <div className="text-[10px] text-amber-600">
                            ⚠ Group already has {buddyEditMaxMembers} members — admin override will add a {buddyEditMaxMembers + 1}th (public cap bypassed).
                          </div>
                        )}
                        {buddyEditValid === false && (
                          <div className="text-[10px] text-red-600">Invalid code</div>
                        )}
                        {buddyEditValid && (
                          <button
                            onClick={() =>
                              setBuddyPendingAction({
                                type: "join",
                                code: buddyEditCode.trim(),
                                targetLabel: `code ${buddyEditCode.trim()}`,
                              })
                            }
                            className="text-[10px] px-2 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-primary-hover"
                          >
                            Join this group
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={buddySearchQuery}
                          onChange={(e) => setBuddySearchQuery(e.target.value)}
                          className="w-full text-xs px-2 py-1.5 rounded-lg border border-border bg-background"
                          placeholder="Search by name, ref code, or phone..."
                        />
                        {buddySearchLoading && (
                          <div className="text-[10px] text-muted-foreground">Searching...</div>
                        )}
                        {!buddySearchLoading && debouncedBuddySearch && buddySearchResults.length === 0 && (
                          <div className="text-[10px] text-muted-foreground">No matches</div>
                        )}
                        {buddySearchResults.length > 0 && (
                          <div className="max-h-40 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                            {buddySearchResults.map((r) => {
                              const sameGroup =
                                r.buddy_group_id != null && r.buddy_group_id === app.buddy_group_id;
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  disabled={sameGroup}
                                  onClick={() => {
                                    if (r.buddy_code) {
                                      setBuddyPendingAction({
                                        type: "join",
                                        code: r.buddy_code,
                                        targetLabel: `${r.student_name}'s group (${r.buddy_code})`,
                                      });
                                    } else {
                                      showToast(
                                        `${r.student_name} has no buddy group — create one from their application first`,
                                        "error"
                                      );
                                    }
                                  }}
                                  className={cn(
                                    "w-full text-left px-2 py-1.5 text-[11px] flex items-center gap-2",
                                    sameGroup
                                      ? "bg-muted/50 cursor-not-allowed opacity-60"
                                      : "hover:bg-muted"
                                  )}
                                >
                                  <span className="flex-1 truncate">
                                    <span className="font-medium">{r.student_name}</span>
                                    {r.reference_code && (
                                      <span className="ml-1.5 font-mono text-muted-foreground">
                                        {r.reference_code}
                                      </span>
                                    )}
                                  </span>
                                  {r.buddy_code ? (
                                    <span className="font-mono text-primary shrink-0">
                                      {r.buddy_code}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground shrink-0 italic">
                                      no group
                                    </span>
                                  )}
                                  {sameGroup && (
                                    <span className="text-[9px] text-muted-foreground shrink-0">
                                      same group
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border">
                      <button
                        onClick={() => setBuddyPendingAction({ type: "create" })}
                        className="text-[10px] px-2 py-1 rounded-lg border border-dashed border-primary text-primary hover:bg-primary/10"
                      >
                        Create new group
                      </button>
                      {app.buddy_group_id && (
                        <button
                          onClick={() => setBuddyPendingAction({ type: "remove" })}
                          className="text-[10px] px-2 py-1 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          Remove from group
                        </button>
                      )}
                      <button
                        onClick={() => setBuddyEditing(false)}
                        className="text-[10px] px-2 py-1 text-muted-foreground hover:text-foreground underline ml-auto"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {app.buddy_code && <FieldValue label="Code" value={app.buddy_code} mono copyable />}
                    {app.buddy_referrer_name && <FieldValue label="Referrer" value={app.buddy_referrer_name} />}
                    {app.buddy_names && <div className="text-xs text-muted-foreground">Requested: {app.buddy_names}</div>}
                    {!app.buddy_group_id && !app.buddy_names && (
                      <div className="text-xs text-muted-foreground italic">No buddy group</div>
                    )}
                  </>
                )}
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
                ) : app.buddy_group_id && visibleSiblings.length === 0 ? (
                  <div className="text-xs text-muted-foreground mt-1">No other members yet</div>
                ) : null}
                {visibleSiblings.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-[10px] uppercase tracking-wide",
                          pendingSiblingCount > 0
                            ? "text-amber-700 dark:text-amber-300 font-semibold"
                            : "text-muted-foreground"
                        )}
                      >
                        {pendingSiblingCount > 0
                          ? `⚠ ${pendingSiblingCount} sibling${pendingSiblingCount > 1 ? "s" : ""} pending verification`
                          : "Declared Primary / KidsConcept Siblings"}
                      </span>
                    </div>
                    {visibleSiblings.map((sib) => {
                      const branchInfo = BRANCH_INFO[sib.source_branch];
                      const branchTitle = branchInfo?.district || sib.source_branch;
                      const isPending = sib.verification_status === "Pending";
                      const isConfirmed = sib.verification_status === "Confirmed";
                      const declaredByOther =
                        sib.declared_by_application_id != null &&
                        sib.declared_by_application_id !== app.id;
                      return (
                        <div
                          key={`sib-${sib.id}`}
                          className={cn(
                            "rounded-lg border p-2 space-y-1.5",
                            isPending
                              ? "border-amber-300 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-900/10"
                              : "border-border bg-card"
                          )}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{sib.name_en}</span>
                            <span
                              className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded font-medium",
                                branchInfo?.badge ?? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300"
                              )}
                              title={branchTitle}
                            >
                              {sib.source_branch}
                            </span>
                            <span
                              className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded font-medium",
                                isConfirmed
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                              )}
                            >
                              {sib.verification_status}
                            </span>
                            {declaredByOther && sib.declared_by_name && (
                              <span className="text-[10px] text-muted-foreground">
                                declared by {sib.declared_by_name}
                              </span>
                            )}
                          </div>
                          {canEdit && (
                            <div className="flex items-center gap-1.5">
                              {isPending ? (
                                <>
                                  <button
                                    onClick={() => verifySibling(sib.id, "Confirmed")}
                                    className="text-xs font-medium px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() =>
                                      setSiblingPendingReject({ id: sib.id, name: sib.name_en })
                                    }
                                    className="text-xs font-medium px-3 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => verifySibling(sib.id, "Pending")}
                                  className="text-[10px] text-muted-foreground hover:text-foreground underline"
                                >
                                  Undo
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Fee summary — best discount + near-miss hint */}
          {effectiveDiscount && typeof baseFee === "number" && baseFee > 0 && (
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg shrink-0">
                <DollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-gray-500 dark:text-gray-400">Fee</div>
                <div className="mt-1 flex items-baseline gap-2 flex-wrap">
                  <span className="text-lg font-semibold text-foreground">${effectiveDiscount.finalFee.toLocaleString()}</span>
                  {effectiveDiscount.best && (
                    <span className="text-xs text-muted-foreground">
                      = ${baseFee.toLocaleString()} − ${effectiveDiscount.amount}
                    </span>
                  )}
                </div>
                {effectiveDiscount.best ? (
                  <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                    <span className="font-mono font-semibold">{effectiveDiscount.best.code}</span>
                    <span className="text-muted-foreground"> · {effectiveDiscount.best.name_en}</span>
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-muted-foreground">No discount applied · pays full price</div>
                )}
                {effectiveDiscount.nearMiss && (
                  <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    {effectiveDiscount.nearMiss.neededMembers} more buddy member{effectiveDiscount.nearMiss.neededMembers === 1 ? "" : "s"} to unlock{" "}
                    <span className="font-mono font-semibold">{effectiveDiscount.nearMiss.discount.code}</span>
                    <span> (−${effectiveDiscount.nearMiss.extraSavings} more)</span>
                  </div>
                )}
                {(app.application_status === "Paid" || app.application_status === "Enrolled") && (
                  <div className="mt-1">
                    <PaidAtEditor
                      applicationId={app.id}
                      paidAt={app.paid_at}
                      onSaved={onUpdated}
                    />
                  </div>
                )}
                <div className="mt-2">
                  <TierStatusCallout
                    config={config?.pricing_config}
                    currentCode={effectiveDiscount.best?.code ?? "NONE"}
                    currentAmount={effectiveDiscount.amount}
                  />
                </div>
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

      {(() => {
        const action = buddyPendingAction;
        const isOverride = action?.type === "join" && buddyEditGroupFull;
        const name = app?.student_name;
        const dialog: { title: string; message: string; confirmText: string; variant: "danger" | "warning" } =
          action?.type === "remove"
            ? {
                title: "Remove from buddy group?",
                message: `${name} will be removed from their current buddy group.`,
                confirmText: "Remove",
                variant: "danger",
              }
            : action?.type === "create"
            ? {
                title: "Create new buddy group?",
                message: `${name} will be placed in a newly created buddy group.`,
                confirmText: "Create",
                variant: "warning",
              }
            : isOverride
            ? {
                title: "⚠ Override buddy group cap?",
                message: `${name} will be moved to ${action.targetLabel}, which is already at the ${buddyEditMaxMembers}-member public cap. Public applicants are blocked at this cap — this override is only for manual pairing.`,
                confirmText: "Override cap & Join",
                variant: "danger",
              }
            : {
                title: "Join buddy group?",
                message: `${name} will be moved to ${action?.type === "join" ? action.targetLabel : ""}.`,
                confirmText: "Join",
                variant: "warning",
              };
        const consequences: string[] = [];
        if (app?.buddy_group_id && action?.type !== "remove") {
          consequences.push(
            `Currently in ${app.buddy_code ? `group ${app.buddy_code}` : "a buddy group"}. This connection will be replaced.`,
          );
          consequences.push("Other members of the old group are not affected.");
        }
        if (action?.type === "remove") {
          consequences.push("The applicant will no longer be part of any buddy group.");
        }
        return (
          <ConfirmDialog
            isOpen={action !== null}
            onCancel={() => {
              if (!buddyEditLoading) setBuddyPendingAction(null);
            }}
            onConfirm={() => {
              if (!action) return;
              if (action.type === "join") {
                runBuddyUpdate(action.code, "Joined buddy group", buddyEditGroupFull);
              } else if (action.type === "create") {
                runBuddyUpdate("NEW", "Created new buddy group");
              } else if (action.type === "remove") {
                runBuddyUpdate("", "Removed from buddy group");
              }
            }}
            title={dialog.title}
            message={dialog.message}
            consequences={consequences.length > 0 ? consequences : undefined}
            confirmText={dialog.confirmText}
            variant={dialog.variant}
            loading={buddyEditLoading}
          />
        );
      })()}

      <ConfirmDialog
        isOpen={pendingStatusConfirm !== null}
        onCancel={() => setPendingStatusConfirm(null)}
        onConfirm={async () => {
          setPendingStatusConfirm(null);
          await doSave();
        }}
        title={`Move to ${pendingStatusConfirm ?? ""}?`}
        message="Moving this application out of Submitted will lock the applicant out of self-service edits on the status page."
        consequences={[
          "The applicant will need to contact you for any further changes to time slots, school, or other details.",
          "You can still edit all fields as an admin from this modal.",
        ]}
        confirmText={`Move to ${pendingStatusConfirm ?? ""}`}
        variant="warning"
        loading={saving}
      />

      <ConfirmDialog
        isOpen={pendingDiscard !== null}
        onCancel={() => setPendingDiscard(null)}
        onConfirm={() => {
          const action = pendingDiscard;
          setPendingDiscard(null);
          action?.();
        }}
        title="Discard unsaved changes?"
        message="You have unsaved edits to this application. Leaving now will lose them."
        confirmText="Discard"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={pendingUnpublish}
        onCancel={() => { if (!publishing) setPendingUnpublish(false); }}
        onConfirm={doUnpublish}
        title="Unpublish this application?"
        message="The native Summer enrollment and all of its scheduled sessions will be deleted. The summer placements themselves remain — you can re-publish at any time."
        consequences={[
          "Will fail if any session has already been marked attended.",
          "Application status will revert to its pre-publish state (typically Paid or Fee Sent).",
        ]}
        confirmText="Unpublish"
        variant="warning"
        loading={publishing}
      />

      {enrollmentPopover && (
        <EnrollmentDetailPopover
          enrollment={enrollmentPopover.enrollment}
          isOpen={true}
          onClose={() => setEnrollmentPopover(null)}
          clickPosition={enrollmentPopover.pos}
        />
      )}

      <ConfirmDialog
        isOpen={siblingPendingReject !== null}
        onCancel={() => setSiblingPendingReject(null)}
        onConfirm={() => {
          if (siblingPendingReject) {
            verifySibling(siblingPendingReject.id, "Rejected");
            setSiblingPendingReject(null);
          }
        }}
        title="Reject sibling claim?"
        message={
          siblingPendingReject
            ? `${siblingPendingReject.name} will be removed from this buddy group's member count, which may drop the group below the discount threshold.`
            : ""
        }
        confirmText="Reject"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={pendingAction !== null}
        onCancel={() => { if (!actionBusy) setPendingAction(null); }}
        onConfirm={async () => {
          if (!pendingAction) return;
          const { kind, id } = pendingAction;
          setActionBusy(true);
          try {
            if (kind === "reschedule") {
              await summerAPI.updateSessionStatus(id, { session_status: RESCHEDULED_STATUS });
            } else {
              await summerAPI.deleteSession(id, false);
            }
            // Arrangement page's onUpdated doesn't touch ["summer-app", id],
            // so revalidate the modal's caches alongside it.
            await Promise.all([
              globalMutate(appCachesMatcher(app.id)),
              onUpdated(),
            ]);
            showToast(kind === "reschedule" ? "Lesson marked for make-up" : "Placement deleted", "success");
            setPendingAction(null);
          } catch (e) {
            const fallback = kind === "reschedule" ? "Failed to reschedule" : "Failed to delete";
            showToast(e instanceof Error ? e.message : fallback, "error");
          } finally {
            setActionBusy(false);
          }
        }}
        title={pendingAction?.kind === "reschedule" ? "Mark lesson for make-up?" : "Delete placement?"}
        message={
          pendingAction
            ? pendingAction.kind === "reschedule"
              ? `L${pendingAction.lessonNumber} (${pendingAction.dateLabel}) will be released from this slot. The student will need a make-up session.`
              : `L${pendingAction.lessonNumber} (${pendingAction.dateLabel}) will be removed from this slot.`
            : ""
        }
        confirmText={
          pendingAction?.kind === "reschedule"
            ? (actionBusy ? "Marking…" : "Mark for make-up")
            : (actionBusy ? "Deleting…" : "Delete")
        }
        variant={pendingAction?.kind === "reschedule" ? "warning" : "danger"}
      />

      <AddStudentModal
        isOpen={createStudentOpen}
        onClose={() => setCreateStudentOpen(false)}
        onSuccess={async (student) => {
          setCreateStudentOpen(false);
          handleLinkStudent(student.id);
          try {
            await summerAPI.updateApplication(app.id, {
              existing_student_id: student.id,
            });
            showToast(`Created ${student.student_name} and linked.`, "success");
            onUpdated();
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Please try again";
            showToast(`Linked locally but failed to save: ${msg}`, "error");
          }
        }}
        initialData={{
          student_name: app.student_name,
          school: app.school ?? undefined,
          grade: app.grade,
          lang_stream: app.lang_stream ?? undefined,
          phone: app.contact_phone ?? undefined,
        }}
      />
    </Modal>
  );
}
