"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { regularAPI, tutorsAPI, studentsAPI, discountsAPI, ApiError } from "@/lib/api";
import { MIN_LESSONS_FOR_DISCOUNT, minLessonsForDiscount } from "@/lib/constants";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import {
  LOCATION_TO_CODE, CODE_TO_LOCATION, displayLocation, DAY_ABBREV,
  getRegularTimeSlots,
} from "@/lib/regular-utils";
import { firstWeekdayOnOrAfter } from "@/lib/regular-publish-utils";
import { formatTimeAgo, parseHKTimestamp } from "@/lib/formatters";
import {
  REGULAR_ALL_STATUSES, REGULAR_STATUS_COLORS, REGULAR_STATUS_ICONS, RegularStatusBadge,
} from "./RegularApplicationCard";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
import { AddStudentModal } from "@/components/students/AddStudentModal";
import { RegularMessagePanel, type RegularMessageMode } from "./RegularMessagePanel";
import {
  Loader2, Pencil, History, UserCheck, Unlink, ExternalLink, Send,
  CheckCircle2, AlertTriangle, Trash2, Copy, Check, ChevronLeft, ChevronRight,
  User, Phone, MapPin, Clock, Building2, Search, UserPlus, ArrowRight, DollarSign,
} from "lucide-react";
import { useCopyToClipboard } from "@/lib/hooks/useCopyToClipboard";
import { useDebouncedValue } from "@/lib/hooks";
import { applyTargetToPreGrade } from "@/lib/grade-utils";
import type {
  RegularApplication,
  RegularApplicationUpdate,
  RegularApplicationEditEntry,
  RegularCourseConfig,
  RegularPublishResponse,
  RegularPublishErrorDetail,
} from "@/types";

const inputClass = "w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-foreground text-sm disabled:opacity-50";
const smallLabelClass = "block text-[10px] text-muted-foreground mb-0.5";

const PUBLISH_ERROR_TITLES: Record<string, string> = {
  no_linked_student: "No linked student",
  already_published: "Already published",
  status_too_early: "Status not ready",
  invalid_tutor: "Tutor not found",
  invalid_day: "Unrecognised day",
  no_course_start: "No course start date",
  first_lesson_too_early: "First lesson before course start",
  first_lesson_day_mismatch: "First lesson day mismatch",
  datetime_collision: "Schedule clash",
  not_published: "Not published",
  sessions_attended: "Sessions already attended",
  no_schedule: "No schedule set",
  slot_no_tutor: "Slot has no tutor",
  invalid_discount: "Discount not found",
  discount_min_lessons: "Discount needs more lessons",
};

/** Extract the structured publish error detail from a thrown ApiError. */
function toPublishError(e: unknown): RegularPublishErrorDetail {
  if (e instanceof ApiError && e.detail && typeof e.detail === "object" && "error_code" in e.detail) {
    return e.detail as RegularPublishErrorDetail;
  }
  return {
    error_code: "unknown",
    message: e instanceof Error ? e.message : "Something went wrong.",
  };
}

/** Forward moves offered as one-click pills, per rung of the ladder. Same map
 *  as the summer modal's. Anything else stays behind "All statuses…". */
const REGULAR_NEXT_STATUS_MAP: Record<string, string[]> = {
  "Submitted":           ["Under Review", "Rejected"],
  "Under Review":        ["Placement Offered", "Waitlisted", "Rejected"],
  "Placement Offered":   ["Placement Confirmed", "Withdrawn"],
  "Placement Confirmed": ["Fee Sent"],
  "Fee Sent":            ["Paid"],
  "Paid":                ["Enrolled"],
};

/** Rungs at or past "the fee message has gone out", which is also exactly
 *  where publishing becomes allowed. Same threshold as summer. */
const FEE_SENT_OR_LATER = new Set(["Fee Sent", "Paid", "Enrolled"]);

