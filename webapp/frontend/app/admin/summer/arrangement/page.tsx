"use client";

import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { Grid3X3, CalendarDays, Wand2, Users2, Users, TableProperties, RefreshCw, BarChart3 } from "lucide-react";
import { cn, formatError } from "@/lib/utils";
import useSWR, { useSWRConfig } from "swr";
import { summerAPI } from "@/lib/api";
import { confirmDuplicateOrRetry, DUPLICATE_CANCELLED } from "@/lib/lesson-duplicate";
import { SummerArrangementGrid } from "@/components/admin/SummerArrangementGrid";
import { SummerSessionCalendar } from "@/components/admin/SummerSessionCalendar";
import { SummerUnassignedPanel } from "@/components/admin/SummerUnassignedPanel";
import type { DemandBarFilter } from "@/components/admin/SummerSlotCell";
import { SummerAutoSuggestModal } from "@/components/admin/SummerAutoSuggestModal";
import { SummerApplicationDetailModal } from "@/components/admin/SummerApplicationDetailModal";
import { SummerTutorDutyModal } from "@/components/admin/SummerTutorDutyModal";
import { SummerTutorWorkloadPanel } from "@/components/admin/SummerTutorWorkloadPanel";
import { SummerPlacementModeModal } from "@/components/admin/SummerPlacementModeModal";
import { SummerStudentLessonsTable } from "@/components/admin/SummerStudentLessonsTable";
import { SummerStudentSearch, type SummerStudentSearchEntry } from "@/components/admin/SummerStudentSearch";
import { SummerFindSlotDialog } from "@/components/admin/SummerFindSlotDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { STATUS_COLORS, STATUS_ICONS } from "@/components/admin/SummerApplicationCard";
import { LOCATION_TO_CODE, DAY_ABBREV, getLinkedStudentId } from "@/lib/summer-utils";
import { classifyPrefs } from "@/lib/summer-preferences";
import type { SummerSlot, SummerSlotUpdate, SummerApplication, AvailableTutor } from "@/types";

// Exit states (Waitlisted/Withdrawn/Rejected) are intentionally omitted — those
// belong to the applications page triage surface, not the arrangement workflow.
const PRE_ARRANGEMENT_STATUSES = ["Submitted", "Under Review"] as const;
const POST_ARRANGEMENT_STATUSES = [
  "Placement Offered",
  "Placement Confirmed",
  "Fee Sent",
  "Paid",
  "Enrolled",
] as const;
const ARRANGEMENT_STATUSES = [
  ...PRE_ARRANGEMENT_STATUSES,
  ...POST_ARRANGEMENT_STATUSES,
];

function StatusFilterChip({
  status,
  count,
  active,
  onToggle,
}: {
  status: string;
  count: number;
  active: boolean;
  onToggle: () => void;
}) {
  const colors = STATUS_COLORS[status];
  const Icon = STATUS_ICONS[status];
  const isZero = count === 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={active ? `Clear ${status} filter` : `${status} — click to filter`}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all",
        active
          ? cn(colors.bg, colors.text, "ring-1 ring-current/30")
          : "bg-gray-50 dark:bg-gray-800 text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-700",
        isZero && !active && "opacity-60"
      )}
    >
      {Icon && <Icon className={cn("h-3 w-3 shrink-0", !active && colors.text)} />}
      {active && <span>{status}</span>}
      <span className="tabular-nums">{count}</span>
    </button>
  );
}

