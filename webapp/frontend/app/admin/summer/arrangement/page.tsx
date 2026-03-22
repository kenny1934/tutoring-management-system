"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { Grid3X3, CalendarDays, Wand2, Users2, Users, TableProperties } from "lucide-react";
import { cn } from "@/lib/utils";
import useSWR, { useSWRConfig } from "swr";
import { summerAPI } from "@/lib/api";
import { SummerArrangementGrid } from "@/components/admin/SummerArrangementGrid";
import { SummerSessionCalendar } from "@/components/admin/SummerSessionCalendar";
import { SummerUnassignedPanel } from "@/components/admin/SummerUnassignedPanel";
import { SummerAutoSuggestModal } from "@/components/admin/SummerAutoSuggestModal";
import { SummerApplicationDetailModal } from "@/components/admin/SummerApplicationDetailModal";
import { SummerTutorDutyModal } from "@/components/admin/SummerTutorDutyModal";
import { SummerPlacementModeModal } from "@/components/admin/SummerPlacementModeModal";
import { SummerStudentLessonsTable } from "@/components/admin/SummerStudentLessonsTable";
import { SummerFindSlotDialog } from "@/components/admin/SummerFindSlotDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { LOCATION_TO_CODE, DAY_ABBREV } from "@/lib/summer-utils";
import type { SummerSlotUpdate, SummerApplication, AvailableTutor } from "@/types";

