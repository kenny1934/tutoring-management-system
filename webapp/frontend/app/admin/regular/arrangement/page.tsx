"use client";

import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from "react";
import useSWR from "swr";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle, useVisibilityAwareInterval } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { BarChart3, Grid3X3, RefreshCw, Users, Users2, UploadCloud, X } from "lucide-react";
import { cn, formatError } from "@/lib/utils";
import { regularAPI, tutorsAPI } from "@/lib/api";
import { RegularArrangementGrid } from "@/components/admin/RegularArrangementGrid";
import { RegularUnassignedPanel } from "@/components/admin/RegularUnassignedPanel";
import { RegularApplicationDetailModal } from "@/components/admin/RegularApplicationDetailModal";
import {
  REGULAR_STATUS_COLORS, REGULAR_STATUS_ICONS,
} from "@/components/admin/RegularApplicationCard";
import { StudentJumpSearch, type StudentJumpSearchEntry } from "@/components/ui/student-jump-search";
import { PublishFilterDropdown } from "@/components/admin/PublishFilterDropdown";
import { TutorDutyModal, type TutorDutyApi } from "@/components/admin/TutorDutyModal";
import { TutorWorkloadPanel } from "@/components/admin/TutorWorkloadPanel";
import type { RegularTutorOption } from "@/components/admin/RegularSlotCard";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LOCATION_TO_CODE, WEEK_DAY_ORDER, DAY_ABBREV, effectiveStream } from "@/lib/regular-utils";
import type { RegularDemandBarFilter } from "@/components/admin/RegularSlotCell";
import type { RegularApplication, RegularSlot, RegularSlotUpdate } from "@/types";

/** Exit statuses stay on the applications page triage surface. */
const EXCLUDED_STATUSES = new Set(["Withdrawn", "Rejected"]);

/** Publishing is gated on the fee message having gone out, same as summer. */
const PUBLISHABLE_STATUSES = new Set(["Fee Sent", "Paid", "Enrolled"]);

// Statuses worth filtering by from the arrangement surface: the rungs before
// a slot is offered, then the ones after. Withdrawn and Rejected belong to the
// applications page triage view.
const PRE_ARRANGEMENT_STATUSES = ["Submitted", "Under Review"] as const;
const POST_ARRANGEMENT_STATUSES = [
  "Placement Offered", "Placement Confirmed", "Fee Sent", "Paid", "Enrolled", "Waitlisted",
] as const;
const ARRANGEMENT_STATUSES = [...PRE_ARRANGEMENT_STATUSES, ...POST_ARRANGEMENT_STATUSES];

/** Regular's side of the shared tutor-duty modal. */
const REGULAR_DUTY_API: TutorDutyApi = {
  getActiveTutors: regularAPI.getActiveTutors,
  getDuties: regularAPI.getTutorDuties,
  bulkSetDuties: regularAPI.bulkSetTutorDuties,
};

/** A regular slot's students are the applications placed in it. */
const regularStudentsIn = (slot: RegularSlot) => slot.assigned_count ?? 0;

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
  const colors = REGULAR_STATUS_COLORS[status];
  const Icon = REGULAR_STATUS_ICONS[status];
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