export default function SummerArrangementPage() {
  usePageTitle("Summer Arrangement");
  const { isAdmin, isSuperAdmin } = useAuth();
  const { showToast } = useToast();
  const canView = isAdmin || isSuperAdmin;

  const { mutate: globalMutate } = useSWRConfig();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Snapshot deep-link params on first render so the consumption effect below
  // doesn't re-fire every render (useSearchParams returns a fresh object).
  const [initialDeepLink] = useState(() => ({
    tab: searchParams.get("tab"),
    location: searchParams.get("location"),
    lessonDate: searchParams.get("lesson_date"),
    sessionId: searchParams.get("session_id"),
  }));
  const [activeTab, setActiveTab] = useState<"slots" | "calendar" | "students">("slots");
  const [configId, setConfigId] = useState<number | null>(null);
  const [location, setLocation] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [demandPrefFilter, setDemandPrefFilter] = useState<DemandBarFilter | null>(null);
  const [autoSuggestOpen, setAutoSuggestOpen] = useState(false);
  const [suggestForStudent, setSuggestForStudent] = useState<{ id: number; name: string } | null>(null);
  const [dutyModalOpen, setDutyModalOpen] = useState(false);
  const [workloadOpen, setWorkloadOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{ appId: number; slotId: number } | null>(null);
  const [pendingGradeMismatch, setPendingGradeMismatch] = useState<
    | { kind: "slot"; appId: number; slotId: number; studentName: string; appGrade: string; slotGrade: string }
    | { kind: "calendar"; applicationId: number; slotId: number; lessonId: number; lessonNumber?: number | null;
        studentName: string; appGrade: string; slotGrade: string }
    | null
  >(null);
  const [findSlotTarget, setFindSlotTarget] = useState<{
    applicationId: number; studentName: string; grade: string;
    lessonNumber: number; afterDate?: string; beforeDate?: string;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    type: "session" | "slot"; id: number; name: string; cascade: boolean; consequences?: string[];
  } | null>(null);
  const [dragPrefs, setDragPrefs] = useState<{
    primary: { day: string; time: string }[];
    backup: { day: string; time: string }[];
  } | null>(null);
  // Calendar week-jump target. Uses a sequence counter so clicking the same
  // date twice re-triggers navigation. `highlightSessionId` opt-in briefly
  // rings the card containing that SummerSession after the jump and
  // auto-expands it. Declared up here so the deep-link effect below can seed
  // it before the handler that normally sets it.
  const [calendarTarget, setCalendarTarget] = useState<{
    date: string;
    seq: number;
    highlightSessionId?: number | null;
  } | null>(null);
  const bumpCalendarTarget = useCallback((
    date: string,
    highlightSessionId: number | null,
  ) => {
    setCalendarTarget((prev) => ({
      date,
      seq: (prev?.seq ?? 0) + 1,
      highlightSessionId,
    }));
  }, []);

  // Slot-grid highlight target — mirrors calendarTarget. Every slot card
  // containing `applicationId` rings + auto-expands; only the one matching
  // `scrollSlotId` scrolls into view (prevents scroll races on multi-slot
  // placements).
  const [slotTarget, setSlotTarget] = useState<{
    applicationId: number;
    scrollSlotId: number | null;
    seq: number;
  } | null>(null);
  const bumpSlotTarget = useCallback((applicationId: number, scrollSlotId: number | null) => {
    setSlotTarget((prev) => ({
      applicationId,
      scrollSlotId,
      seq: (prev?.seq ?? 0) + 1,
    }));
  }, []);

  // Students-table highlight target — same shape/contract as slotTarget, but
  // the matching row in SummerStudentLessonsTable scrolls + rings. Used when
  // the header search fires while the Students tab is active, so we keep the
  // user in context instead of routing them to Slot Setup / Calendar.
  const [studentsTarget, setStudentsTarget] = useState<{
    applicationId: number;
    seq: number;
  } | null>(null);
  const bumpStudentsTarget = useCallback((applicationId: number) => {
    setStudentsTarget((prev) => ({
      applicationId,
      seq: (prev?.seq ?? 0) + 1,
    }));
  }, []);

  // Fetch configs
  const { data: configs } = useSWR(
    canView ? "summer-configs" : null,
    () => summerAPI.getConfigs()
  );

  // Default to active config + first location
  useEffect(() => {
    if (configs && configs.length > 0 && configId === null) {
      const active = configs.find((c) => c.is_active);
      const config = active ?? configs[0];
      setConfigId(config.id);
      if (config.locations?.length > 0 && !location) {
        setLocation(config.locations[0].name);
      }
    }
  }, [configs, configId, location]);

  // Cross-page deep link: /admin/summer/arrangement?tab=calendar&location=X&lesson_date=Y
  // Fired from SummerApplicationDetailModal on the applications page. Applied
  // once after the first location is set, then params are stripped so a refresh
  // doesn't re-jump.
  const deepLinkConsumedRef = useRef(false);
  useEffect(() => {
    if (deepLinkConsumedRef.current) return;
    if (!configs || configs.length === 0 || configId === null || !location) return;
    const { tab, location: urlLocation, lessonDate, sessionId } = initialDeepLink;
    if (!tab && !urlLocation && !lessonDate) {
      deepLinkConsumedRef.current = true;
      return;
    }
    const currentConfig = configs.find((c) => c.id === configId);
    const locNames = currentConfig?.locations?.map((l) => l.name) ?? [];
    if (urlLocation && locNames.includes(urlLocation) && urlLocation !== location) {
      setLocation(urlLocation);
    }
    if (tab === "slots" || tab === "calendar" || tab === "students") {
      setActiveTab(tab);
    }
    if (lessonDate) {
      const parsedSid = sessionId != null ? Number(sessionId) : NaN;
      const highlightSessionId = Number.isInteger(parsedSid) && parsedSid > 0 ? parsedSid : null;
      bumpCalendarTarget(lessonDate, highlightSessionId);
    }
    deepLinkConsumedRef.current = true;
    router.replace("/admin/summer/arrangement", { scroll: false });
  }, [configs, configId, location, initialDeepLink, router]);

  const activeConfig = configs?.find((c) => c.id === configId);
  const locations = activeConfig?.locations ?? [];
  const selectedLocation = locations.find((l) => l.name === location);
  const openDays = selectedLocation?.open_days ?? [];
  const timeSlots = useMemo(() => {
    if (!selectedLocation?.time_slots) return activeConfig?.time_slots ?? [];
    const allSlots = new Set<string>();
    for (const day of openDays) {
      for (const slot of (selectedLocation.time_slots[day] ?? [])) {
        allSlots.add(slot);
      }
    }
    return Array.from(allSlots).sort();
  }, [selectedLocation, openDays, activeConfig?.time_slots]);
  const grades = (activeConfig?.available_grades ?? []).map((g: { value: string }) => g.value);

  // Fetch data (3 parallel SWR calls)
  const {
    data: slots,
    mutate: mutateSlots,
    isValidating: slotsValidating,
  } = useSWR(
    configId && location ? ["summer-slots", configId, location] : null,
    () => summerAPI.getSlots(configId!, location),
    { refreshInterval: 30000 }
  );

  const {
    data: demand,
    mutate: mutateDemand,
    isValidating: demandValidating,
  } = useSWR(
    configId && location ? ["summer-demand", configId, location] : null,
    () => summerAPI.getDemand(configId!, location),
    { refreshInterval: 60000 }
  );

  const {
    data: unassigned,
    mutate: mutateUnassigned,
    isValidating: unassignedValidating,
  } = useSWR(
    configId && location ? ["summer-unassigned", configId, location] : null,
    () => summerAPI.getUnassigned({ config_id: configId!, location }),
    { refreshInterval: 30000 }
  );

  const { data: appStats, mutate: mutateAppStats } = useSWR(
    canView && configId && location ? ["summer-app-stats", configId, location] : null,
    () => summerAPI.getApplicationStats({ config_id: configId!, location }),
    { refreshInterval: 30000 }
  );

  // Student-lessons feed — drives the Students tab but also the header global
  // search (we need lesson_date + session_id on each placed lesson to build a
  // jump target). SWR dedupes with the Students tab's hook, and refreshAll's
  // existing `mutateStudentLessons` invalidates this cache via key-prefix match.
  const { data: studentLessonsData } = useSWR(
    canView && configId && location ? ["summer-student-lessons", configId, location] : null,
    () => summerAPI.getStudentLessons(configId!, location),
    { refreshInterval: 30000 }
  );

  // Demand takes precedence, so this hook stays idle while the demand-bar filter
  // is active to avoid two competing scopes fighting over the panel.
  const { data: statusFilteredApps, mutate: mutateStatusFilteredApps } = useSWR(
    statusFilter && !demandPrefFilter && configId && location
      ? ["summer-apps-status", configId, location, statusFilter]
      : null,
    () => summerAPI.getApplications({
      config_id: configId!,
      location,
      application_status: statusFilter!,
    }),
    { refreshInterval: 30000 }
  );

  const isValidating = slotsValidating || demandValidating || unassignedValidating;

  // Fetch active tutors and duties
  const { data: activeTutors } = useSWR(
    canView ? "summer-active-tutors" : null,
    () => summerAPI.getActiveTutors()
  );

  const {
    data: tutorDuties,
    mutate: mutateDuties,
  } = useSWR(
    configId && location ? ["summer-duties", configId, location] : null,
    () => summerAPI.getTutorDuties(configId!, location)
  );

  // Pre-index duties by "day|timeSlot" → Set<tutor_id>
  const dutyMap = useMemo(() => {
    const m = new Map<string, Set<number>>();
    for (const d of tutorDuties ?? []) {
      const key = `${d.duty_day}|${d.time_slot}`;
      if (!m.has(key)) m.set(key, new Set());
      m.get(key)!.add(d.tutor_id);
    }
    return m;
  }, [tutorDuties]);

  // Compute available tutors for a given cell (day, timeSlot)
  const getAvailableTutors = useCallback(
    (day: string, timeSlot: string): AvailableTutor[] => {
      if (!activeTutors) return [];
      const dutySet = dutyMap.get(`${day}|${timeSlot}`);
      return activeTutors.map((t) => ({
        id: t.id,
        name: t.tutor_name,
        onDuty: dutySet?.has(t.id) ?? false,
      }));
    },
    [activeTutors, dutyMap]
  );

  // Fetch selected application for detail modal
  const { data: selectedApp, mutate: mutateSelectedApp } = useSWR(
    selectedAppId ? ["summer-app", selectedAppId] : null,
    () => summerAPI.getApplication(selectedAppId!)
  );

  // SWR invalidation helpers
  const mutateCalendar = useCallback(() => globalMutate((key) => Array.isArray(key) && key[0] === "summer-calendar"), [globalMutate]);
  const mutateStudentLessons = useCallback(() => globalMutate((key) => Array.isArray(key) && key[0] === "summer-student-lessons"), [globalMutate]);
  const mutateFindSlot = useCallback(() => globalMutate((key) => Array.isArray(key) && key[0] === "summer-find-slot"), [globalMutate]);

  // Handlers
  const refreshAll = useCallback(() => {
    return Promise.all([
      mutateSlots(),
      mutateDemand(),
      mutateUnassigned(),
      mutateAppStats(),
      mutateStatusFilteredApps(),
      mutateCalendar(),
      mutateStudentLessons(),
      mutateFindSlot(),
    ]);
  }, [mutateSlots, mutateDemand, mutateUnassigned, mutateAppStats, mutateStatusFilteredApps, mutateCalendar, mutateStudentLessons, mutateFindSlot]);

  // Optimistic patch for the single-app cache that drives the detail modal.
  // Uses the hook's bound mutate so the patch definitely reaches this
  // specific useSWR subscription — a keyed globalMutate was silently not
  // re-rendering this hook in practice.
  const optimisticallyUpdateApp = useCallback(
    (id: number, patch: Partial<SummerApplication>) => {
      if (id !== selectedAppId) return;
      mutateSelectedApp(
        (current) => (current ? { ...current, ...patch } : current),
        { revalidate: false },
      );
    },
    [mutateSelectedApp, selectedAppId],
  );

  const handleCreateSlot = useCallback(async (day: string, timeSlot: string) => {
    if (!configId) return;
    // Temporary id is unique within this list and distinct from real
    // auto-increment ids (always positive). Replaced with the server's slot
    // once the POST resolves.
    const tempId = -Date.now();
    const placeholder: SummerSlot = {
      id: tempId,
      config_id: configId,
      slot_day: day,
      time_slot: timeSlot,
      location,
      grade: null,
      slot_label: null,
      course_type: null,
      tutor_id: null,
      tutor_name: null,
      max_students: 8,
      is_adhoc: false,
      adhoc_date: null,
      created_at: new Date().toISOString(),
      session_count: 0,
      sessions: [],
    };
    try {
      await mutateSlots(
        async (current) => {
          const created = await summerAPI.createSlot({
            config_id: configId,
            slot_day: day,
            time_slot: timeSlot,
            location,
          });
          return [...(current ?? []).filter((s) => s.id !== tempId), created];
        },
        {
          optimisticData: (current) => [...(current ?? []), placeholder],
          rollbackOnError: true,
          revalidate: false,
        },
      );
      // New slot auto-generates lessons on next calendar fetch.
      mutateCalendar();
    } catch (e: unknown) {
      showToast(formatError(e, "Failed to create slot"), "error");
    }
  }, [configId, location, mutateSlots, mutateCalendar, showToast]);

  const handleUpdateSlot = useCallback(async (slotId: number, data: SummerSlotUpdate) => {
    // Resolve tutor_name locally so the optimistic patch shows the right name
    // until the PATCH response overwrites the cache. `undefined` means the
    // update doesn't touch tutor_id, so don't overwrite tutor_name either.
    let tutorNameOverride: string | null | undefined;
    if (data.tutor_id === undefined) {
      tutorNameOverride = undefined;
    } else if (data.tutor_id === null) {
      tutorNameOverride = null;
    } else {
      tutorNameOverride =
        activeTutors?.find((t) => t.id === data.tutor_id)?.tutor_name ?? null;
    }
    try {
      await mutateSlots(
        async (current) => {
          const updated = await summerAPI.updateSlot(slotId, data);
          return (current ?? []).map((s) => (s.id === slotId ? updated : s));
        },
        {
          optimisticData: (current) =>
            (current ?? []).map((s) =>
              s.id === slotId
                ? {
                    ...s,
                    ...data,
                    ...(tutorNameOverride !== undefined
                      ? { tutor_name: tutorNameOverride }
                      : {}),
                  }
                : s,
            ),
          rollbackOnError: true,
          revalidate: false,
        },
      );
      // A slot field change (grade/type/tutor/label) propagates to lesson
      // cards on the calendar and to the student-lessons feed. Other caches
      // (demand, unassigned, app-stats, status-filtered-apps, find-slot) are
      // keyed off applications, not slots, so skip them.
      mutateCalendar();
      mutateStudentLessons();
    } catch (e: unknown) {
      showToast(formatError(e, "Failed to update slot"), "error");
    }
  }, [mutateSlots, mutateCalendar, mutateStudentLessons, activeTutors, showToast]);

  const handleDeleteSlot = useCallback((slotId: number) => {
    const slot = slots?.find(s => s.id === slotId);
    const label = slot
      ? `${DAY_ABBREV[slot.slot_day] || slot.slot_day} ${slot.time_slot}${slot.grade ? ` ${slot.grade}` : ""}`
      : "this slot";
    const studentCount = slot?.session_count ?? 0;
    setPendingDelete({
      type: "slot",
      id: slotId,
      name: label,
      cascade: false,
      consequences: studentCount > 0
        ? [`This slot has ${studentCount} student${studentCount > 1 ? "s" : ""} — remove them first before deleting`]
        : undefined,
    });
  }, [slots]);

  // Placement across grades is allowed (tutors sometimes absorb a
  // neighbour-grade student), but Find Slot / auto-suggest / grid grouping
  // treat slot.grade as authoritative — prompt first so admins know.
  const handleDropStudent = useCallback((applicationId: number, slotId: number) => {
    const app = unassigned?.find((a) => a.id === applicationId);
    const slot = slots?.find((s) => s.id === slotId);
    if (app && slot && slot.grade && app.grade && app.grade !== slot.grade) {
      setPendingGradeMismatch({
        kind: "slot",
        appId: applicationId,
        slotId,
        studentName: app.student_name,
        appGrade: app.grade,
        slotGrade: slot.grade,
      });
      return;
    }
    setPendingDrop({ appId: applicationId, slotId });
  }, [unassigned, slots]);

  // Mode selector confirmed → create sessions
  const handleConfirmPlacement = useCallback(async (mode: "all" | "first_half" | "single") => {
    if (!pendingDrop) return;
    const { appId, slotId } = pendingDrop;
    setPendingDrop(null);
    try {
      await summerAPI.createSession({ application_id: appId, slot_id: slotId, mode });
      refreshAll();
      if (mode === "single") {
        showToast("Lessons ready — switch to Calendar to place individually", "success");
      }
    } catch (e: unknown) {
      showToast(formatError(e, "Failed to place student"), "error");
    }
  }, [pendingDrop, refreshAll, showToast]);

  // Calendar drop → single session for a specific lesson. `lessonNumber` is
  // supplied only by ad-hoc Make-up Slot drops (collected via the in-card
  // prompt); regular drops leave it undefined and inherit from SummerLesson.
  const executeCalendarDrop = useCallback(async (
    applicationId: number,
    slotId: number,
    lessonId: number,
    lessonNumber?: number | null,
  ) => {
    const trySave = (force: boolean) =>
      summerAPI.createSession({
        application_id: applicationId,
        slot_id: slotId,
        lesson_id: lessonId,
        ...(lessonNumber != null ? { lesson_number: lessonNumber } : {}),
        ...(force ? { force_lesson_duplicate: true } : {}),
      });
    try {
      const result = await confirmDuplicateOrRetry(trySave);
      if (result === DUPLICATE_CANCELLED) return;
      refreshAll();
    } catch (e: unknown) {
      showToast(formatError(e, "Failed to place student"), "error");
    }
  }, [refreshAll, showToast]);

  const handleDropStudentCalendar = useCallback((
    applicationId: number,
    slotId: number,
    lessonId: number,
    lessonNumber?: number | null,
  ) => {
    const app = unassigned?.find((a) => a.id === applicationId);
    const slot = slots?.find((s) => s.id === slotId);
    if (app && slot && slot.grade && app.grade && app.grade !== slot.grade) {
      setPendingGradeMismatch({
        kind: "calendar",
        applicationId, slotId, lessonId, lessonNumber,
        studentName: app.student_name,
        appGrade: app.grade,
        slotGrade: slot.grade,
      });
      return;
    }
    void executeCalendarDrop(applicationId, slotId, lessonId, lessonNumber);
  }, [unassigned, slots, executeCalendarDrop]);

  // Slot Setup removal — cascade delete all sessions for student+slot
  const handleRemoveSession = useCallback((sessionId: number, studentName?: string) => {
    setPendingDelete({ type: "session", id: sessionId, name: studentName ? `${studentName} from this slot` : "student from this slot", cascade: true });
  }, []);

  // Calendar removal — delete only this specific lesson's session
  const handleRemoveSessionFromCalendar = useCallback((sessionId: number, studentName?: string) => {
    setPendingDelete({ type: "session", id: sessionId, name: studentName ? `${studentName} from this lesson` : "student from this lesson", cascade: false });
  }, []);

  // Confirm delete action
  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const { type, id, cascade } = pendingDelete;
    setPendingDelete(null);
    try {
      if (type === "slot") {
        await summerAPI.deleteSlot(id);
      } else {
        await summerAPI.deleteSession(id, cascade);
      }
      refreshAll();
    } catch (e: unknown) {
      showToast(formatError(e, "Failed to delete"), "error");
    }
  }, [pendingDelete, refreshAll, showToast]);


  // Navigate to a specific lesson date in the calendar tab.
  // Accepts either a bare lesson date (student-lessons table) or an object with
  // an explicit target location (placement rows — may sit at a different branch
  // than the currently-viewed one). `calendarTarget` state lives up top.
  const handleNavigateToLesson = useCallback((arg: string | {
    lessonDate: string; location: string; timeSlot?: string; sessionId?: number;
  }) => {
    const lessonDate = typeof arg === "string" ? arg : arg.lessonDate;
    const targetLocation = typeof arg === "string" ? null : arg.location;
    const highlightSessionId = typeof arg === "string" ? null : arg.sessionId ?? null;
    if (targetLocation && targetLocation !== location) setLocation(targetLocation);
    bumpCalendarTarget(lessonDate, highlightSessionId);
    setActiveTab("calendar");
  }, [location, bumpCalendarTarget]);

  // Bulk confirm tentative sessions
  const [bulkConfirmPending, setBulkConfirmPending] = useState<{ slotId?: number; label?: string } | null>(null);
  const handleBulkConfirm = useCallback(async () => {
    if (!configId || !bulkConfirmPending) return;
    setBulkConfirmPending(null);
    try {
      const { confirmed, apps_advanced } = await summerAPI.bulkConfirmSessions(
        configId, location, bulkConfirmPending.slotId,
      );
      const appsMsg = apps_advanced > 0
        ? ` · ${apps_advanced} application${apps_advanced !== 1 ? "s" : ""} → Placement Offered`
        : "";
      showToast(
        `Confirmed ${confirmed} session${confirmed !== 1 ? "s" : ""}${appsMsg}`,
        "success",
      );
      refreshAll();
    } catch (e: unknown) {
      showToast(formatError(e, "Failed to confirm"), "error");
    }
  }, [configId, location, bulkConfirmPending, showToast, refreshAll]);

  // Drag preference highlighting — classifyPrefs owns the tier split.
  const [dragBuddySlots, setDragBuddySlots] = useState<Set<string> | null>(null);

  // Fetch all applications for demand bar filter (only when filter active)
  const { data: demandFilterApps } = useSWR(
    demandPrefFilter && configId && location
      ? ["summer-apps-demand", configId, location, demandPrefFilter.grade]
      : null,
    () => summerAPI.getApplications({ config_id: configId!, location, grade: demandPrefFilter!.grade }),
  );

  // Applications matching the demand bar filter (all apps, not just unassigned).
  // /summer/applications returns exit states too, unlike /summer/unassigned —
  // drop them here so Demand matches what Incomplete shows.
  const demandFilteredApps = useMemo(() => {
    if (!demandPrefFilter || !demandFilterApps) return null;
    return demandFilterApps.filter((a) => {
      if (!ARRANGEMENT_STATUSES.includes(a.application_status)) return false;
      const prefs = classifyPrefs(a);
      const pool = demandPrefFilter.tier === "first" ? prefs.primary : prefs.backup;
      return pool.some((p) => p.day === demandPrefFilter.day && p.time === demandPrefFilter.timeSlot);
    });
  }, [demandPrefFilter, demandFilterApps]);

  // Pre-index buddy_group_id → slot keys so drag start is O(1).
  const buddySlotIndex = useMemo(() => {
    const idx = new Map<number, Set<string>>();
    if (!slots) return idx;
    for (const slot of slots) {
      const key = `${slot.slot_day}|${slot.time_slot}`;
      for (const s of slot.sessions) {
        if (s.buddy_group_id != null) {
          if (!idx.has(s.buddy_group_id)) idx.set(s.buddy_group_id, new Set());
          idx.get(s.buddy_group_id)!.add(key);
        }
      }
    }
    return idx;
  }, [slots]);

  const handleDragStart = useCallback((app: SummerApplication) => {
    const { primary, backup } = classifyPrefs(app);
    setDragPrefs({ primary, backup });
    if (app.buddy_group_id) {
      const keys = buddySlotIndex.get(app.buddy_group_id) ?? null;
      setDragBuddySlots(keys && keys.size > 0 ? keys : null);
    } else {
      setDragBuddySlots(null);
    }
  }, [buddySlotIndex]);

  const handleDragEnd = useCallback(() => {
    setDragPrefs(null);
    setDragBuddySlots(null);
  }, []);

  // Precedence: demand-bar filter > workflow chip > default incomplete list.
  const panelApplications = useMemo(
    () =>
      demandPrefFilter ? (demandFilteredApps ?? [])
      : statusFilter ? (statusFilteredApps ?? [])
      : (unassigned ?? []),
    [demandPrefFilter, demandFilteredApps, statusFilter, statusFilteredApps, unassigned]
  );
  const panelLoading =
    demandPrefFilter ? !demandFilterApps
    : statusFilter ? !statusFilteredApps
    : (!unassigned && !!configId);

  // Build global search index: placed students (via studentLessons) + unplaced
  // (via unassigned). Placed entries carry a jump target — first placed lesson's
  // date + session id — so selecting them routes straight to the calendar with
  // a ring highlight. Haystack folds phone digits + school/primary student id
  // so admins can paste any of those from a parent message and find the row.
  const searchEntries = useMemo<SummerStudentSearchEntry[]>(() => {
    const digits = (s?: string | null) => (s ? s.replace(/\D+/g, "") : "");
    const makeEntry = (source: {
      application_id: number;
      student_name: string;
      grade: string;
      lang_stream?: string | null;
      contact_phone?: string | null;
      linked_student?: { school_student_id?: string | null } | null;
      linked_prospect?: { primary_student_id?: string | null } | null;
    }, firstLesson: SummerStudentSearchEntry["firstLesson"]): SummerStudentSearchEntry => {
      const studentId = getLinkedStudentId(source);
      return {
        applicationId: source.application_id,
        name: source.student_name,
        grade: source.grade,
        langStream: source.lang_stream ?? null,
        studentId,
        placed: firstLesson != null,
        firstLesson,
        haystack: `${source.student_name.toLowerCase()} ${digits(source.contact_phone)} ${studentId?.toLowerCase() ?? ""}`,
      };
    };

    const out: SummerStudentSearchEntry[] = [];
    const seen = new Set<number>();
    for (const s of studentLessonsData?.students ?? []) {
      const first = s.lessons
        .filter((l) => l.placed && l.lesson_date)
        .sort((a, b) => (a.lesson_number ?? 0) - (b.lesson_number ?? 0))[0];
      const jumpTarget = first
        ? { lessonDate: first.lesson_date!, sessionId: first.session_id ?? null }
        : null;
      out.push(makeEntry(s, jumpTarget));
      seen.add(s.application_id);
    }
    for (const a of unassigned ?? []) {
      if (seen.has(a.id)) continue;
      out.push(makeEntry({ ...a, application_id: a.id }, null));
    }
    return out;
  }, [studentLessonsData, unassigned]);

  const handleSearchSelect = useCallback((entry: SummerStudentSearchEntry) => {
    // Students tab already shows every row (placed + unplaced), so when the
    // user searches from that context, stay put and just ring the match
    // instead of yanking them to Slot Setup / Calendar.
    if (activeTab === "students") {
      bumpStudentsTarget(entry.applicationId);
      return;
    }
    if (!entry.placed) {
      setSelectedAppId(entry.applicationId);
      return;
    }
    // Slot Setup is the primary target — find every slot the student sits in,
    // pick the earliest by day/time as the scroll anchor, let all matching
    // cards ring.
    const matchingSlots = (slots ?? []).filter((s) =>
      s.sessions.some((p) => p.application_id === entry.applicationId),
    );
    if (matchingSlots.length > 0) {
      const dayIndex = new Map(openDays.map((d, i) => [d, i]));
      const [first] = [...matchingSlots].sort((a, b) => {
        const da = dayIndex.get(a.slot_day) ?? Number.MAX_SAFE_INTEGER;
        const db = dayIndex.get(b.slot_day) ?? Number.MAX_SAFE_INTEGER;
        return da !== db ? da - db : a.time_slot.localeCompare(b.time_slot);
      });
      bumpSlotTarget(entry.applicationId, first?.id ?? null);
      setActiveTab("slots");
      return;
    }
    if (entry.firstLesson) {
      bumpCalendarTarget(entry.firstLesson.lessonDate, entry.firstLesson.sessionId);
      setActiveTab("calendar");
      showToast(
        "No recurring slot placement — showing individual sessions on the Calendar",
        "info",
      );
      return;
    }
    setSelectedAppId(entry.applicationId);
  }, [activeTab, bumpStudentsTarget, slots, openDays, bumpSlotTarget, bumpCalendarTarget, showToast]);

  // Stats
  const totalIncomplete = unassigned?.length ?? 0;
  const totalTentative = slots?.reduce(
    (sum, s) => sum + s.sessions.filter((p) => p.session_status === "Tentative").length,
    0
  ) ?? 0;
  const totalConfirmed = slots?.reduce(
    (sum, s) => sum + s.sessions.filter((p) => p.session_status === "Confirmed").length,
    0
  ) ?? 0;

  if (!canView) {
    return (
      <DeskSurface>
        <PageTransition className="p-6">
          <p className="text-muted-foreground">Admin access required.</p>
        </PageTransition>
      </DeskSurface>
    );
  }

  const isLoading = !configs || !configId || !location;

  return (
    <DeskSurface fullHeight>
      <PageTransition className="flex flex-col h-full p-2 sm:p-6">
        <div className="flex flex-col h-full bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm paper-texture overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a] space-y-2">
          {/* Row 1: Title + search + location + refresh. On mobile the search
              wraps to its own full-width row via order-last + w-full; on sm+
              it sits inline between the title and the location select. */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
              <Grid3X3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-foreground">Timetable Arrangement</h1>
              <p className="hidden sm:block text-xs text-muted-foreground">Manage slots, sessions, and lesson scheduling</p>
            </div>
            <SummerStudentSearch
              entries={searchEntries}
              onSelect={handleSearchSelect}
              className="order-last w-full sm:order-none sm:w-56 md:w-72 sm:shrink-0"
            />
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground max-w-[7rem] sm:max-w-none"
            >
              {locations.map((loc) => (
                <option key={loc.name} value={loc.name}>
                  {LOCATION_TO_CODE[loc.name] || loc.name}
                </option>
              ))}
            </select>
            <button
              onClick={refreshAll}
              disabled={isValidating}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              title="Refresh"
              aria-label="Refresh arrangement data"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isValidating && "animate-spin")} />
            </button>
          </div>

          {/* Row 2: Stats + actions */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{totalIncomplete} incomplete</span>
              {totalTentative > 0 ? (
                <button
                  onClick={() => setBulkConfirmPending({ label: `${LOCATION_TO_CODE[location] || location}` })}
                  className="text-yellow-600 dark:text-yellow-400 hover:underline cursor-pointer"
                  title="Click to confirm all tentative sessions"
                >
                  {totalTentative} tentative
                </button>
              ) : (
                <span className="text-yellow-600 dark:text-yellow-400">{totalTentative} tentative</span>
              )}
              <span className="text-green-600 dark:text-green-400">{totalConfirmed} confirmed</span>
            </div>

            <div className="hidden sm:block h-5 w-px bg-border" aria-hidden />

            <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Filter by application status">
              {ARRANGEMENT_STATUSES.map((status, i) => (
                <Fragment key={status}>
                  {i === PRE_ARRANGEMENT_STATUSES.length && (
                    <span className="h-4 w-px bg-border/70 mx-0.5" aria-hidden />
                  )}
                  <StatusFilterChip
                    status={status}
                    count={appStats?.by_status?.[status] ?? 0}
                    active={statusFilter === status}
                    onToggle={() => setStatusFilter(statusFilter === status ? null : status)}
                  />
                </Fragment>
              ))}
            </div>

            <div className="flex-1" />
            <button
              onClick={() => setDutyModalOpen(true)}
              disabled={!location}
              title="Tutor Duties"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Users2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Tutor Duties</span>
            </button>
            {activeTab === "slots" && (
              <button
                onClick={() => setWorkloadOpen((v) => !v)}
                title={workloadOpen ? "Hide workload summary" : "Show workload summary"}
                aria-pressed={workloadOpen}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors",
                  workloadOpen
                    ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                    : "border-border text-foreground hover:bg-gray-50 dark:hover:bg-gray-800",
                )}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Workload</span>
              </button>
            )}
            <button
              onClick={() => setAutoSuggestOpen(true)}
              disabled={!unassigned?.length || !slots?.length}
              title="Auto-Suggest"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Auto-Suggest</span>
            </button>
          </div>

          <SummerTutorWorkloadPanel
            slots={slots ?? []}
            open={workloadOpen && activeTab === "slots"}
          />
        </div>

        {/* View tabs */}
        <div className="flex items-center gap-1 px-4 border-b border-[#e8d4b8]/50 dark:border-[#6b5a4a]/50">
          <button
            onClick={() => setActiveTab("slots")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === "slots"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Grid3X3 className="h-3.5 w-3.5" />
            Slot Setup
          </button>
          <button
            onClick={() => setActiveTab("calendar")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === "calendar"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Calendar
          </button>
          <button
            onClick={() => setActiveTab("students")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === "students"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <TableProperties className="h-3.5 w-3.5" />
            Students
          </button>
        </div>

        {/* Main content: grid/calendar + unassigned panel */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Loading configuration...
          </div>
        ) : (
          <>
            <div className="flex gap-4 flex-1 min-h-0 p-2 sm:p-4">
              <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                {activeTab === "slots" ? (
                  <SummerArrangementGrid
                    days={openDays}
                    timeSlots={timeSlots}
                    demand={demand?.cells ?? []}
                    slots={slots ?? []}
                    grades={grades}
                    onCreateSlot={handleCreateSlot}
                    onUpdateSlot={handleUpdateSlot}
                    onDeleteSlot={handleDeleteSlot}
                    onDropStudent={handleDropStudent}
                    onRemoveSession={handleRemoveSession}
                    onClickStudent={setSelectedAppId}
                    onDropFailed={(reason) => showToast(reason, "error")}
                    dragPrefs={dragPrefs}
                    getAvailableTutors={getAvailableTutors}
                    onConfirmSlot={(slotId) => setBulkConfirmPending({ slotId })}
                    dragBuddySlots={dragBuddySlots}
                    onDemandBarClick={(f) => setDemandPrefFilter((prev) =>
                      prev && prev.day === f.day && prev.timeSlot === f.timeSlot && prev.grade === f.grade && prev.tier === f.tier
                        ? null : f
                    )}
                    slotHighlightTarget={slotTarget}
                  />
                ) : activeTab === "calendar" ? (
                  <SummerSessionCalendar
                    configId={configId!}
                    location={location}
                    courseStartDate={activeConfig!.course_start_date}
                    courseEndDate={activeConfig!.course_end_date}
                    openDays={openDays}
                    timeSlots={timeSlots}
                    totalLessons={activeConfig!.total_lessons}
                    onDropStudent={handleDropStudentCalendar}
                    onRemoveSession={handleRemoveSessionFromCalendar}
                    onClickStudent={setSelectedAppId}
                    dragPrefs={dragPrefs}
                    navigateToWeek={calendarTarget}
                  />
                ) : (
                  <SummerStudentLessonsTable
                    configId={configId!}
                    location={location}
                    totalLessons={activeConfig!.total_lessons}
                    statusFilter={demandPrefFilter ? null : statusFilter}
                    highlightTarget={studentsTarget}
                    onClickStudent={setSelectedAppId}
                    onFindSlot={setFindSlotTarget}
                    onNavigateToLesson={handleNavigateToLesson}
                  />
                )}
              </div>
              {/* Desktop: always visible */}
              <div className="hidden md:flex">
                <SummerUnassignedPanel
                  applications={panelApplications}
                  grades={grades}
                  loading={panelLoading}
                  onClickStudent={setSelectedAppId}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  totalLessons={activeConfig?.total_lessons ?? 8}
                  onSuggestStudent={(id, name) => setSuggestForStudent({ id, name })}
                  prefFilter={demandPrefFilter}
                  onClearPrefFilter={() => setDemandPrefFilter(null)}
                  statusFilter={demandPrefFilter ? null : statusFilter}
                  onClearStatusFilter={() => setStatusFilter(null)}
                />
              </div>
            </div>

            {/* Mobile: floating toggle button */}
            <button
              className="md:hidden fixed bottom-4 right-4 z-40 rounded-full bg-primary text-primary-foreground p-3 shadow-lg"
              onClick={() => setMobilePanelOpen(true)}
            >
              <Users className="h-5 w-5" />
              {totalIncomplete > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                  {totalIncomplete}
                </span>
              )}
            </button>

            {/* Mobile: panel overlay (always mounted for slide animation) */}
            <div className={cn(
              "md:hidden fixed inset-0 z-50",
              mobilePanelOpen ? "pointer-events-auto" : "pointer-events-none"
            )}>
              <div
                className={cn(
                  "fixed inset-0 bg-black/50 transition-opacity duration-300",
                  mobilePanelOpen ? "opacity-100" : "opacity-0"
                )}
                onClick={() => setMobilePanelOpen(false)}
              />
              <div className={cn(
                "fixed top-14 right-0 bottom-0 w-[min(20rem,85vw)] z-50 shadow-xl transition-transform duration-300 ease-out",
                mobilePanelOpen ? "translate-x-0" : "translate-x-full"
              )}>
                <SummerUnassignedPanel
                  className="w-full h-full rounded-none border-0 border-l"
                  hideCollapse
                  applications={panelApplications}
                  grades={grades}
                  loading={panelLoading}
                  onClickStudent={(id) => { setSelectedAppId(id); setMobilePanelOpen(false); }}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  totalLessons={activeConfig?.total_lessons ?? 8}
                  onSuggestStudent={(id, name) => { setSuggestForStudent({ id, name }); setMobilePanelOpen(false); }}
                  prefFilter={demandPrefFilter}
                  onClearPrefFilter={() => setDemandPrefFilter(null)}
                  statusFilter={demandPrefFilter ? null : statusFilter}
                  onClearStatusFilter={() => setStatusFilter(null)}
                />
              </div>
            </div>
          </>
        )}
        </div>{/* end paper card */}

        {/* Auto-suggest modal */}
        {(autoSuggestOpen || suggestForStudent) && configId && (
          <SummerAutoSuggestModal
            isOpen={autoSuggestOpen || !!suggestForStudent}
            onClose={() => { setAutoSuggestOpen(false); setSuggestForStudent(null); }}
            configId={configId}
            location={location}
            onAccepted={refreshAll}
            applicationId={suggestForStudent?.id}
            studentName={suggestForStudent?.name}
            courseStartDate={activeConfig?.course_start_date}
            courseEndDate={activeConfig?.course_end_date}
          />
        )}

        {/* Tutor duty modal */}
        {dutyModalOpen && configId && (
          <SummerTutorDutyModal
            isOpen={dutyModalOpen}
            onClose={() => setDutyModalOpen(false)}
            configId={configId}
            location={location}
            days={openDays}
            timeSlots={timeSlots}
            onSaved={() => mutateDuties()}
          />
        )}

        {/* Application detail modal */}
        <SummerApplicationDetailModal
          application={selectedApp?.id === selectedAppId ? selectedApp : null}
          isOpen={selectedAppId !== null}
          onClose={() => setSelectedAppId(null)}
          onUpdated={refreshAll}
          onOptimisticUpdate={optimisticallyUpdateApp}
          locations={locations}
          config={activeConfig ?? null}
          baseFee={activeConfig?.pricing_config?.base_fee}
          onNavigateToLesson={handleNavigateToLesson}
        />

        <ConfirmDialog
          isOpen={!!pendingGradeMismatch}
          onConfirm={() => {
            const m = pendingGradeMismatch;
            if (!m) return;
            setPendingGradeMismatch(null);
            if (m.kind === "slot") {
              setPendingDrop({ appId: m.appId, slotId: m.slotId });
            } else {
              void executeCalendarDrop(m.applicationId, m.slotId, m.lessonId, m.lessonNumber);
            }
          }}
          onCancel={() => setPendingGradeMismatch(null)}
          title="Different grade"
          message={pendingGradeMismatch
            ? `Place ${pendingGradeMismatch.studentName} (${pendingGradeMismatch.appGrade}) in a ${pendingGradeMismatch.slotGrade} ${pendingGradeMismatch.kind === "calendar" ? "lesson" : "slot"}?`
            : ""}
          consequences={pendingGradeMismatch
            ? [`The slot will stay in the ${pendingGradeMismatch.slotGrade} row of the grid`]
            : []}
          confirmText="Place anyway"
          variant="warning"
        />

        {/* Placement mode selector */}
        <SummerPlacementModeModal
          isOpen={!!pendingDrop}
          onClose={() => setPendingDrop(null)}
          onConfirm={handleConfirmPlacement}
          studentName={unassigned?.find(a => a.id === pendingDrop?.appId)?.student_name ?? ""}
          slotLabel={(() => {
            if (!pendingDrop) return "";
            const slot = slots?.find(s => s.id === pendingDrop.slotId);
            if (!slot) return "";
            return `${DAY_ABBREV[slot.slot_day] || slot.slot_day} ${slot.time_slot}${slot.grade ? ` ${slot.grade}` : ""}`;
          })()}
          totalLessons={activeConfig?.total_lessons ?? 8}
        />

        {/* Find Slot dialog */}
        {findSlotTarget && configId && (
          <SummerFindSlotDialog
            isOpen={!!findSlotTarget}
            onClose={() => setFindSlotTarget(null)}
            configId={configId}
            location={location}
            applicationId={findSlotTarget.applicationId}
            studentName={findSlotTarget.studentName}
            grade={findSlotTarget.grade}
            lessonNumber={findSlotTarget.lessonNumber}
            afterDate={findSlotTarget.afterDate}
            beforeDate={findSlotTarget.beforeDate}
            openDays={openDays}
            courseStartDate={activeConfig?.course_start_date}
            courseEndDate={activeConfig?.course_end_date}
            timeSlots={timeSlots}
            onPlaced={() => {
              setFindSlotTarget(null);
              refreshAll();
            }}
          />
        )}

        {/* Delete confirmation */}
        <ConfirmDialog
          isOpen={!!pendingDelete}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
          title={pendingDelete?.type === "slot" ? "Delete Slot" : "Remove Student"}
          message={`Are you sure you want to remove ${pendingDelete?.name ?? ""}?`}
          consequences={
            pendingDelete?.consequences
            ?? (pendingDelete?.cascade ? ["This will remove all lesson sessions for this student in this slot"] : undefined)
          }
          variant="danger"
          confirmText="Remove"
        />

        {/* Bulk confirm tentative sessions */}
        <ConfirmDialog
          isOpen={!!bulkConfirmPending}
          onConfirm={handleBulkConfirm}
          onCancel={() => setBulkConfirmPending(null)}
          title="Confirm Sessions"
          message={
            bulkConfirmPending?.slotId
              ? `Confirm all tentative sessions in this slot?`
              : `Confirm all ${totalTentative} tentative sessions at ${bulkConfirmPending?.label ?? ""}?`
          }
          consequences={[
            "Applications in Submitted or Under Review will advance to Placement Offered.",
            "Applications already past Placement Offered are left untouched.",
          ]}
          confirmText="Confirm All"
        />
      </PageTransition>
    </DeskSurface>
  );
}