export default function SummerArrangementPage() {
  usePageTitle("Summer Arrangement");
  const { isAdmin, isSuperAdmin } = useAuth();
  const { showToast } = useToast();
  const canView = isAdmin || isSuperAdmin;

  const { mutate: globalMutate } = useSWRConfig();
  const [activeTab, setActiveTab] = useState<"slots" | "calendar" | "students">("slots");
  const [configId, setConfigId] = useState<number | null>(null);
  const [location, setLocation] = useState<string>("");
  const [autoSuggestOpen, setAutoSuggestOpen] = useState(false);
  const [suggestForStudent, setSuggestForStudent] = useState<{ id: number; name: string } | null>(null);
  const [dutyModalOpen, setDutyModalOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{ appId: number; slotId: number } | null>(null);
  const [findSlotTarget, setFindSlotTarget] = useState<{
    applicationId: number; studentName: string; grade: string;
    lessonNumber: number; afterDate?: string; beforeDate?: string;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    type: "session" | "slot"; id: number; name: string; cascade: boolean; consequences?: string[];
  } | null>(null);
  const [dragPrefs, setDragPrefs] = useState<{
    pref1?: { day: string; time: string };
    pref2?: { day: string; time: string };
  } | null>(null);

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
  } = useSWR(
    configId && location ? ["summer-demand", configId, location] : null,
    () => summerAPI.getDemand(configId!, location),
    { refreshInterval: 60000 }
  );

  const {
    data: unassigned,
    mutate: mutateUnassigned,
  } = useSWR(
    configId && location ? ["summer-unassigned", configId, location] : null,
    () => summerAPI.getUnassigned({ config_id: configId!, location }),
    { refreshInterval: 30000 }
  );

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
  const { data: selectedApp } = useSWR(
    selectedAppId ? ["summer-app", selectedAppId] : null,
    () => summerAPI.getApplication(selectedAppId!)
  );

  // SWR invalidation helpers
  const mutateCalendar = useCallback(() => globalMutate((key) => Array.isArray(key) && key[0] === "summer-calendar"), [globalMutate]);
  const mutateStudentLessons = useCallback(() => globalMutate((key) => Array.isArray(key) && key[0] === "summer-student-lessons"), [globalMutate]);
  const mutateFindSlot = useCallback(() => globalMutate((key) => Array.isArray(key) && key[0] === "summer-find-slot"), [globalMutate]);

  // Handlers
  const refreshAll = useCallback(() => {
    mutateSlots();
    mutateDemand();
    mutateUnassigned();
    mutateCalendar();
    mutateStudentLessons();
  }, [mutateSlots, mutateDemand, mutateUnassigned, mutateCalendar, mutateStudentLessons]);

  const handleCreateSlot = useCallback(async (day: string, timeSlot: string) => {
    if (!configId) return;
    try {
      await summerAPI.createSlot({
        config_id: configId,
        slot_day: day,
        time_slot: timeSlot,
        location,
      });
      mutateSlots();
    } catch (e: any) {
      showToast(e.message || "Failed to create slot", "error");
    }
  }, [configId, location, mutateSlots, showToast]);

  const handleUpdateSlot = useCallback(async (slotId: number, data: SummerSlotUpdate) => {
    try {
      await summerAPI.updateSlot(slotId, data);
      mutateSlots();
    } catch (e: any) {
      showToast(e.message || "Failed to update slot", "error");
    }
  }, [mutateSlots, showToast]);

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

  // Slot Setup drop → open mode selector
  const handleDropStudent = useCallback((applicationId: number, slotId: number) => {
    setPendingDrop({ appId: applicationId, slotId });
  }, []);

  // Mode selector confirmed → create sessions
  const handleConfirmPlacement = useCallback(async (mode: "all" | "first_half" | "single") => {
    if (!pendingDrop) return;
    const { appId, slotId } = pendingDrop;
    setPendingDrop(null);
    try {
      await summerAPI.createSession({ application_id: appId, slot_id: slotId, mode });
      mutateSlots();
      mutateUnassigned();
      mutateCalendar();
      if (mode === "single") {
        showToast("Lessons ready — switch to Calendar to place individually", "success");
      }
    } catch (e: any) {
      showToast(e.message || "Failed to place student", "error");
    }
  }, [pendingDrop, mutateSlots, mutateUnassigned, mutateCalendar, showToast]);

  // Calendar drop → single session for a specific lesson
  const handleDropStudentCalendar = useCallback(async (applicationId: number, slotId: number, lessonId: number) => {
    try {
      await summerAPI.createSession({ application_id: applicationId, slot_id: slotId, lesson_id: lessonId });
      mutateSlots();
      mutateUnassigned();
      mutateCalendar();
    } catch (e: any) {
      showToast(e.message || "Failed to place student", "error");
    }
  }, [mutateSlots, mutateUnassigned, mutateCalendar, showToast]);

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
      mutateSlots();
      mutateUnassigned();
      mutateCalendar();
      mutateStudentLessons();
    } catch (e: any) {
      showToast(e.message || "Failed to delete", "error");
    }
  }, [pendingDelete, mutateSlots, mutateUnassigned, mutateCalendar, mutateStudentLessons, showToast]);


  // Drag preference highlighting
  const handleDragStart = useCallback((app: SummerApplication) => {
    setDragPrefs({
      pref1: app.preference_1_day && app.preference_1_time
        ? { day: app.preference_1_day, time: app.preference_1_time }
        : undefined,
      pref2: app.preference_2_day && app.preference_2_time
        ? { day: app.preference_2_day, time: app.preference_2_time }
        : undefined,
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragPrefs(null);
  }, []);

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
      <PageTransition className="flex flex-col h-full p-4 sm:p-6">
        <div className="flex flex-col h-full bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm paper-texture overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap px-4 py-3 sm:px-6 sm:py-4 border-b border-[#e8d4b8] dark:border-[#6b5a4a]">
          <div className="flex items-center gap-2">
            <Grid3X3 className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Timetable Arrangement</h1>
          </div>

          {/* Location selector */}
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground"
          >
            {locations.map((loc) => (
              <option key={loc.name} value={loc.name}>
                {LOCATION_TO_CODE[loc.name] || loc.name}
              </option>
            ))}
          </select>

          <div className="flex-1" />

          {/* Stats */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{totalIncomplete} incomplete</span>
            <span className="text-yellow-600 dark:text-yellow-400">{totalTentative} tentative</span>
            <span className="text-green-600 dark:text-green-400">{totalConfirmed} confirmed</span>
          </div>

          {/* Actions */}
          <button
            onClick={() => setDutyModalOpen(true)}
            disabled={!location}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Users2 className="h-3.5 w-3.5" />
            Tutor Duties
          </button>

          <button
            onClick={() => setAutoSuggestOpen(true)}
            disabled={!unassigned?.length || !slots?.length}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Auto-Suggest
          </button>

          <RefreshButton
            onClick={refreshAll}
            isRefreshing={slotsValidating}
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
            <div className="flex gap-4 flex-1 min-h-0 p-4">
              <div className="flex-1 min-w-0 overflow-auto">
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
                  />
                ) : activeTab === "calendar" ? (
                  <SummerSessionCalendar
                    configId={configId!}
                    location={location}
                    courseStartDate={activeConfig!.course_start_date}
                    courseEndDate={activeConfig!.course_end_date}
                    openDays={openDays}
                    timeSlots={timeSlots}
                    onDropStudent={handleDropStudentCalendar}
                    onRemoveSession={handleRemoveSessionFromCalendar}
                    onClickStudent={setSelectedAppId}
                    dragPrefs={dragPrefs}
                  />
                ) : (
                  <SummerStudentLessonsTable
                    configId={configId!}
                    location={location}
                    totalLessons={activeConfig!.total_lessons}
                    onClickStudent={setSelectedAppId}
                    onFindSlot={setFindSlotTarget}
                  />
                )}
              </div>
              {/* Desktop: always visible */}
              <div className="hidden md:flex">
                <SummerUnassignedPanel
                  applications={unassigned ?? []}
                  grades={grades}
                  loading={!unassigned && !!configId}
                  onClickStudent={setSelectedAppId}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  totalLessons={activeConfig?.total_lessons ?? 8}
                  onSuggestStudent={(id, name) => setSuggestForStudent({ id, name })}
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
                "fixed top-14 right-0 bottom-0 w-72 z-50 shadow-xl transition-transform duration-300 ease-out",
                mobilePanelOpen ? "translate-x-0" : "translate-x-full"
              )}>
                <SummerUnassignedPanel
                  className="w-full h-full rounded-none border-0 border-l"
                  hideCollapse
                  applications={unassigned ?? []}
                  grades={grades}
                  loading={!unassigned && !!configId}
                  onClickStudent={(id) => { setSelectedAppId(id); setMobilePanelOpen(false); }}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  totalLessons={activeConfig?.total_lessons ?? 8}
                  onSuggestStudent={(id, name) => { setSuggestForStudent({ id, name }); setMobilePanelOpen(false); }}
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
          application={selectedApp ?? null}
          isOpen={selectedAppId !== null}
          onClose={() => setSelectedAppId(null)}
          onUpdated={refreshAll}
          locations={locations}
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
              mutateSlots();
              mutateUnassigned();
              mutateCalendar();
              mutateStudentLessons();
              mutateFindSlot();
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
      </PageTransition>
    </DeskSurface>
  );
}
