"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { regularAPI, tutorsAPI, studentsAPI, discountsAPI, ApiError } from "@/lib/api";
import { MIN_LESSONS_FOR_DISCOUNT, REGISTRATION_FEE, getGradeColor, minLessonsForDiscount } from "@/lib/constants";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";
import {
  LOCATION_TO_CODE, CODE_TO_LOCATION, displayLocation, DAY_ABBREV,
  getRegularTimeSlots, effectiveStream, BRANCH_INFO, hkTodayIso,
} from "@/lib/regular-utils";
import { intakeChargesRegistrationFee, isPromoActive } from "@/lib/regular-promo";
import { firstWeekdayOnOrAfter } from "@/lib/regular-publish-utils";
import { parseHKTimestamp } from "@/lib/formatters";
import {
  REGULAR_ALL_STATUSES, REGULAR_STATUS_COLORS, REGULAR_STATUS_ICONS, RegularStatusBadge,
  RegularOriginChip,
} from "./RegularApplicationCard";
import { LinkedStudentChip } from "@/components/admin/LinkedStudentChip";
import { StudentInfoBadges } from "@/components/ui/student-info-badges";
import { WeChatIcon } from "@/components/parent-contacts/contact-utils";
import { AddStudentModal } from "@/components/students/AddStudentModal";
import { RegularMessagePanel, type RegularMessageMode } from "./RegularMessagePanel";
import { ChecklistRow } from "./ChecklistRow";
import { ProspectJourneyChip } from "./ProspectJourneyChip";
import { RegularProspectSuggestionsModal } from "./RegularProspectSuggestionsModal";
import {
  Loader2, Pencil, History, UserCheck, Unlink, ExternalLink, Send,
  CheckCircle2, AlertTriangle, Trash2, Copy, Check, ChevronLeft, ChevronRight,
  User, Phone, MapPin, Clock, Grid3X3, Search, UserPlus, ArrowRight, FileText,
  DollarSign, Link2, Ticket,
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

/** Picks the first incomplete step in the workflow checklist. Returns null
 *  when every step is done. Regular has no language-stream step: the form
 *  collects the stream up front, so summer's step 1 has no counterpart. */
function firstUndoneStep(a: RegularApplication): number | null {
  if (!a.existing_student_id) return 0;
  if (!FEE_SENT_OR_LATER.has(a.application_status)) return 1;
  if (!a.published_enrollment_id) return 2;
  return null;
}

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
  const { copied: promoCodeCopied, copy: copyPromoCode } = useCopyToClipboard();

  // Pending edits. Everything the admin changes here is held locally and
  // written by Save Changes, as in summer, so a half-finished edit can be
  // abandoned and the audit trail gets one row per save rather than per click.
  const [status, setStatus] = useState("");
  const [showAllStatuses, setShowAllStatuses] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  /** Set to the action to run once the admin agrees to discard their edits. */
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  /** Status the admin picked that needs the lock-out warning acknowledged. */
  const [pendingStatusConfirm, setPendingStatusConfirm] = useState<string | null>(null);

  // Audited detail edits
  const [editingDetails, setEditingDetails] = useState(false);
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
  const [studentId, setStudentId] = useState("");

  // Edit history
  const [historyOpen, setHistoryOpen] = useState(false);

  // Parent messages (schedule offer / fee)
  const [messagePanel, setMessagePanel] = useState<RegularMessageMode | null>(null);
  const [openStepIdx, setOpenStepIdx] = useState<number | null>(null);
  // Prospect journey linking (Feature 2), a direct action outside Save Changes.
  const [prospectModalOpen, setProspectModalOpen] = useState(false);
  const [prospectBusy, setProspectBusy] = useState(false);
  // Admin-verified origin. Saved with the rest of the form rather than on
  // change, so a mis-click can be abandoned like any other edit.
  const [branchOrigin, setBranchOrigin] = useState("");

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
    setStatus(app.application_status);
    setStudentId(app.existing_student_id?.toString() || "");
    setBranchOrigin(app.verified_branch_origin || "");
    setNotes(app.admin_notes || "");
    setShowAllStatuses(false);
    setPendingDiscard(null);
    setPendingStatusConfirm(null);
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
    setOpenStepIdx(app.published_enrollment_id ? null : firstUndoneStep(app));
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
  // Scoped to the selected branch, like the arrangement page's list: a tutor
  // based at the other centre should not be offered for a lesson here.
  const tutorOptions = useMemo(
    () =>
      (tutors || [])
        .filter((t) => t.is_active_tutor !== false && t.default_location === pubLocation)
        .sort((a, b) => a.tutor_name.localeCompare(b.tutor_name)),
    [tutors, pubLocation]
  );

  // --- Student linking ---

  // The applicant's branch in system terms, used to rank duplicate matches.
  const systemLocation = app ? LOCATION_TO_CODE[app.preferred_location || ""] || "" : "";
  const claimsExisting = !!app?.is_existing_student && app.is_existing_student !== "None";
  // The student the panel is showing: the pending pick, which starts as
  // whatever is stored. Publishing still reads the saved link off `app`.
  const pickedStudentId = studentId ? parseInt(studentId, 10) : null;
  const unlinked = !!app && !pickedStudentId;

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
    isOpen && pickedStudentId ? ["student-detail", pickedStudentId] : null,
    () => studentsAPI.getById(pickedStudentId!)
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
  // Keyed on the saved link, not the pending pick, because the publish
  // discount below spends it and publishing uses whatever is stored. The chip
  // is therefore only shown while the panel is displaying that same student.
  const couponAvailable =
    coupon && (coupon.available ?? 0) > 0 && pickedStudentId === app?.existing_student_id
      ? coupon
      : null;

  const { data: discounts = [] } = useSWR(
    isOpen && app && !isPublished ? "discounts" : null,
    () => discountsAPI.getAll()
  );

  // The arrangement slot rides along on the application, so the placement is
  // known without loading every slot in the config.
  const assignedSlot = app?.assigned_slot ?? null;

  // Publish from the assigned slot unless the admin overrides the schedule.
  const usingSlot = !!assignedSlot && !overrideSchedule;

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

  // Auto-select the seasonal offer's discount row for an eligible applicant.
  // Runs after the coupon effect and wins, because a verified new student has
  // no coupon history to spend and the offer is the reason they applied. The
  // admin can still change it: this preselects, it does not lock.
  useEffect(() => {
    if (!isOpen || isPublished || discounts.length === 0) return;
    if (pubLessons < MIN_LESSONS_FOR_DISCOUNT) return;
    if (!app?.promo_eligible) return;
    const promoDiscountId = config?.pricing_config?.promo?.discount_id;
    if (!promoDiscountId) return;
    if (discounts.some((d) => d.id === promoDiscountId)) setPubDiscountId(promoDiscountId);
  }, [isOpen, isPublished, discounts, pubLessons, app?.promo_eligible, config?.pricing_config?.promo?.discount_id]);

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

  const hasChanges =
    status !== app.application_status ||
    notes !== (app.admin_notes || "") ||
    studentId !== (app.existing_student_id?.toString() || "") ||
    branchOrigin !== (app.verified_branch_origin || "") ||
    detailChanged;

  const buildUpdate = (): RegularApplicationUpdate => {
    const update: RegularApplicationUpdate = {};
    if (status !== app.application_status) update.application_status = status;
    if (notes !== (app.admin_notes || "")) update.admin_notes = notes;
    const newStudentId = studentId ? parseInt(studentId, 10) : null;
    if (newStudentId !== (app.existing_student_id ?? null)) {
      update.existing_student_id = newStudentId;
    }
    // Sent whenever it differs, including when cleared back to unverified. The
    // backend only auto-fills this from a student link when the field is
    // absent, so an explicit choice always wins over the guess.
    const newBranchOrigin = branchOrigin || null;
    if (newBranchOrigin !== (app.verified_branch_origin ?? null)) {
      update.verified_branch_origin = newBranchOrigin;
    }
    if (dSchool !== (app.school || "")) update.school = dSchool;
    if (dGrade !== (app.grade || "")) update.grade = dGrade;
    if (dLang !== (app.lang_stream || "")) update.lang_stream = dLang;
    if (dWechat !== (app.wechat_id || "")) update.wechat_id = dWechat;
    if (dLocation !== (app.preferred_location || "")) update.preferred_location = dLocation;
    if (dP1Day !== (app.preference_1_day || "")) update.preference_1_day = dP1Day;
    if (dP1Time !== (app.preference_1_time || "")) update.preference_1_time = dP1Time;
    if (dP2Day !== (app.preference_2_day || "")) update.preference_2_day = dP2Day;
    if (dP2Time !== (app.preference_2_time || "")) update.preference_2_time = dP2Time;
    return update;
  };

  const doSave = async () => {
    setSaving(true);
    try {
      await regularAPI.updateApplication(app.id, buildUpdate());
      showToast("Changes saved", "success");
      setEditingDetails(false);
      await onUpdated();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Update failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!hasChanges || saving || readOnly) return;
    // Moving off Submitted closes the applicant's own edit form, so make the
    // admin acknowledge that before it happens.
    if (app.application_status === "Submitted" && status !== "Submitted") {
      setPendingStatusConfirm(status);
      return;
    }
    await doSave();
  };

  // Wraps anything that would leave the modal so unsaved edits prompt first.
  // The action is stored behind an extra closure because React reads a bare
  // function passed to a setter as an updater.
  const guardNav = (action: () => void) => {
    if (!hasChanges || readOnly) { action(); return; }
    setPendingDiscard(() => action);
  };

  const handleLinkStudent = (id: number) => {
    setStudentId(id.toString());
    setStudentSearch("");
    setSearchFocused(false);
    setShowManualId(false);
    setManualIdInput("");
    setManualIdConfirmed("");
  };

  const handleUnlinkStudent = () => {
    setStudentId("");
    setStudentSearch("");
    setSearchFocused(false);
    setShowManualId(false);
    setManualIdInput("");
    setManualIdConfirmed("");
  };

  // Prospect linking writes the prospect row immediately (like the summer side),
  // so it is a direct API action rather than part of Save Changes.
  const handleUnlinkProspect = async () => {
    setProspectBusy(true);
    try {
      await regularAPI.linkProspect(app.id, null);
      showToast("Prospect unlinked", "success");
      onUpdated();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Unlink failed", "error");
    } finally {
      setProspectBusy(false);
    }
  };

  // Publish gating: mirror the backend's hard blocks so the button can explain
  // itself. The backend re-validates on POST either way.
  const publishBlockers: string[] = [];
  if (!isPublished) {
    if (!FEE_SENT_OR_LATER.has(app.application_status)) {
      publishBlockers.push(
        `Status is ${app.application_status}. Send the fee message in step 2, then mark it sent.`
      );
    }
    if (!app.existing_student_id) {
      publishBlockers.push("No student record is linked. Link one in step 1 first.");
    }
  }
  const publishFormIncomplete = !usingSlot && (!pubDay || !pubTime || !pubTutorId);

  // The season's offer. Admins read the unfiltered config, so this is present
  // before the campaign starts too — hence the separate live check, which lets
  // staff handling an early application see that a discount is coming rather
  // than quoting a fee that is about to change.
  //
  // Whether it actually applies is the API's call, not this component's:
  // eligibility depends on the verified origin and the campaign window, and
  // publishing must charge what the parent was quoted.
  const activePromo = config?.pricing_config?.promo ?? null;
  const promoLive = isPromoActive(activePromo, hkTodayIso());
  const promoApplies = !!app.promo_eligible && !!activePromo;
  const promoWaivesFee = promoApplies && !!activePromo?.waives_registration_fee;

  // Client-side fee preview, mirroring what publishing will charge: base fee,
  // less the selected discount, plus the materials fee when this intake still
  // collects it and the API says this student owes it. The backend recomputes
  // the real total on publish — this only has to agree with the fee message
  // the parent got.
  const selectedDiscount = discounts.find((d) => d.id === pubDiscountId);
  const discountValue = selectedDiscount?.discount_value ? Number(selectedDiscount.discount_value) : 0;
  const baseFee = 400 * pubLessons;
  const intakeChargesFee = intakeChargesRegistrationFee(config?.pricing_config);
  const registrationFee = app.is_new_student && intakeChargesFee ? REGISTRATION_FEE : 0;
  const feeTotal = baseFee - discountValue + registrationFee;

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

  const submittedDate = app.submitted_at
    ? parseHKTimestamp(app.submitted_at).toLocaleString()
    : "—";
  const reviewedDate = app.reviewed_at
    ? parseHKTimestamp(app.reviewed_at).toLocaleString()
    : null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => guardNav(onClose)}
        size="xl"
        title={
          <span className="inline-flex items-center gap-3 min-w-0">
            <span className="truncate">{app.student_name}</span>
            <RegularStatusBadge status={app.application_status} />
            <RegularOriginChip app={app} />
          </span>
        }
        footer={
          <div className="flex items-center">
            {(onPrev || onNext) && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onPrev && guardNav(onPrev)}
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
                  onClick={() => onNext && guardNav(onNext)}
                  disabled={!hasNext}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Next (→)"
                  aria-label="Next application"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
            {!readOnly && (
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => guardNav(onClose)}
                  className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
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
        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* LEFT: what the applicant submitted, plus its edit history */}
            <div className="space-y-4">
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
                        {editingDetails ? "Cancel" : "Edit details"}
                      </button>
                    )}
                  </div>
                </div>
              )}

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
                  </div>
                </div>
              ) : (
                <>
                  <InfoBlock
                    icon={User}
                    tone="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    title="Student"
                  >
                    <div className="font-medium text-sm text-foreground">{app.student_name}</div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {app.grade && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded text-gray-800"
                          style={{ backgroundColor: getGradeColor(app.grade, effectiveStream(app) || undefined) }}
                        >
                          {app.grade}{effectiveStream(app) || ""}
                        </span>
                      )}
                      {app.school && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                          {app.school}
                        </span>
                      )}
                      {/* The linked record stays visible while editing: it is
                          the student id and the link to their profile, which
                          the origin dropdown does not replace. The dropdown
                          then edits the origin the badge would otherwise
                          show, so the two never duplicate each other. */}
                      {canEdit && app.linked_student && (
                        <LinkedStudentChip student={app.linked_student} />
                      )}
                      {canEdit ? (
                        <select
                          value={branchOrigin}
                          onChange={(e) => setBranchOrigin(e.target.value)}
                          title={
                            app.is_existing_student && app.is_existing_student !== "None"
                              ? `Applicant claims: ${app.is_existing_student}`
                              : "Where this student came from. Choose New only when they have attended no MathConcept centre."
                          }
                          className="text-[10px] pl-1.5 pr-5 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-foreground shrink-0 appearance-none bg-[length:12px] bg-[right_2px_center] bg-no-repeat bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%236b7280%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.168l3.71-3.938a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200l-4.25-4.5a.75.75%200%2001.02-1.06z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')]"
                        >
                          <option value="">Unverified</option>
                          <option value="New">New</option>
                          {[...Object.keys(BRANCH_INFO).filter((c) => c !== "KC"), "MSA", "MSB"].map((code) => (
                            <option key={code} value={code}>{code}</option>
                          ))}
                        </select>
                      ) : (
                        <RegularOriginChip app={app} />
                      )}
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
                        copyable
                      />
                      <FieldValue label="Phone" value={app.contact_phone} copyable />
                    </InfoBlock>
                  )}

                  {app.preferred_location && (
                    <InfoBlock
                      icon={MapPin}
                      tone="bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                      title="Location"
                    >
                      <div className="text-sm font-medium font-mono text-foreground">
                        {displayLocation(app.preferred_location)}
                      </div>
                    </InfoBlock>
                  )}

                  <InfoBlock
                    icon={Clock}
                    tone="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                    title="Schedule Preferences"
                  >
                    {prefText(app.preference_1_day, app.preference_1_time) ||
                    prefText(app.preference_2_day, app.preference_2_time) ? (
                      <>
                        {prefText(app.preference_1_day, app.preference_1_time) && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground w-6 shrink-0">1st</span>
                            <span className="text-sm font-medium text-foreground">
                              {prefText(app.preference_1_day, app.preference_1_time)}
                            </span>
                          </div>
                        )}
                        {prefText(app.preference_2_day, app.preference_2_time) && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground w-6 shrink-0">2nd</span>
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
                </>
              )}

              {/* Placement and the application meta sit outside the edit
                  toggle, as in summer: neither is editable here, and the
                  placement is the thing an admin checks while correcting the
                  preferences above it. */}
              <InfoBlock
                icon={Grid3X3}
                tone="bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
                title="Placement"
              >
                {assignedSlot ? (
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium text-foreground">
                      {DAY_ABBREV[assignedSlot.slot_day] || assignedSlot.slot_day}{" "}
                      {assignedSlot.time_slot}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {displayLocation(assignedSlot.location)}
                      {" · "}
                      {assignedSlot.tutor_name || (
                        <span className="text-amber-600 dark:text-amber-400">No tutor set</span>
                      )}
                      {assignedSlot.grade ? ` · ${assignedSlot.grade} class` : ""}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground/60">
                    Not assigned yet. Place this student on the Arrangement page.
                  </div>
                )}
              </InfoBlock>

              {/* Seasonal offer. Shown whenever one is running, not only when
                  this applicant qualifies: an admin looking at a returning
                  student still needs to know why no code appeared, and the
                  "verify the origin" prompt is what unblocks the ones that
                  should qualify. */}
              {activePromo && (
                <InfoBlock
                  icon={Ticket}
                  tone="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                  title="Offer"
                >
                  {!promoLive ? (
                    <div className="text-xs text-muted-foreground italic">
                      {activePromo.name_en} starts{" "}
                      {activePromo.from_date
                        ? new Date(activePromo.from_date).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "long",
                          })
                        : "later"}
                      . Fee messages sent before then will not include it.
                    </div>
                  ) : promoApplies ? (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-base text-foreground">
                          {activePromo.code}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyPromoCode(activePromo.code)}
                          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted"
                          title="Copy to clipboard"
                        >
                          {promoCodeCopied ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {activePromo.name_en} · saves ${activePromo.total_value}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground italic">
                      {app.verified_branch_origin
                        ? `Not eligible. ${activePromo.name_en} is for students with no MathConcept history.`
                        : "Set the origin above to New to apply this offer, once you have confirmed the student has never attended MathConcept."}
                    </div>
                  )}
                </InfoBlock>
              )}

              <InfoBlock
                icon={FileText}
                tone="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                title="Application"
              >
                <FieldValue label="Reference" value={app.reference_code} mono copyable />
                <FieldValue
                  label="Language"
                  value={app.form_language === "en" ? "English" : "中文"}
                />
                <FieldValue label="Submitted" value={submittedDate} />
                {reviewedDate && (
                  <FieldValue label="Reviewed" value={`${app.reviewed_by} · ${reviewedDate}`} />
                )}
              </InfoBlock>
            </div>

            {/* RIGHT: the admin workflow — the status ladder, then the steps
                one at a time. Same shape as summer, minus its language-stream
                step. */}
            <div className="space-y-3 md:border md:border-gray-200 md:dark:border-gray-700 md:bg-gray-100/60 md:dark:bg-gray-800/50 md:rounded-xl md:p-4">
              {canEdit && (
                <div>
                  {nextStatuses.length > 0 && (
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Move to
                    </span>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {statusPills.map((s) => {
                      const colors = REGULAR_STATUS_COLORS[s];
                      const Icon = REGULAR_STATUS_ICONS[s];
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStatus(s)}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                            colors.bg, colors.text,
                            status === s
                              ? "ring-2 ring-offset-1 ring-current"
                              : "hover:ring-1 hover:ring-current"
                          )}
                          title={`Move to ${s}`}
                        >
                          {Icon && <Icon className="h-3.5 w-3.5" />}
                          {s}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setShowAllStatuses((v) => !v)}
                      className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1"
                    >
                      {showAllStatuses ? "Less" : "All statuses…"}
                    </button>
                  </div>
                </div>
              )}
              {!readOnly && isPublished && (
                <div className="text-[11px] text-muted-foreground">
                  Unpublish first to change the status.
                </div>
              )}
              {isPublished && (
                <div className="rounded-md border border-green-200 dark:border-green-900/60 bg-green-50/70 dark:bg-green-900/20 px-2.5 py-2 text-[11px] leading-snug text-green-900 dark:text-green-200">
                  This application is published. The status, the placement and
                  the linked student are locked. Unpublish in step 3 to make
                  changes, or edit the enrollment directly for tutor-facing
                  updates.
                </div>
              )}
              <div className="space-y-2">
              <ChecklistRow
                index={0}
                title="Link student"
                done={!!pickedStudentId}
                open={openStepIdx === 0}
                onToggle={() => setOpenStepIdx((i) => (i === 0 ? null : 0))}
                disabled={!canEdit}
                summary={pickedStudentId && linkedStudent ? (
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
                ) : pickedStudentId ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span className="text-[10px] italic">Not linked</span>
                )}
              >
                <div className="space-y-2">
                {pickedStudentId && linkedStudent ? (
                  <div className="space-y-1">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        <StudentInfoBadges
                          showLink
                          showLocationPrefix
                          student={{
                            student_id: linkedStudent.id,
                            student_name: linkedStudent.student_name,
                            school_student_id: linkedStudent.school_student_id || undefined,
                            grade: linkedStudent.grade || undefined,
                            lang_stream: linkedStudent.lang_stream || undefined,
                            school: linkedStudent.school || undefined,
                            home_location: linkedStudent.home_location || undefined,
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
                          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-600 disabled:opacity-50"
                          title="Clear the student link"
                        >
                          <Unlink className="h-3 w-3" />
                          Unlink
                        </button>
                      )}
                    </div>
                    {linkedStudent.home_location &&
                      systemLocation &&
                      linkedStudent.home_location !== systemLocation && (
                        <div className="ml-5 text-[10px] text-amber-600 dark:text-amber-400">
                          Home branch ({linkedStudent.home_location}) differs from the branch applied for ({systemLocation}).
                        </div>
                      )}
                  </div>
                ) : pickedStudentId ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Loading linked student...</span>
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
                            onClick={() => handleLinkStudent(s.id)}
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
                                onClick={() => handleLinkStudent(s.id)}
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
                  </div>
                )}
                </div>
              </ChecklistRow>

              {/* P6 prospect journey link (Feature 2). Not a numbered step — a
                  compact panel beside the student link, since it edits the
                  prospect row directly rather than the application. Only F1
                  applicants can have been a P6 prospect (the primary-to-secondary
                  transition), so the panel is F1-only; an already-linked prospect
                  on a non-F1 application still shows so a bad link can be cleared. */}
              {((app.grade || "").trim() === "F1" || app.prospect_journey) && (canEdit || app.prospect_journey) && (
                <div className="rounded-lg border border-[#e8d4b8]/60 dark:border-[#6b5a4a]/60 px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-foreground">P6 prospect</span>
                    {app.prospect_journey ? (
                      <ProspectJourneyChip journey={app.prospect_journey} />
                    ) : (
                      <span className="text-[10px] italic text-muted-foreground">Not a tracked prospect</span>
                    )}
                    {canEdit && (
                      <div className="ml-auto flex items-center gap-2">
                        {app.prospect_journey ? (
                          <button
                            type="button"
                            onClick={handleUnlinkProspect}
                            disabled={prospectBusy}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-600 disabled:opacity-50"
                            title="Clear the prospect link"
                          >
                            <Unlink className="h-3 w-3" />
                            Unlink
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setProspectModalOpen(true)}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            title="Find and link a P6 prospect"
                          >
                            <Link2 className="h-3 w-3" />
                            Find prospect
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* The schedule offer, then the fee message. Both are generated
                  from the same schedule and fee inputs the publish step uses. */}
              <ChecklistRow
                index={1}
                title="Fee message"
                done={FEE_SENT_OR_LATER.has(status)}
                open={openStepIdx === 1}
                onToggle={() => setOpenStepIdx((i) => (i === 1 ? null : 1))}
                disabled={!canEdit}
                summary={FEE_SENT_OR_LATER.has(status) ? (
                  <span className="text-[10px] text-green-700 dark:text-green-300 font-medium">
                    {status}
                  </span>
                ) : (
                  <span className="text-[10px] italic">Not sent</span>
                )}
              >
                <div className="space-y-2">
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
                            ? "Copy class schedule for parent"
                            : "Copy fee message for parent"
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
                      onMarked={(newStatus) => {
                        // The panel writes the status itself, so pull it into
                        // the pending state too. Otherwise Save Changes would
                        // see a stale local value and undo the mark.
                        setStatus(newStatus);
                        void onUpdated();
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

              {/* Publish stays reachable once published so admins can unpublish. */}
              <ChecklistRow
                index={2}
                title="Publish"
                done={!!enrollmentId}
                open={openStepIdx === 2}
                onToggle={() => setOpenStepIdx((i) => (i === 2 ? null : 2))}
                summary={enrollmentId ? (
                  <span className="text-[10px] text-green-700 dark:text-green-300 font-medium">
                    Enrollment #{enrollmentId}
                  </span>
                ) : publishBlockers.length > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <AlertTriangle className="h-3 w-3" />
                    Blocked
                  </span>
                ) : (
                  <span className="text-[10px] text-primary font-medium">Ready</span>
                )}
              >
              {enrollmentId ? (
                <div className="space-y-2">
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
                <div className="space-y-2">
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
                  {assignedSlot && (
                    <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-2 space-y-1">
                      <div className="text-[11px] text-blue-800 dark:text-blue-300">
                        From assigned slot: {assignedSlot.slot_day} {assignedSlot.time_slot}
                        {" · "}{assignedSlot.location}
                        {" · "}{assignedSlot.tutor_name || "No tutor set"}
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
                              onClick={() => {
                                if (code === pubLocation) return;
                                setPubLocation(code);
                                // The tutor list is branch-scoped, so the old
                                // pick is never valid here. Clearing it keeps
                                // the incomplete-form guard honest.
                                setPubTutorId("");
                              }}
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
                      {discountValue > 0 && <> − ${discountValue.toLocaleString()}</>}
                      {registrationFee > 0 && <> + ${registrationFee.toLocaleString()}</>}
                      {(discountValue > 0 || registrationFee > 0) && (
                        <> = ${feeTotal.toLocaleString()}</>
                      )}
                    </div>
                    {/* Two different senses of "new" meet here, so the note
                        says which one is doing the work. The materials fee
                        follows enrolment history with us; the offer follows
                        the verified origin. This intake charges the fee to
                        nobody, so it is only ever mentioned as something the
                        offer spared a genuinely new student. */}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {registrationFee > 0
                        ? "Includes the one-off $100 materials fee. No previous enrolment with the Secondary Academy."
                        : !intakeChargesFee
                          ? promoWaivesFee
                            ? `No materials fee this intake. The ${activePromo?.name_en} tells the parent it was waived.`
                            : "No materials fee this intake."
                          : "No materials fee. This student has enrolled with us before."}
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
          handleLinkStudent(student.id);
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

      <RegularProspectSuggestionsModal
        isOpen={prospectModalOpen}
        onClose={() => setProspectModalOpen(false)}
        applicationId={app.id}
        onLinked={onUpdated}
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
    </>
  );
}