function FieldValue({
  label,
  value,
  mono,
  copyable,
}: {
  label: React.ReactNode;
  value?: string | null;
  mono?: boolean;
  copyable?: boolean;
}) {
  const { copied, copy } = useCopyToClipboard();
  if (!value) return null;

  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="text-xs text-muted-foreground shrink-0 w-20">{label}</span>
      <span className={cn("text-sm text-foreground min-w-0 break-words", mono && "font-mono")}>
        {value}
      </span>
      {copyable && (
        <button
          type="button"
          onClick={() => copy(value)}
          className="p-0.5 text-muted-foreground hover:text-foreground"
          title="Copy to clipboard"
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </div>
  );
}

type SuggestionStudent = {
  id: number;
  student_name: string;
  school_student_id?: string | null;
  grade?: string | null;
  home_location?: string | null;
  lang_stream?: string | null;
  school?: string | null;
};

/** One clickable candidate in the link-student picker. */
function StudentSuggestionRow({
  student,
  reason,
  onClick,
}: {
  student: SuggestionStudent;
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
          showLocationPrefix
          student={{
            student_id: student.id,
            student_name: student.student_name,
            school_student_id: student.school_student_id || undefined,
            grade: student.grade || undefined,
            lang_stream: student.lang_stream || undefined,
            school: student.school || undefined,
            home_location: student.home_location || undefined,
          }}
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

/** One icon-led block in the details column. */
function InfoBlock({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: typeof User;
  tone: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={cn("p-1.5 rounded-lg shrink-0", tone)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-gray-500 dark:text-gray-400">{title}</div>
        {children}
      </div>
    </div>
  );
}

interface RegularApplicationDetailModalProps {
  application: RegularApplication | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void | Promise<unknown>;
  config: RegularCourseConfig | null;
  readOnly?: boolean;
  /** Walk the surrounding list without closing the modal. */
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  currentIndex?: number;
  totalCount?: number;
}

export function RegularApplicationDetailModal({
  application: app,
  isOpen,
  onClose,
  onUpdated,
  config,
  readOnly = false,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  currentIndex,
  totalCount,
}: RegularApplicationDetailModalProps) {
  const { showToast } = useToast();
  const { copied: refCopied, copy: copyRef } = useCopyToClipboard();

  // Status + notes
  const [statusSaving, setStatusSaving] = useState(false);
  const [showAllStatuses, setShowAllStatuses] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);

  // Audited detail edits
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [dSchool, setDSchool] = useState("");
  const [dGrade, setDGrade] = useState("");
  const [dLang, setDLang] = useState("");
  const [dWechat, setDWechat] = useState("");
  const [dLocation, setDLocation] = useState("");
  const [dP1Day, setDP1Day] = useState("");
  const [dP1Time, setDP1Time] = useState("");
  const [dP2Day, setDP2Day] = useState("");
  const [dP2Time, setDP2Time] = useState("");

  // Student link
  const [studentSearch, setStudentSearch] = useState("");
  const debouncedStudentSearch = useDebouncedValue(studentSearch, 300);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showManualId, setShowManualId] = useState(false);
  const [manualIdInput, setManualIdInput] = useState("");
  const [manualIdConfirmed, setManualIdConfirmed] = useState("");
  const [createStudentOpen, setCreateStudentOpen] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);

  // Edit history
  const [historyOpen, setHistoryOpen] = useState(false);

  // Parent messages (schedule offer / fee)
  const [messagePanel, setMessagePanel] = useState<RegularMessageMode | null>(null);

  // Publish form
  const [pubLocation, setPubLocation] = useState("MSA");
  const [pubDay, setPubDay] = useState("");
  const [pubTime, setPubTime] = useState("");
  const [pubTutorId, setPubTutorId] = useState("");
  const [pubLessons, setPubLessons] = useState(6);
  const [pubDiscountId, setPubDiscountId] = useState<number | null>(null);
  const [overrideSchedule, setOverrideSchedule] = useState(false);
  const [pubFirstLesson, setPubFirstLesson] = useState("");
  const [pubFirstLessonTouched, setPubFirstLessonTouched] = useState(false);
  const [pubPayment, setPubPayment] = useState<"Pending Payment" | "Paid">("Pending Payment");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<RegularPublishErrorDetail | null>(null);
  const [publishResult, setPublishResult] = useState<RegularPublishResponse | null>(null);
  const [pendingUnpublish, setPendingUnpublish] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);

  const isPublished = !!app?.published_enrollment_id;
  const canEdit = !readOnly && !isPublished;
  const courseStart = (config?.course_start_date || "").split("T")[0];

  // Reset all local state when the modal opens or moves to another application.
  useEffect(() => {
    if (!app || !isOpen) return;
    setNotes(app.admin_notes || "");
    setShowAllStatuses(false);
    setEditingDetails(false);
    setDSchool(app.school || "");
    setDGrade(app.grade || "");
    setDLang(app.lang_stream || "");
    setDWechat(app.wechat_id || "");
    setDLocation(app.preferred_location || "");
    setDP1Day(app.preference_1_day || "");
    setDP1Time(app.preference_1_time || "");
    setDP2Day(app.preference_2_day || "");
    setDP2Time(app.preference_2_time || "");
    setStudentSearch("");
    setSearchFocused(false);
    setShowManualId(false);
    setManualIdInput("");
    setManualIdConfirmed("");
    setHistoryOpen(false);
    setMessagePanel(null);
    setPubLocation(LOCATION_TO_CODE[app.preferred_location || ""] || "MSA");
    setPubDay(app.preference_1_day || "");
    setPubTime(app.preference_1_time || "");
    setPubTutorId("");
    setPubLessons(6);
    setPubDiscountId(null);
    setOverrideSchedule(false);
    setPubFirstLesson("");
    setPubFirstLessonTouched(false);
    // An application already marked Paid publishes as a paid enrollment.
    setPubPayment(
      app.application_status === "Paid" || app.application_status === "Enrolled"
        ? "Paid"
        : "Pending Payment"
    );
    setPublishError(null);
    setPublishResult(null);
    setPendingUnpublish(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id, isOpen]);

  const { data: editHistory } = useSWR(
    historyOpen && app ? ["regular-edits", app.id] : null,
    () => regularAPI.getApplicationEdits(app!.id)
  );
  const sortedHistory = useMemo(
    () =>
      editHistory
        ? [...editHistory].sort((a, b) => b.edited_at.localeCompare(a.edited_at))
        : null,
    [editHistory]
  );

  const { data: tutors } = useSWR(
    isOpen && app && !isPublished ? "regular-publish-tutors" : null,
    () => tutorsAPI.getAll()
  );
  const tutorOptions = useMemo(
    () =>
      (tutors || [])
        .filter((t) => t.is_active_tutor !== false)
        .sort((a, b) => a.tutor_name.localeCompare(b.tutor_name)),
    [tutors]
  );

  // --- Student linking ---

  // The applicant's branch in system terms, used to rank duplicate matches.
  const systemLocation = app ? LOCATION_TO_CODE[app.preferred_location || ""] || "" : "";
  const claimsExisting = !!app?.is_existing_student && app.is_existing_student !== "None";
  const unlinked = !!app && !app.existing_student_id;

  // Name + phone at the applicant's branch, the strongest signal available.
  const { data: duplicateMatches } = useSWR(
    isOpen && app && unlinked && systemLocation
      ? ["student-dupes", app.student_name, systemLocation, app.contact_phone]
      : null,
    () => studentsAPI.checkDuplicates(app!.student_name, systemLocation, app!.contact_phone || undefined)
  );

  // Broader name sweep across every branch, for transfers and typos.
  const { data: nameMatches } = useSWR(
    isOpen && app && unlinked ? ["student-name-search", app.student_name] : null,
    () => studentsAPI.getAll({ search: app!.student_name, limit: 8 })
  );

  const { data: searchResults } = useSWR(
    isOpen && unlinked && debouncedStudentSearch.trim().length >= 2
      ? ["student-manual-search", debouncedStudentSearch]
      : null,
    () => studentsAPI.getAll({ search: debouncedStudentSearch.trim(), limit: 8 })
  );

  // Confirm-then-search, so a half-typed student code does not spam the API.
  const { data: manualIdResults } = useSWR(
    isOpen && unlinked && manualIdConfirmed.length >= 1
      ? ["student-manual-id", manualIdConfirmed]
      : null,
    () => studentsAPI.getAll({ search: manualIdConfirmed, limit: 5 })
  );

  // Full record for the linked student: the application only carries a name
  // and code, and the panel wants grade, school and enrollment count.
  const { data: linkedStudent } = useSWR(
    isOpen && app?.existing_student_id ? ["student-detail", app.existing_student_id] : null,
    () => studentsAPI.getById(app!.existing_student_id!)
  );

  // Duplicates first (they carry a match reason), then name matches that the
  // duplicate check did not already surface.
  const autoSuggestions = useMemo(() => {
    if (!unlinked) return [];
    const results: { student: SuggestionStudent; reason: string }[] = [];
    const seen = new Set<number>();
    for (const d of duplicateMatches?.duplicates ?? []) {
      seen.add(d.id);
      results.push({ student: d, reason: d.match_reason });
    }
    for (const s of nameMatches ?? []) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const reasons: string[] = [];
      if (app?.contact_phone && s.phone === app.contact_phone) reasons.push("phone match");
      if (s.home_location === systemLocation) reasons.push("same branch");
      results.push({ student: s, reason: reasons.join(", ") || "name match" });
    }
    return results;
  }, [unlinked, duplicateMatches, nameMatches, app?.contact_phone, systemLocation]);

  // Coupon availability for the linked student. Failures stay silent: SWR
  // simply leaves `coupon` undefined and no chip is shown.
  const { data: coupon } = useSWR(
    isOpen && app?.existing_student_id ? ["student-coupon", app.existing_student_id] : null,
    () => studentsAPI.getCoupon(app!.existing_student_id!)
  );
  const couponAvailable = coupon && (coupon.available ?? 0) > 0 ? coupon : null;

  const { data: discounts = [] } = useSWR(
    isOpen && app && !isPublished ? "discounts" : null,
    () => discountsAPI.getAll()
  );

  // Resolve the assigned arrangement slot (lazily, only when one is set) so
  // the publish panel can show the one-click schedule summary.
  const { data: configSlots } = useSWR(
    isOpen && app?.assigned_slot_id && config && !isPublished
      ? ["regular-slots-for-publish", config.id]
      : null,
    () => regularAPI.getSlots(config!.id)
  );
  const assignedSlot = useMemo(
    () => configSlots?.find((s) => s.id === app?.assigned_slot_id) ?? null,
    [configSlots, app?.assigned_slot_id]
  );

  // Publish from the assigned slot unless the admin overrides the schedule.
  const usingSlot = !!app?.assigned_slot_id && !overrideSchedule;

  // Publish form derived values
  const pubLocationName = CODE_TO_LOCATION[pubLocation] || pubLocation;
  const pubLocObj = config?.locations.find((l) => l.name === pubLocationName);
  const pubOpenDays = useMemo(() => pubLocObj?.open_days || [], [pubLocObj]);
  const pubSlots = useMemo(
    () => (pubDay ? getRegularTimeSlots(config, pubLocationName, pubDay) : []),
    [config, pubLocationName, pubDay]
  );

  // Keep the day valid for the chosen branch (MSB closes Tue + Wed).
  useEffect(() => {
    if (pubOpenDays.length === 0) return;
    if (!pubDay || !pubOpenDays.includes(pubDay)) {
      setPubDay(pubOpenDays[0]);
    }
  }, [pubOpenDays, pubDay]);

  // Keep the time valid for the chosen day (weekday and weekend slots differ).
  useEffect(() => {
    if (pubSlots.length === 0) return;
    if (!pubTime || !pubSlots.includes(pubTime)) {
      setPubTime(pubSlots[0]);
    }
  }, [pubSlots, pubTime]);

  // Auto-compute the first lesson date from the effective day (the assigned
  // slot's day, or the chosen day when overriding), mirroring the backend
  // default, until the admin edits the field by hand.
  const pubEffectiveDay = usingSlot ? assignedSlot?.slot_day || "" : pubDay;
  useEffect(() => {
    if (pubFirstLessonTouched || !pubEffectiveDay || !courseStart) return;
    const computed = firstWeekdayOnOrAfter(courseStart, pubEffectiveDay);
    if (computed) setPubFirstLesson(computed);
  }, [pubEffectiveDay, courseStart, pubFirstLessonTouched]);

  // Auto-suggest a coupon discount: when the linked student has coupons
  // available, preselect the active discount matching the coupon value.
  // Mirrors CreateEnrollmentModal's coupon auto-select (regular publish has
  // no staff-referral flow).
  useEffect(() => {
    if (!isOpen || isPublished || discounts.length === 0) return;
    if (pubLessons < MIN_LESSONS_FOR_DISCOUNT) return;
    if (!coupon?.has_coupon || !coupon.value || !(coupon.available ?? 0)) return;
    const matching = discounts.find(
      (d) => d.discount_value && Math.abs(Number(d.discount_value) - Number(coupon.value)) < 0.01
    );
    if (matching) setPubDiscountId(matching.id);
  }, [isOpen, isPublished, discounts, coupon, pubLessons]);

  // Clear the selected discount if the lesson count drops below its minimum.
  useEffect(() => {
    if (pubDiscountId === null) return;
    const selected = discounts.find((d) => d.id === pubDiscountId);
    if (pubLessons < minLessonsForDiscount(selected)) setPubDiscountId(null);
  }, [pubLessons, pubDiscountId, discounts]);

  // Detail-edit derived values (edit mode uses its own location/day state)
  const editLocObj = config?.locations.find((l) => l.name === dLocation);
  const editOpenDays = editLocObj?.open_days || [];

  if (!app) return null;

  const patchApplication = async (
    update: RegularApplicationUpdate,
    successMessage: string,
    setBusy: (b: boolean) => void
  ): Promise<boolean> => {
    setBusy(true);
    try {
      await regularAPI.updateApplication(app.id, update);
      showToast(successMessage, "success");
      await onUpdated();
      return true;
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Update failed", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = (next: string) => {
    if (next === app.application_status) return;
    void patchApplication({ application_status: next }, `Status set to ${next}`, setStatusSaving);
  };

  const detailChanged =
    dSchool !== (app.school || "") ||
    dGrade !== (app.grade || "") ||
    dLang !== (app.lang_stream || "") ||
    dWechat !== (app.wechat_id || "") ||
    dLocation !== (app.preferred_location || "") ||
    dP1Day !== (app.preference_1_day || "") ||
    dP1Time !== (app.preference_1_time || "") ||
    dP2Day !== (app.preference_2_day || "") ||
    dP2Time !== (app.preference_2_time || "");

  const handleSaveDetails = async () => {
    const update: RegularApplicationUpdate = {};
    if (dSchool !== (app.school || "")) update.school = dSchool;
    if (dGrade !== (app.grade || "")) update.grade = dGrade;
    if (dLang !== (app.lang_stream || "")) update.lang_stream = dLang;
    if (dWechat !== (app.wechat_id || "")) update.wechat_id = dWechat;
    if (dLocation !== (app.preferred_location || "")) update.preferred_location = dLocation;
    if (dP1Day !== (app.preference_1_day || "")) update.preference_1_day = dP1Day;
    if (dP1Time !== (app.preference_1_time || "")) update.preference_1_time = dP1Time;
    if (dP2Day !== (app.preference_2_day || "")) update.preference_2_day = dP2Day;
    if (dP2Time !== (app.preference_2_time || "")) update.preference_2_time = dP2Time;
    const ok = await patchApplication(update, "Details updated", setDetailsSaving);
    if (ok) setEditingDetails(false);
  };

  const handleSaveNotes = () =>
    patchApplication({ admin_notes: notes }, "Notes saved", setNotesSaving);

  const handleLinkStudent = async (studentId: number, name?: string) => {
    const ok = await patchApplication(
      { existing_student_id: studentId },
      name ? `Linked to ${name}` : "Student linked",
      setLinkSaving
    );
    if (ok) {
      setStudentSearch("");
      setSearchFocused(false);
      setShowManualId(false);
      setManualIdInput("");
      setManualIdConfirmed("");
    }
  };

  const handleUnlinkStudent = () =>
    patchApplication({ existing_student_id: null }, "Student link cleared", setLinkSaving);

  // Publish gating: mirror the backend's hard blocks so the button can explain
  // itself. The backend re-validates on POST either way.
  const publishBlockers: string[] = [];
  if (!isPublished) {
    if (!FEE_SENT_OR_LATER.has(app.application_status)) {
      publishBlockers.push(
        `Status is ${app.application_status}. Send the fee message from the Parent messages panel, then mark it sent.`
      );
    }
    if (!app.existing_student_id) {
      publishBlockers.push("No student record is linked. Link one in the Student panel first.");
    }
  }
  const publishFormIncomplete = !usingSlot && (!pubDay || !pubTime || !pubTutorId);

  // Client-side fee preview: base fee minus the selected discount. The
  // backend recomputes the real total on publish.
  const selectedDiscount = discounts.find((d) => d.id === pubDiscountId);
  const discountValue = selectedDiscount?.discount_value ? Number(selectedDiscount.discount_value) : 0;
  const baseFee = 400 * pubLessons;

  // Turning the override on seeds the manual fields from the assigned slot.
  const handleOverrideToggle = (checked: boolean) => {
    setOverrideSchedule(checked);
    if (checked && assignedSlot) {
      setPubLocation(LOCATION_TO_CODE[assignedSlot.location] || assignedSlot.location);
      setPubDay(assignedSlot.slot_day);
      setPubTime(assignedSlot.time_slot);
      setPubTutorId(assignedSlot.tutor_id != null ? String(assignedSlot.tutor_id) : "");
    }
  };

  const handlePublish = async () => {
    if (publishing || publishBlockers.length > 0 || publishFormIncomplete) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const result = await regularAPI.publishApplication(app.id, {
        // With an assigned slot and no override, omit the schedule fields so
        // the backend resolves them from the slot.
        ...(usingSlot
          ? {}
          : {
              confirmed_day: pubDay,
              confirmed_time: pubTime,
              location: pubLocation,
              tutor_id: parseInt(pubTutorId, 10),
            }),
        lessons_paid: pubLessons,
        first_lesson_date: pubFirstLesson || undefined,
        payment_status: pubPayment,
        discount_id: pubDiscountId,
      });
      setPublishResult(result);
      showToast("Published to enrollments", "success");
      await onUpdated();
    } catch (e) {
      setPublishError(toPublishError(e));
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (unpublishing) return;
    setUnpublishing(true);
    setPublishError(null);
    try {
      const result = await regularAPI.unpublishApplication(app.id);
      showToast(`Unpublished. ${result.sessions_deleted} scheduled sessions removed.`, "success");
      setPublishResult(null);
      await onUpdated();
    } catch (e) {
      setPublishError(toPublishError(e));
    } finally {
      setUnpublishing(false);
      setPendingUnpublish(false);
    }
  };

  const enrollmentId = app.published_enrollment_id ?? publishResult?.enrollment_id ?? null;

  // One-click forward moves for the current rung; "All statuses…" swaps in
  // every other status for the rarer jumps.
  const nextStatuses = REGULAR_NEXT_STATUS_MAP[app.application_status] ?? [];
  const statusPills = showAllStatuses
    ? REGULAR_ALL_STATUSES.filter((s) => s !== app.application_status)
    : nextStatuses;

  const prefText = (day?: string | null, time?: string | null) =>
    day && time ? `${DAY_ABBREV[day] || day} ${time}` : null;

  const centres = [
    app.is_existing_student && app.is_existing_student !== "None" ? app.is_existing_student : null,
    ...(app.current_centers || []),
  ].filter(Boolean).join(" / ");

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="xl"
        title={
          <span className="inline-flex items-center gap-2 min-w-0">
            <span className="truncate">{app.student_name}</span>
            <span className="inline-flex items-center gap-1 font-mono text-sm font-normal text-muted-foreground">
              {app.reference_code}
              <button
                type="button"
                onClick={() => copyRef(app.reference_code)}
                className="p-0.5 hover:text-foreground"
                title="Copy reference code"
              >
                {refCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              </button>
            </span>
          </span>
        }
        footer={
          (onPrev || onNext) ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onPrev}
                disabled={!hasPrev}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Previous (←)"
                aria-label="Previous application"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {currentIndex != null && totalCount != null && (
                <span className="text-xs text-muted-foreground tabular-nums px-1">
                  {currentIndex + 1} / {totalCount}
                </span>
              )}
              <button
                type="button"
                onClick={onNext}
                disabled={!hasNext}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Next (→)"
                aria-label="Next application"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {/* Status row */}
          <div className="flex items-start gap-3 flex-wrap">
            <div className="min-w-0 flex-1 flex items-start gap-2 flex-wrap">
              <RegularStatusBadge status={app.application_status} />
              {canEdit && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {nextStatuses.length > 0 && (
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Move to
                    </span>
                  )}
                  {statusPills.map((s) => {
                    const colors = REGULAR_STATUS_COLORS[s];
                    const Icon = REGULAR_STATUS_ICONS[s];
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleStatusChange(s)}
                        disabled={statusSaving}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all disabled:opacity-50",
                          colors.bg, colors.text, "hover:ring-1 hover:ring-current"
                        )}
                        title={`Set status to ${s}`}
                      >
                        {Icon && <Icon className="h-3.5 w-3.5" />}
                        {s}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setShowAllStatuses((v) => !v)}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 ml-0.5"
                  >
                    {showAllStatuses ? "Less" : "All statuses…"}
                  </button>
                  {statusSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
              )}
              {!readOnly && isPublished && (
                <span className="text-[11px] text-muted-foreground">
                  Unpublish first to change the status.
                </span>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground ml-auto text-right">
              {app.submitted_at && <span>Submitted {formatTimeAgo(app.submitted_at)}</span>}
              {app.reviewed_by && app.reviewed_at && (
                <span className="block">
                  Reviewed by {app.reviewed_by} {formatTimeAgo(app.reviewed_at)}
                </span>
              )}
            </span>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* LEFT: details + notes + history */}
            <div className="space-y-3">
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
                      {editingDetails ? "Cancel" : "Edit details"}
                    </button>
                  )}
                </div>
              </div>

              {historyOpen && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-2 max-h-60 overflow-y-auto">
                  {!sortedHistory ? (
                    <div className="text-[11px] text-muted-foreground">Loading...</div>
                  ) : sortedHistory.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground">No edits yet.</div>
                  ) : (
                    <ul className="space-y-1.5">
                      {sortedHistory.map((e: RegularApplicationEditEntry) => (
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
                            <span className="font-medium">{e.field_name}</span>{": "}
                            <span className="text-muted-foreground line-through">{e.old_value || "None"}</span>
                            {" → "}
                            <span>{e.new_value || "None"}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {editingDetails && canEdit ? (
                <div className="space-y-3 rounded-lg border border-dashed border-primary/40 p-3 bg-primary/5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className={smallLabelClass}>School</label>
                      <input type="text" value={dSchool} onChange={(e) => setDSchool(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={smallLabelClass}>Grade</label>
                      <select value={dGrade} onChange={(e) => setDGrade(e.target.value)} className={inputClass}>
                        {dGrade && !config?.available_grades.some((g) => (g.value ?? g.name) === dGrade) && (
                          <option value={dGrade}>{dGrade}</option>
                        )}
                        {(config?.available_grades || []).map((g) => {
                          const v = g.value ?? g.name;
                          return <option key={v} value={v}>{v}</option>;
                        })}
                      </select>
                    </div>
                    <div>
                      <label className={smallLabelClass}>Stream</label>
                      <select value={dLang} onChange={(e) => setDLang(e.target.value)} className={inputClass}>
                        <option value="">Not set</option>
                        {(config?.lang_stream_options || []).map((o) => {
                          const v = o.value ?? o.name;
                          return <option key={v} value={v}>{v}</option>;
                        })}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className={smallLabelClass}>WeChat ID</label>
                      <input type="text" value={dWechat} onChange={(e) => setDWechat(e.target.value)} className={inputClass} />
                    </div>
                    <div className="col-span-2">
                      <label className={smallLabelClass}>Preferred branch</label>
                      <select
                        value={dLocation}
                        onChange={(e) => setDLocation(e.target.value)}
                        className={inputClass}
                      >
                        <option value="">Not set</option>
                        {(config?.locations || []).map((l) => (
                          <option key={l.name} value={l.name}>
                            {l.name} ({LOCATION_TO_CODE[l.name] || l.name_en})
                          </option>
                        ))}
                      </select>
                    </div>
                    {([
                      { label: "First choice", day: dP1Day, setDay: setDP1Day, time: dP1Time, setTime: setDP1Time },
                      { label: "Backup choice", day: dP2Day, setDay: setDP2Day, time: dP2Time, setTime: setDP2Time },
                    ] as const).map((pref) => {
                      const slots = pref.day ? getRegularTimeSlots(config, dLocation, pref.day) : [];
                      return (
                        <div key={pref.label} className="col-span-2 grid grid-cols-2 gap-2">
                          <div>
                            <label className={smallLabelClass}>{pref.label} day</label>
                            <select
                              value={pref.day}
                              onChange={(e) => { pref.setDay(e.target.value); pref.setTime(""); }}
                              className={inputClass}
                            >
                              <option value="">Not set</option>
                              {editOpenDays.map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className={smallLabelClass}>{pref.label} time</label>
                            <select
                              value={pref.time}
                              onChange={(e) => pref.setTime(e.target.value)}
                              className={inputClass}
                              disabled={!pref.day}
                            >
                              <option value="">Not set</option>
                              {slots.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingDetails(false)}
                      className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDetails}
                      disabled={!detailChanged || detailsSaving}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {detailsSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                      Save details
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40 p-3 space-y-3">
                  <InfoBlock
                    icon={User}
                    tone="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    title="Student"
                  >
                    <div className="mt-0.5">
                      <StudentInfoBadges
                        gradeIsEntering
                        student={{
                          student_name: app.student_name,
                          grade: app.grade,
                          lang_stream: app.lang_stream ?? undefined,
                          school: app.school ?? undefined,
                        }}
                      />
                    </div>
                  </InfoBlock>

                  {(app.wechat_id || app.contact_phone) && (
                    <InfoBlock
                      icon={Phone}
                      tone="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                      title="Contact"
                    >
                      <FieldValue
                        label={
                          <span className="inline-flex items-center gap-1">
                            <WeChatIcon className="h-3 w-3 text-green-600" />
                            WeChat
                          </span>
                        }
                        value={app.wechat_id}
                        mono
                        copyable
                      />
                      <FieldValue label="Phone" value={app.contact_phone} mono copyable />
                    </InfoBlock>
                  )}

                  {app.preferred_location && (
                    <InfoBlock
                      icon={MapPin}
                      tone="bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                      title="Preferred branch"
                    >
                      <div className="text-sm font-medium text-foreground">
                        {app.preferred_location}{" "}
                        <span className="font-mono text-xs text-muted-foreground">
                          {displayLocation(app.preferred_location)}
                        </span>
                      </div>
                    </InfoBlock>
                  )}

                  <InfoBlock
                    icon={Clock}
                    tone="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                    title="Schedule preferences"
                  >
                    {prefText(app.preference_1_day, app.preference_1_time) ||
                    prefText(app.preference_2_day, app.preference_2_time) ? (
                      <>
                        {prefText(app.preference_1_day, app.preference_1_time) && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground w-10 shrink-0">1st</span>
                            <span className="text-sm font-medium text-foreground">
                              {prefText(app.preference_1_day, app.preference_1_time)}
                            </span>
                          </div>
                        )}
                        {prefText(app.preference_2_day, app.preference_2_time) && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground w-10 shrink-0">Backup</span>
                            <span className="text-sm font-medium text-foreground">
                              {prefText(app.preference_2_day, app.preference_2_time)}
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground/60">No preferences submitted</div>
                    )}
                  </InfoBlock>

                  {centres && (
                    <InfoBlock
                      icon={Building2}
                      tone="bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
                      title="Currently attending"
                    >
                      <div className="text-sm font-medium text-foreground">{centres}</div>
                    </InfoBlock>
                  )}
                </div>
              )}

              {/* Admin notes */}
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Admin notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  disabled={readOnly}
                  className={cn(inputClass, "mt-1 resize-none")}
                  placeholder="Internal notes..."
                />
                {!readOnly && notes !== (app.admin_notes || "") && (
                  <div className="flex justify-end mt-1">
                    <button
                      type="button"
                      onClick={handleSaveNotes}
                      disabled={notesSaving}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {notesSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                      Save notes
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: student link + publish */}
            <div className="space-y-3">
              {/* Student link panel */}
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40 p-3 space-y-2">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Student</span>
                {app.linked_student ? (
                  <div className="space-y-1">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        <StudentInfoBadges
                          showLink
                          showLocationPrefix
                          student={{
                            student_id: app.existing_student_id ?? app.linked_student.id,
                            student_name: app.linked_student.student_name,
                            school_student_id: app.linked_student.school_student_id || undefined,
                            grade: linkedStudent?.grade || undefined,
                            lang_stream: linkedStudent?.lang_stream || undefined,
                            school: linkedStudent?.school || undefined,
                            home_location: app.linked_student.home_location || undefined,
                          }}
                        />
                      </span>
                      {couponAvailable && (
                        <span
                          className="inline-flex items-center px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs"
                          title="Coupons available for this student"
                        >
                          🎟 {couponAvailable.available} coupon{(couponAvailable.available ?? 0) > 1 ? "s" : ""} (${couponAvailable.value})
                        </span>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={handleUnlinkStudent}
                          disabled={linkSaving}
                          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-600 disabled:opacity-50"
                          title="Clear the student link"
                        >
                          {linkSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
                          Unlink
                        </button>
                      )}
                    </div>
                    {app.linked_student.home_location &&
                      systemLocation &&
                      app.linked_student.home_location !== systemLocation && (
                        <div className="ml-5 text-[10px] text-amber-600 dark:text-amber-400">
                          Home branch ({app.linked_student.home_location}) differs from the branch applied for ({systemLocation}).
                        </div>
                      )}
                  </div>
                ) : !canEdit ? (
                  <div className="text-sm text-muted-foreground">Not linked to a student record.</div>
                ) : (
                  <div className="space-y-2">
                    {claimsExisting && (
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
                              onClick={() => handleLinkStudent(student.id, student.student_name)}
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
                          placeholder="Search by name, student ID or phone..."
                        />
                      </div>
                    </div>

                    {searchFocused && searchResults && searchResults.length > 0 && (
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                        {searchResults.map((s) => (
                          <StudentSuggestionRow
                            key={s.id}
                            student={s}
                            onClick={() => handleLinkStudent(s.id, s.student_name)}
                          />
                        ))}
                      </div>
                    )}
                    {searchFocused && searchResults && searchResults.length === 0 &&
                      debouncedStudentSearch.trim().length >= 2 && (
                        <div className="text-xs text-muted-foreground text-center py-2 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                          No students found matching &ldquo;{debouncedStudentSearch.trim()}&rdquo;
                        </div>
                      )}

                    {showManualId ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={manualIdInput}
                            onChange={(e) => setManualIdInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && manualIdInput) setManualIdConfirmed(manualIdInput.trim());
                            }}
                            className={cn(inputClass, "max-w-[160px]")}
                            placeholder="School student ID"
                          />
                          <button
                            type="button"
                            onClick={() => manualIdInput && setManualIdConfirmed(manualIdInput.trim())}
                            disabled={!manualIdInput}
                            className="px-2.5 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                          >
                            Search
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowManualId(false); setManualIdInput(""); setManualIdConfirmed(""); }}
                            className="text-[10px] text-muted-foreground hover:text-foreground"
                          >
                            cancel
                          </button>
                        </div>
                        {manualIdResults && manualIdResults.length > 0 && (
                          <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                            {manualIdResults.map((s) => (
                              <StudentSuggestionRow
                                key={s.id}
                                student={s}
                                onClick={() => handleLinkStudent(s.id, s.student_name)}
                              />
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
                          type="button"
                          onClick={() => setShowManualId(true)}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          <Search className="h-3 w-3" />
                          Can&apos;t find? Search by student ID
                        </button>
                        <button
                          type="button"
                          onClick={() => setCreateStudentOpen(true)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary border border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 px-3 py-1.5 rounded-md transition-colors shadow-sm"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          Create new student
                        </button>
                      </div>
                    )}
                    {linkSaving && (
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Linking...
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Parent messages: the schedule offer, then the fee message.
                  Both are generated from the same schedule and fee inputs the
                  publish panel below uses. */}
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40 p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Parent messages
                  </span>
                  {FEE_SENT_OR_LATER.has(app.application_status) && (
                    <span className="text-[10px] font-medium text-green-700 dark:text-green-300">
                      Fee message sent
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {(["schedule", "fee"] as const).map((key) => {
                    const Icon = key === "schedule" ? Copy : DollarSign;
                    const label = key === "schedule" ? "Schedule" : "Fee message";
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setMessagePanel((m) => (m === key ? null : key))}
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                          messagePanel === key
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700"
                        )}
                        title={
                          key === "schedule"
                            ? "Copy the class schedule for the parent"
                            : "Copy the fee message for the parent"
                        }
                      >
                        <Icon className="h-3 w-3" />
                        {label}
                      </button>
                    );
                  })}
                </div>
                {messagePanel ? (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <RegularMessagePanel
                      app={app}
                      mode={messagePanel}
                      lessonsPaid={pubLessons}
                      discountId={pubDiscountId}
                      firstLessonDate={pubFirstLesson || null}
                      readOnly={!canEdit}
                      onClose={() => setMessagePanel(null)}
                      onMarked={() => { void onUpdated(); }}
                    />
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">
                    Pick Schedule or Fee message to generate copy for the parent.
                  </div>
                )}
              </div>

              {/* Publish panel */}
              {enrollmentId ? (
                <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-green-800 dark:text-green-300 font-medium text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    Published to enrollments
                  </div>
                  {publishResult && (
                    <div className="text-xs text-green-800/80 dark:text-green-300/80 space-y-0.5">
                      <div>{publishResult.sessions_created} weekly sessions created.</div>
                      <div>First lesson on {publishResult.first_lesson_date}.</div>
                      {publishResult.skipped_holidays.length > 0 && (
                        <div>
                          Skipped holidays:{" "}
                          {publishResult.skipped_holidays.map((h) => `${h.date} (${h.name})`).join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/enrollments/${enrollmentId}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-300 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View enrollment #{enrollmentId}
                    </Link>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => setPendingUnpublish(true)}
                        disabled={unpublishing}
                        className="ml-auto inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:text-red-700 disabled:opacity-50"
                      >
                        {unpublishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        Unpublish
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40 p-3 space-y-2">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Publish to enrollment
                  </span>
                  {publishBlockers.length > 0 && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-2 space-y-1">
                      {publishBlockers.map((b) => (
                        <div key={b} className="flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{b}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {app.assigned_slot_id != null && (
                    <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-2 space-y-1">
                      <div className="text-[11px] text-blue-800 dark:text-blue-300">
                        {assignedSlot ? (
                          <>
                            From assigned slot: {assignedSlot.slot_day} {assignedSlot.time_slot}
                            {" · "}{assignedSlot.location}
                            {" · "}{assignedSlot.tutor_name || "No tutor set"}
                          </>
                        ) : configSlots ? (
                          "Assigned slot details are unavailable."
                        ) : (
                          "Loading assigned slot..."
                        )}
                      </div>
                      {!readOnly && (
                        <label className="inline-flex items-center gap-1.5 text-[11px] text-blue-800/80 dark:text-blue-300/80 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={overrideSchedule}
                            onChange={(e) => handleOverrideToggle(e.target.checked)}
                            className="h-3 w-3"
                          />
                          Override schedule
                        </label>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {!usingSlot && (<>
                    <div className="col-span-2">
                      <label className={smallLabelClass}>Branch</label>
                      <div className="flex gap-1.5">
                        {(config?.locations || []).map((l) => {
                          const code = LOCATION_TO_CODE[l.name] || l.name;
                          const active = pubLocation === code;
                          return (
                            <button
                              key={code}
                              type="button"
                              onClick={() => setPubLocation(code)}
                              className={cn(
                                "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
                                active
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-card text-foreground border-border hover:bg-muted"
                              )}
                              title={l.name}
                            >
                              {code}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className={smallLabelClass}>Day</label>
                      <select value={pubDay} onChange={(e) => setPubDay(e.target.value)} className={inputClass}>
                        {pubOpenDays.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={smallLabelClass}>Time</label>
                      <select value={pubTime} onChange={(e) => setPubTime(e.target.value)} className={inputClass}>
                        {pubSlots.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className={smallLabelClass}>Tutor</label>
                      <select value={pubTutorId} onChange={(e) => setPubTutorId(e.target.value)} className={inputClass}>
                        <option value="">Select a tutor</option>
                        {tutorOptions.map((t) => (
                          <option key={t.id} value={t.id}>{t.tutor_name}</option>
                        ))}
                      </select>
                    </div>
                    </>)}
                    <div>
                      <label className={smallLabelClass}>Lessons paid</label>
                      <input
                        type="number"
                        min={1}
                        value={pubLessons}
                        onChange={(e) => setPubLessons(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={smallLabelClass}>First lesson</label>
                      <input
                        type="date"
                        value={pubFirstLesson}
                        min={courseStart || undefined}
                        onChange={(e) => {
                          setPubFirstLesson(e.target.value);
                          setPubFirstLessonTouched(true);
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className={smallLabelClass}>Discount</label>
                      <select
                        value={pubDiscountId ?? ""}
                        onChange={(e) => setPubDiscountId(e.target.value ? parseInt(e.target.value, 10) : null)}
                        className={inputClass}
                      >
                        <option value="">None</option>
                        {discounts.map((d) => (
                          <option key={d.id} value={d.id} disabled={pubLessons < minLessonsForDiscount(d)}>
                            {d.discount_name}
                            {d.discount_value ? ` (−$${Number(d.discount_value).toLocaleString()})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className={smallLabelClass}>Payment</label>
                      <select
                        value={pubPayment}
                        onChange={(e) => setPubPayment(e.target.value as "Pending Payment" | "Paid")}
                        className={inputClass}
                      >
                        <option value="Pending Payment">Pending Payment</option>
                        <option value="Paid">Paid</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-foreground">
                      Fee: ${baseFee.toLocaleString()}
                      {discountValue > 0 && (
                        <> − ${discountValue.toLocaleString()} = ${(baseFee - discountValue).toLocaleString()}</>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      New students pay a one-off $100 registration fee on top.
                    </p>
                  </div>

                  {publishError && (
                    <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-2 space-y-1">
                      <div className="flex items-start gap-1.5 text-xs text-red-700 dark:text-red-300">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <div>
                          <span className="font-medium">
                            {PUBLISH_ERROR_TITLES[publishError.error_code] || "Publish failed"}
                          </span>
                          <div>{publishError.message}</div>
                        </div>
                      </div>
                      {publishError.error_code === "datetime_collision" && publishError.conflicts && (
                        <ul className="ml-5 space-y-0.5 text-[11px] text-red-700/90 dark:text-red-300/90 list-disc">
                          {publishError.conflicts.map((c, i) => (
                            <li key={i}>
                              {c.session_date}
                              {c.time_slot ? ` at ${c.time_slot}` : ""}
                              {c.existing_tutor_name ? ` with ${c.existing_tutor_name}` : ""}
                              {c.session_status ? ` (${c.session_status})` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {!readOnly && (
                    <button
                      type="button"
                      onClick={handlePublish}
                      disabled={publishing || publishBlockers.length > 0 || publishFormIncomplete}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={
                        publishBlockers.length > 0
                          ? publishBlockers[0]
                          : publishFormIncomplete
                            ? "Choose a day, time and tutor first"
                            : "Create the enrollment and its weekly sessions"
                      }
                    >
                      {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Publish to enrollment
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Create-and-link, for applicants with no student record yet. The form
          is seeded from the application so the admin only confirms. */}
      <AddStudentModal
        isOpen={createStudentOpen}
        onClose={() => setCreateStudentOpen(false)}
        onSuccess={(student) => {
          setCreateStudentOpen(false);
          void handleLinkStudent(student.id, student.student_name);
        }}
        initialData={{
          student_name: app.student_name,
          school: app.school ?? undefined,
          // app.grade is the grade the student will be in from September. Until
          // the Sept 1 promotion of the config year fires, the record should
          // hold the grade below, which that promotion then lifts.
          grade: applyTargetToPreGrade(app.grade, config?.year),
          lang_stream: app.lang_stream ?? undefined,
          phone: app.contact_phone ?? undefined,
          home_location: systemLocation || undefined,
        }}
      />

      <ConfirmDialog
        isOpen={pendingUnpublish}
        onConfirm={handleUnpublish}
        onCancel={() => setPendingUnpublish(false)}
        title="Unpublish this application?"
        message={`This removes enrollment #${enrollmentId ?? ""} created from this application.`}
        consequences={[
          "All scheduled sessions for the enrollment will be deleted.",
          "The application status will revert to its previous value.",
          "Unpublishing is blocked if any session has already been attended.",
        ]}
        confirmText="Unpublish"
        variant="danger"
        loading={unpublishing}
      />
    </>
  );
}