export default function RegularArrangementPage() {
  usePageTitle("Regular Arrangement");
  const { canViewAdminPages: canView, isReadOnly: readOnly } = useAuth();
  const { showToast } = useToast();

  const [configId, setConfigId] = useState<number | null>(null);
  const [location, setLocation] = useState<string>("");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  // Defer the first mount of the mobile panel so desktop sessions do not pay
  // for a never-visible second copy.
  const hasOpenedMobileRef = useRef(false);
  if (mobilePanelOpen) hasOpenedMobileRef.current = true;
  // Mobile tap-to-place: a panel tap sets this; slot cards then accept taps
  // that funnel into the same drop handler the drag path uses.
  const [pendingPlacementAppId, setPendingPlacementAppId] = useState<number | null>(null);
  // Application opened in the detail modal, from a panel card or a slot row.
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  // Set by clicking a demand sparkline: narrows the panel to the students
  // behind that bar.
  const [demandFilter, setDemandFilter] = useState<RegularDemandBarFilter | null>(null);
  // Set by a header status chip: narrows the panel to that rung of the ladder.
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [publishedFilter, setPublishedFilter] = useState<"published" | "unpublished" | null>(null);
  const [dutyModalOpen, setDutyModalOpen] = useState(false);
  const [workloadOpen, setWorkloadOpen] = useState(false);
  // Search jump target. `seq` bumps on every pick so re-selecting the same
  // student rings the card again.
  const [slotTarget, setSlotTarget] = useState<{
    applicationId: number;
    scrollSlotId: number | null;
    day?: string | null;
    seq: number;
  } | null>(null);
  const [dragPrefs, setDragPrefs] = useState<{
    primary: { day: string; time: string }[];
    backup: { day: string; time: string }[];
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: number;
    label: string;
    assignedCount: number;
  } | null>(null);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    published: number;
    failures: { name: string; message: string }[];
  } | null>(null);

  // Fetch configs and default to the active one + its first branch.
  const { data: configs } = useSWR(
    canView ? "regular-configs" : null,
    () => regularAPI.getConfigs()
  );

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

  const activeConfig = configs?.find((c) => c.id === configId);
  const locations = activeConfig?.locations ?? [];
  const selectedLocation = locations.find((l) => l.name === location);

  // Poll the feeds while the tab is visible.
  const slotsPollMs = useVisibilityAwareInterval(30000);
  const demandPollMs = useVisibilityAwareInterval(60000);
  const appsPollMs = useVisibilityAwareInterval(30000);

  const {
    data: slots,
    mutate: mutateSlots,
    isValidating: slotsValidating,
  } = useSWR(
    configId && location ? ["regular-slots", configId, location] : null,
    () => regularAPI.getSlots(configId!, location),
    { refreshInterval: slotsPollMs }
  );

  const {
    data: demand,
    mutate: mutateDemand,
    isValidating: demandValidating,
  } = useSWR(
    configId && location ? ["regular-demand", configId, location] : null,
    () => regularAPI.getDemand(configId!, location),
    { refreshInterval: demandPollMs }
  );

  const {
    data: applications,
    mutate: mutateApps,
    isValidating: appsValidating,
  } = useSWR(
    configId && location ? ["regular-arrangement-apps", configId, location] : null,
    () => regularAPI.getApplications({ config_id: configId!, location }),
    { refreshInterval: appsPollMs }
  );

  const { data: tutors } = useSWR(
    canView ? "regular-arrangement-tutors" : null,
    () => tutorsAPI.getAll()
  );
  // Scoped to the selected branch: a tutor based at the other centre should
  // not be offered for a slot here, and the duty roster is per branch too.
  const tutorOptions = useMemo(() => {
    const branch = LOCATION_TO_CODE[location] || location;
    return (tutors || [])
      .filter((t) => t.is_active_tutor !== false && t.default_location === branch)
      .sort((a, b) => a.tutor_name.localeCompare(b.tutor_name))
      .map((t) => ({ id: t.id, name: t.tutor_name }));
  }, [tutors, location]);

  const { data: tutorDuties, mutate: mutateDuties } = useSWR(
    canView && configId && location ? ["tutor-duties", "regular", configId, location] : null,
    () => regularAPI.getTutorDuties(configId!, location)
  );

  const isValidating = slotsValidating || demandValidating || appsValidating;

  // Day columns: the branch's open days plus any day carrying an existing
  // slot, kept in week order.
  const days = useMemo(() => {
    const set = new Set<string>(selectedLocation?.open_days ?? []);
    for (const s of slots ?? []) set.add(s.slot_day);
    return WEEK_DAY_ORDER.filter((d) => set.has(d));
  }, [selectedLocation, slots]);

  // Time rows: union of the branch's per-day slot ladders plus any time
  // carried by an existing slot. HH:MM strings sort correctly.
  const timeSlots = useMemo(() => {
    const set = new Set<string>();
    for (const day of selectedLocation?.open_days ?? []) {
      for (const t of selectedLocation?.time_slots?.[day] ?? []) set.add(t);
    }
    for (const s of slots ?? []) set.add(s.time_slot);
    if (set.size === 0) {
      for (const t of activeConfig?.time_slots ?? []) set.add(t);
    }
    return [...set].sort();
  }, [selectedLocation, slots, activeConfig]);

  // Per-cell tutor lists carrying duty state. Precomputed once so every cell
  // keeps a stable array identity rather than a fresh one per render.
  const tutorsByCell = useMemo(() => {
    const onDutyAt = new Map<string, Set<number>>();
    for (const d of tutorDuties ?? []) {
      const key = `${d.duty_day}|${d.time_slot}`;
      if (!onDutyAt.has(key)) onDutyAt.set(key, new Set());
      onDutyAt.get(key)!.add(d.tutor_id);
    }
    const byCell = new Map<string, RegularTutorOption[]>();
    for (const day of days) {
      for (const ts of timeSlots) {
        const key = `${day}|${ts}`;
        const onDuty = onDutyAt.get(key);
        byCell.set(
          key,
          tutorOptions.map((t) => ({ ...t, onDuty: onDuty?.has(t.id) ?? false }))
        );
      }
    }
    return byCell;
  }, [tutorDuties, tutorOptions, days, timeSlots]);

  const grades = useMemo(
    // Seeded grade options always carry a value (F1..F4); name is a fallback.
    () => (activeConfig?.available_grades ?? []).map((g) => g.value ?? g.name),
    [activeConfig]
  );

  // Selectable slot streams: the config's stream options minus Int — a slot is
  // never International (Int folds to E), so only C and E can be declared on one.
  const streams = useMemo(
    () =>
      (activeConfig?.lang_stream_options ?? [])
        .map((o) => o.value ?? o.name)
        .filter((v) => v && v !== "Int"),
    [activeConfig]
  );

  // Panel cohort: unassigned, workable, not yet published.
  const unassignedApps = useMemo(
    () =>
      (applications ?? []).filter(
        (a) =>
          !a.assigned_slot_id &&
          !a.published_enrollment_id &&
          !EXCLUDED_STATUSES.has(a.application_status)
      ),
    [applications]
  );

  // Panel cohort while a demand bar is selected: everyone behind that bar,
  // assigned or not, so the list length matches the number on the bar.
  const demandFilteredApps = useMemo(() => {
    if (!demandFilter) return null;
    return (applications ?? []).filter((a) => {
      if (EXCLUDED_STATUSES.has(a.application_status)) return false;
      if (a.grade !== demandFilter.grade) return false;
      // A stream-specific bar filters to that stream; a bare-grade bar (no
      // stream) matches every stream, mirroring how the bucket was keyed.
      if (demandFilter.langStream && effectiveStream(a) !== demandFilter.langStream) return false;
      const day = demandFilter.tier === "first" ? a.preference_1_day : a.preference_2_day;
      const time = demandFilter.tier === "first" ? a.preference_1_time : a.preference_2_time;
      return day === demandFilter.day && time === demandFilter.timeSlot;
    });
  }, [applications, demandFilter]);

  // Panel cohort while a status chip or the publish filter is active: those
  // applications, assigned or not.
  const statusFilteredApps = useMemo(() => {
    if (!statusFilter && !publishedFilter) return null;
    return (applications ?? []).filter((a) => {
      if (statusFilter && a.application_status !== statusFilter) return false;
      if (publishedFilter === "published" && !a.published_enrollment_id) return false;
      if (publishedFilter === "unpublished" && a.published_enrollment_id) return false;
      return true;
    });
  }, [applications, statusFilter, publishedFilter]);

  // Precedence: demand bar > status/publish filters > the default unassigned list.
  const panelApplications = demandFilteredApps ?? statusFilteredApps ?? unassignedApps;

  // Header counts, straight off the loaded list so they always agree with it.
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of applications ?? []) {
      counts[a.application_status] = (counts[a.application_status] ?? 0) + 1;
    }
    return counts;
  }, [applications]);

  const assignedCount = useMemo(
    () => (applications ?? []).filter((a) => a.assigned_slot_id).length,
    [applications]
  );
  const publishedCount = useMemo(
    () => (applications ?? []).filter((a) => a.published_enrollment_id).length,
    [applications]
  );

  const demandFilterLabel = demandFilter
    ? `${demandFilter.grade}${demandFilter.langStream ?? ""} · ${DAY_ABBREV[demandFilter.day] || demandFilter.day} ${demandFilter.timeSlot} · ${demandFilter.tier === "first" ? "first choice" : "backup"}`
    : null;

  // Search index over every application at this branch. Haystack folds the
  // phone digits, reference code and linked student code so an admin can paste
  // any of those out of a parent message and land on the student.
  const searchEntries = useMemo<StudentJumpSearchEntry[]>(() => {
    const digits = (s?: string | null) => (s ? s.replace(/\D+/g, "") : "");
    return (applications ?? [])
      .filter((a) => !EXCLUDED_STATUSES.has(a.application_status))
      .map((a) => {
        const studentId = a.linked_student?.school_student_id ?? null;
        return {
          applicationId: a.id,
          name: a.student_name,
          grade: a.grade,
          langStream: a.lang_stream ?? null,
          studentId,
          placed: a.assigned_slot_id != null,
          haystack: [
            a.student_name.toLowerCase(),
            digits(a.contact_phone),
            a.reference_code?.toLowerCase() ?? "",
            studentId?.toLowerCase() ?? "",
          ].join(" "),
        };
      });
  }, [applications]);

  const handleSearchSelect = useCallback((entry: StudentJumpSearchEntry) => {
    // Unassigned students have no card to ring, so open their application
    // instead — that is where the next decision gets made anyway.
    if (!entry.placed) {
      setSelectedAppId(entry.applicationId);
      return;
    }
    const slot = (slots ?? []).find((s) =>
      s.students.some((st) => st.application_id === entry.applicationId)
    );
    if (!slot) {
      setSelectedAppId(entry.applicationId);
      return;
    }
    setSlotTarget((prev) => ({
      applicationId: entry.applicationId,
      scrollSlotId: slot.id,
      day: slot.slot_day,
      seq: (prev?.seq ?? 0) + 1,
    }));
  }, [slots]);

  // The two panel filters are alternatives, never a conjunction: picking one
  // drops the other so the heading always names what is on screen.
  const handleDemandBarClick = useCallback((filter: RegularDemandBarFilter) => {
    setStatusFilter(null);
    setDemandFilter((prev) =>
      prev &&
      prev.day === filter.day &&
      prev.timeSlot === filter.timeSlot &&
      prev.grade === filter.grade &&
      prev.langStream === filter.langStream &&
      prev.tier === filter.tier
        ? null
        : filter
    );
  }, []);

  const handleStatusChipToggle = useCallback((status: string) => {
    setDemandFilter(null);
    setStatusFilter((prev) => (prev === status ? null : status));
  }, []);

  // The demand bar outranks both filters in the panel cohort, so picking
  // either one has to drop it or the choice would look ignored.
  const handleStatusFilterChange = useCallback((next: string | null) => {
    setDemandFilter(null);
    setStatusFilter(next);
  }, []);

  const handlePublishedFilterChange = useCallback(
    (next: "published" | "unpublished" | null) => {
      setDemandFilter(null);
      setPublishedFilter(next);
    },
    []
  );

  // Publish cohort: assigned, fee message already sent, not yet published.
  const publishEligible = useMemo(
    () =>
      (applications ?? []).filter(
        (a) =>
          a.assigned_slot_id &&
          PUBLISHABLE_STATUSES.has(a.application_status) &&
          !a.published_enrollment_id
      ),
    [applications]
  );

  const refreshAll = useCallback(() => {
    return Promise.all([mutateSlots(), mutateDemand(), mutateApps()]);
  }, [mutateSlots, mutateDemand, mutateApps]);

  // ---- Slot CRUD (optimistic, mirrors the summer arrangement page) ----

  const handleCreateSlot = useCallback(async (day: string, timeSlot: string) => {
    if (!configId) return;
    // Temporary id is unique within this list and distinct from real
    // auto-increment ids (always positive). Replaced with the server's slot
    // once the POST resolves.
    const tempId = -Date.now();
    const placeholder: RegularSlot = {
      id: tempId,
      config_id: configId,
      slot_day: day,
      time_slot: timeSlot,
      location,
      grade: null,
      lang_stream: null,
      tutor_id: null,
      tutor_name: null,
      max_students: 8,
      assigned_count: 0,
      students: [],
    };
    try {
      await mutateSlots(
        async (current) => {
          const created = await regularAPI.createSlot({
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
        }
      );
    } catch (e: unknown) {
      showToast(formatError(e, "Failed to create slot"), "error");
    }
  }, [configId, location, mutateSlots, showToast]);

  const handleUpdateSlot = useCallback(async (slotId: number, data: RegularSlotUpdate) => {
    // Resolve tutor_name locally so the optimistic patch shows the right name
    // until the PATCH response overwrites the cache. `undefined` means the
    // update does not touch tutor_id, so leave tutor_name alone too.
    let tutorNameOverride: string | null | undefined;
    if (data.tutor_id === undefined) {
      tutorNameOverride = undefined;
    } else if (data.tutor_id === null) {
      tutorNameOverride = null;
    } else {
      tutorNameOverride =
        tutorOptions.find((t) => t.id === data.tutor_id)?.name ?? null;
    }
    try {
      await mutateSlots(
        async (current) => {
          const updated = await regularAPI.updateSlot(slotId, data);
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
                : s
            ),
          rollbackOnError: true,
          revalidate: false,
        }
      );
    } catch (e: unknown) {
      showToast(formatError(e, "Failed to update slot"), "error");
    }
  }, [mutateSlots, tutorOptions, showToast]);

  const handleDeleteSlot = useCallback((slotId: number) => {
    const slot = slots?.find((s) => s.id === slotId);
    const label = slot
      ? `${DAY_ABBREV[slot.slot_day] || slot.slot_day} ${slot.time_slot}${slot.grade ? ` ${slot.grade}` : ""}`
      : "this slot";
    setPendingDelete({
      id: slotId,
      label,
      assignedCount: slot?.assigned_count ?? 0,
    });
  }, [slots]);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    try {
      await mutateSlots(
        async (current) => {
          await regularAPI.deleteSlot(id);
          return (current ?? []).filter((s) => s.id !== id);
        },
        {
          optimisticData: (current) => (current ?? []).filter((s) => s.id !== id),
          rollbackOnError: true,
          revalidate: false,
        }
      );
    } catch (e: unknown) {
      // Backend guard message already reads well, e.g. "Slot has 2 assigned
      // student(s). Unassign them first."
      showToast(formatError(e, "Failed to delete slot"), "error");
    }
  }, [pendingDelete, mutateSlots, showToast]);

  // ---- Assignment ----

  const handleAssign = useCallback(async (applicationId: number, slotId: number) => {
    const app = applications?.find((a) => a.id === applicationId);
    const patchSlots = (current: RegularSlot[] | undefined): RegularSlot[] =>
      (current ?? []).map((s) => {
        const without = s.students.filter((st) => st.application_id !== applicationId);
        const removed = without.length !== s.students.length;
        if (s.id === slotId) {
          const students = [
            ...without,
            {
              application_id: applicationId,
              student_name: app?.student_name ?? "Student",
              grade: app?.grade ?? "",
              lang_stream: app?.lang_stream ?? null,
              school: app?.school ?? null,
              application_status: app?.application_status ?? "Submitted",
              published: false,
            },
          ];
          return { ...s, students, assigned_count: students.length };
        }
        return removed ? { ...s, students: without, assigned_count: without.length } : s;
      });
    try {
      await mutateSlots(
        async (current) => {
          await regularAPI.assignSlot(applicationId, slotId);
          return patchSlots(current);
        },
        {
          optimisticData: patchSlots,
          rollbackOnError: true,
          revalidate: false,
        }
      );
      mutateApps(
        (current) =>
          (current ?? []).map((a) =>
            a.id === applicationId ? { ...a, assigned_slot_id: slotId } : a
          ),
        { revalidate: false }
      );
    } catch (e: unknown) {
      showToast(formatError(e, "Failed to assign student"), "error");
    }
  }, [applications, mutateSlots, mutateApps, showToast]);

  const handleUnassign = useCallback(async (applicationId: number, studentName: string) => {
    const patchSlots = (current: RegularSlot[] | undefined): RegularSlot[] =>
      (current ?? []).map((s) => {
        const without = s.students.filter((st) => st.application_id !== applicationId);
        return without.length !== s.students.length
          ? { ...s, students: without, assigned_count: without.length }
          : s;
      });
    try {
      await mutateSlots(
        async (current) => {
          await regularAPI.assignSlot(applicationId, null);
          return patchSlots(current);
        },
        {
          optimisticData: patchSlots,
          rollbackOnError: true,
          revalidate: false,
        }
      );
      mutateApps(
        (current) =>
          (current ?? []).map((a) =>
            a.id === applicationId ? { ...a, assigned_slot_id: null } : a
          ),
        { revalidate: false }
      );
      showToast(`${studentName} unassigned`, "success");
    } catch (e: unknown) {
      showToast(formatError(e, "Failed to unassign student"), "error");
    }
  }, [mutateSlots, mutateApps, showToast]);

  const handleDropStudent = useCallback((applicationId: number, slotId: number) => {
    // Tap-to-place is single-shot: consume the selection now so a second tap
    // cannot fire again while the assignment is in flight.
    setPendingPlacementAppId(null);
    void handleAssign(applicationId, slotId);
  }, [handleAssign]);

  const handleDropFailed = useCallback((reason: string) => {
    // A tap-to-place rejection also clears selection so the user is not stuck
    // with the pill after a "slot full" toast.
    setPendingPlacementAppId(null);
    showToast(reason, "error");
  }, [showToast]);

  const handleDragStart = useCallback((app: RegularApplication) => {
    const primary =
      app.preference_1_day && app.preference_1_time
        ? [{ day: app.preference_1_day, time: app.preference_1_time }]
        : [];
    const backup =
      app.preference_2_day && app.preference_2_time
        ? [{ day: app.preference_2_day, time: app.preference_2_time }]
        : [];
    setDragPrefs({ primary, backup });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragPrefs(null);
  }, []);

  // ---- Publish assigned ----

  const handlePublishAssigned = useCallback(async () => {
    setPublishConfirmOpen(false);
    if (publishEligible.length === 0) return;
    setPublishing(true);
    try {
      const nameById = new Map(publishEligible.map((a) => [a.id, a.student_name]));
      const res = await regularAPI.publishApplicationsBatch(
        publishEligible.map((a) => ({ application_id: a.id }))
      );
      const failures = res.results
        .filter((r) => !r.success)
        .map((r) => ({
          name: nameById.get(r.application_id) ?? `Application ${r.application_id}`,
          message: r.error || r.error_code || "Unknown error",
        }));
      setPublishResult({ published: res.published_count, failures });
      refreshAll();
    } catch (e: unknown) {
      showToast(formatError(e, "Failed to publish"), "error");
    } finally {
      setPublishing(false);
    }
  }, [publishEligible, refreshAll, showToast]);

  if (!canView) {
    return (
      <DeskSurface fullHeight>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Access denied
        </div>
      </DeskSurface>
    );
  }

  const isLoading = !configs || !configId || !location;
  const selectedApp = applications?.find((a) => a.id === selectedAppId) ?? null;
  const pendingPlacementName =
    pendingPlacementAppId !== null
      ? applications?.find((a) => a.id === pendingPlacementAppId)?.student_name ?? "student"
      : null;

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
              <div className="w-9 h-9 shrink-0 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Grid3X3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-semibold text-foreground flex items-center gap-1.5">
                  <span>Arrangement</span>
                  {readOnly && <span className="shrink-0 text-[10px] font-normal text-amber-600">(Read-only)</span>}
                </h1>
                <p className="hidden sm:block text-xs text-muted-foreground">
                  Create weekly slots and assign applications. Publish once schedules are confirmed.
                </p>
              </div>
              <StudentJumpSearch
                entries={searchEntries}
                onSelect={handleSearchSelect}
                placeholder="Find student..."
                className="order-last w-full sm:order-none sm:w-56 md:w-72 sm:shrink-0"
              />
              <select
                value={location}
                onChange={(e) => { setLocation(e.target.value); setPendingPlacementAppId(null); }}
                className="px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground max-w-[7rem] sm:max-w-none"
                aria-label="Branch"
              >
                {locations.map((l) => (
                  <option key={l.name} value={l.name}>
                    {LOCATION_TO_CODE[l.name] || l.name}
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
                <span>{unassignedApps.length} unassigned</span>
                <span>{assignedCount} assigned</span>
                <span className="text-green-600 dark:text-green-400">{publishedCount} published</span>
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
                      count={statusCounts[status] ?? 0}
                      active={statusFilter === status}
                      onToggle={() => handleStatusChipToggle(status)}
                    />
                  </Fragment>
                ))}
              </div>

              <span className="hidden sm:block h-5 w-px bg-border" aria-hidden />

              <PublishFilterDropdown
                publishedFilter={publishedFilter}
                onChangePublished={handlePublishedFilterChange}
                statusFilter={statusFilter}
                onChangeStatus={handleStatusFilterChange}
              />

              <div className="flex-1" />
              {!readOnly && (
                <button
                  onClick={() => setDutyModalOpen(true)}
                  disabled={!location}
                  title="Tutor Duties"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Users2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Tutor Duties</span>
                </button>
              )}
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
              {!readOnly && (
                <button
                  onClick={() => setPublishConfirmOpen(true)}
                  disabled={publishEligible.length === 0 || publishing}
                  title={
                    publishEligible.length === 0
                      ? "Nothing is ready. An application has to be placed in a slot and have its fee message sent before it can be published."
                      : `Publish ${publishEligible.length} placed application${publishEligible.length === 1 ? "" : "s"} whose fee message has been sent. Anything still earlier on the ladder is left alone.`
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Publish ready</span>
                  <span className="sm:hidden">Publish</span>
                  {publishEligible.length > 0 && (
                    <span className="tabular-nums">({publishEligible.length})</span>
                  )}
                </button>
              )}
            </div>

            <TutorWorkloadPanel
              slots={slots ?? []}
              open={workloadOpen}
              studentsIn={regularStudentsIn}
            />
          </div>

          {/* Main content: grid + unassigned panel */}
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Loading configuration...
            </div>
          ) : (
            <>
              <div className="flex gap-4 flex-1 min-h-0 p-2 sm:p-4">
                <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                  <RegularArrangementGrid
                    days={days}
                    timeSlots={timeSlots}
                    demand={demand?.cells ?? []}
                    slots={slots ?? []}
                    grades={grades}
                    streams={streams}
                    tutors={tutorOptions}
                    tutorsByCell={tutorsByCell}
                    loading={slots === undefined || demand === undefined}
                    readOnly={readOnly}
                    onCreateSlot={handleCreateSlot}
                    onUpdateSlot={handleUpdateSlot}
                    onDeleteSlot={handleDeleteSlot}
                    onDropStudent={handleDropStudent}
                    onUnassign={handleUnassign}
                    onClickStudent={setSelectedAppId}
                    onDropFailed={handleDropFailed}
                    onDemandBarClick={handleDemandBarClick}
                    slotHighlightTarget={slotTarget}
                    dragPrefs={dragPrefs}
                    pendingPlacementAppId={pendingPlacementAppId}
                  />
                </div>
                {/* Desktop: always visible */}
                <div className="hidden md:flex">
                  <RegularUnassignedPanel
                    applications={panelApplications}
                    grades={grades}
                    streams={streams}
                    configId={configId}
                    loading={!applications}
                    readOnly={readOnly}
                    onAssign={handleAssign}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onClickStudent={setSelectedAppId}
                    demandFilterLabel={demandFilterLabel}
                    onClearDemandFilter={() => setDemandFilter(null)}
                    statusFilter={statusFilter}
                    onClearStatusFilter={() => setStatusFilter(null)}
                  />
                </div>
              </div>

              {/* Mobile placing pill, sits above the panel FAB. */}
              {pendingPlacementName !== null && (
                <div
                  className="md:hidden fixed bottom-20 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground pl-4 pr-2 py-2 shadow-lg text-sm max-w-[16rem]"
                  role="status"
                  aria-live="polite"
                >
                  <span className="font-medium truncate">
                    Placing {pendingPlacementName}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingPlacementAppId(null)}
                    className="shrink-0 rounded-full p-1 hover:bg-primary-foreground/20"
                    title="Cancel placement"
                    aria-label="Cancel placement"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Mobile: floating toggle button */}
              <button
                className="md:hidden fixed bottom-4 right-4 z-40 rounded-full bg-primary text-primary-foreground p-3 shadow-lg"
                onClick={() => setMobilePanelOpen(true)}
                aria-label="Open unassigned applications panel"
              >
                <Users className="h-5 w-5" />
                {unassignedApps.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                    {unassignedApps.length}
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
                  {hasOpenedMobileRef.current && (
                    <RegularUnassignedPanel
                      className="w-full h-full rounded-none border-0 border-l"
                      hideCollapse
                      applications={panelApplications}
                      grades={grades}
                      streams={streams}
                      configId={configId}
                      loading={!applications}
                      readOnly={readOnly}
                      tapMode="select"
                      demandFilterLabel={demandFilterLabel}
                      onClearDemandFilter={() => setDemandFilter(null)}
                      statusFilter={statusFilter}
                      onClearStatusFilter={() => setStatusFilter(null)}
                      onSelectStudent={(id) => {
                        setPendingPlacementAppId(id);
                        setMobilePanelOpen(false);
                      }}
                      onClickStudent={(id) => {
                        setSelectedAppId(id);
                        setMobilePanelOpen(false);
                      }}
                      onAssign={(appId, slotId) => {
                        setMobilePanelOpen(false);
                        void handleAssign(appId, slotId);
                      }}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>{/* end paper card */}

        {/* Tutor duty modal */}
        {dutyModalOpen && configId && (
          <TutorDutyModal
            isOpen={dutyModalOpen}
            onClose={() => setDutyModalOpen(false)}
            configId={configId}
            location={location}
            days={days}
            timeSlots={timeSlots}
            onSaved={() => mutateDuties()}
            api={REGULAR_DUTY_API}
            intakeKey="regular"
          />
        )}

        {/* Application detail modal — opened from a panel card or a slot row */}
        <RegularApplicationDetailModal
          application={selectedApp}
          isOpen={selectedAppId !== null && !!selectedApp}
          onClose={() => setSelectedAppId(null)}
          onUpdated={refreshAll}
          config={activeConfig ?? null}
          readOnly={readOnly}
        />

        {/* Delete slot confirmation */}
        <ConfirmDialog
          isOpen={!!pendingDelete}
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDelete(null)}
          title="Delete Slot"
          message={`Are you sure you want to delete ${pendingDelete?.label ?? "this slot"}?`}
          consequences={
            pendingDelete && pendingDelete.assignedCount > 0
              ? [
                  `This slot has ${pendingDelete.assignedCount} assigned student${pendingDelete.assignedCount > 1 ? "s" : ""}. Unassign them first before deleting.`,
                ]
              : undefined
          }
          variant="danger"
          confirmText="Delete"
        />

        {/* Publish-ready confirmation */}
        <ConfirmDialog
          isOpen={publishConfirmOpen}
          onConfirm={handlePublishAssigned}
          onCancel={() => setPublishConfirmOpen(false)}
          title="Publish Ready Applications"
          message={`Publish ${publishEligible.length} application${publishEligible.length === 1 ? "" : "s"} that are placed in a slot and have had their fee message sent?`}
          consequences={[
            "Each application is published as an enrollment using its assigned slot's day, time and tutor.",
            "Placed applications that have not reached Fee Sent are left as they are.",
            "Failures are reported per application and do not block the rest.",
          ]}
          confirmText="Publish"
        />

        {/* Publish result summary */}
        {publishResult && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setPublishResult(null)}
          >
            <div
              className="w-full max-w-md rounded-xl bg-card border border-border shadow-xl p-4 space-y-3"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Publish results"
            >
              <h2 className="text-sm font-semibold text-foreground">Publish results</h2>
              <p className="text-sm text-muted-foreground">
                {publishResult.published} application{publishResult.published === 1 ? "" : "s"} published successfully.
              </p>
              {publishResult.failures.length > 0 && (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">
                    {publishResult.failures.length} failed:
                  </p>
                  {publishResult.failures.map((f, i) => (
                    <div
                      key={i}
                      className="rounded border border-red-200 dark:border-red-800/50 bg-red-50/60 dark:bg-red-900/20 px-2 py-1"
                    >
                      <span className="text-xs font-semibold text-foreground">{f.name}</span>
                      <span className="block text-[11px] text-muted-foreground">{f.message}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end">
                <button
                  onClick={() => setPublishResult(null)}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </PageTransition>
    </DeskSurface>
  );
}
