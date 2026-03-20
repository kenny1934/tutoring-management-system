"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { Grid3X3, CalendarDays, Wand2, Users2, Users } from "lucide-react";
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
import { RefreshButton } from "@/components/ui/RefreshButton";
import { LOCATION_TO_CODE, DAY_ABBREV } from "@/lib/summer-utils";
import type { SummerSlotUpdate, SummerApplication, AvailableTutor } from "@/types";

export default function SummerArrangementPage() {
  usePageTitle("Summer Arrangement");
  const { isAdmin, isSuperAdmin } = useAuth();
  const { showToast } = useToast();
  const canView = isAdmin || isSuperAdmin;

  const { mutate: globalMutate } = useSWRConfig();
  const [activeTab, setActiveTab] = useState<"slots" | "calendar">("slots");
  const [configId, setConfigId] = useState<number | null>(null);
  const [location, setLocation] = useState<string>("");
  const [autoSuggestOpen, setAutoSuggestOpen] = useState(false);
  const [dutyModalOpen, setDutyModalOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{ appId: number; slotId: number } | null>(null);
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

  // Handlers
  const refreshAll = useCallback(() => {
    mutateSlots();
    mutateDemand();
    mutateUnassigned();
  }, [mutateSlots, mutateDemand, mutateUnassigned]);

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

  const handleDeleteSlot = useCallback(async (slotId: number) => {
    try {
      await summerAPI.deleteSlot(slotId);
      mutateSlots();
    } catch (e: any) {
      showToast(e.message || "Failed to delete slot", "error");
    }
  }, [mutateSlots, showToast]);

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
      globalMutate((key) => Array.isArray(key) && key[0] === "summer-calendar");
      if (mode === "single") {
        showToast("Lessons ready — switch to Calendar to place individually", "success");
      }
    } catch (e: any) {
      showToast(e.message || "Failed to place student", "error");
    }
  }, [pendingDrop, mutateSlots, mutateUnassigned, globalMutate, showToast]);

  // Calendar drop → single session for a specific lesson
  const handleDropStudentCalendar = useCallback(async (applicationId: number, slotId: number, lessonId: number) => {
    try {
      await summerAPI.createSession({ application_id: applicationId, slot_id: slotId, lesson_id: lessonId });
      mutateSlots();
      mutateUnassigned();
      globalMutate((key) => Array.isArray(key) && key[0] === "summer-calendar");
    } catch (e: any) {
      showToast(e.message || "Failed to place student", "error");
    }
  }, [mutateSlots, mutateUnassigned, globalMutate, showToast]);

  const handleRemoveSession = useCallback(async (sessionId: number) => {
    try {
      await summerAPI.deleteSession(sessionId);
      mutateSlots();
      mutateUnassigned();
      globalMutate((key) => Array.isArray(key) && key[0] === "summer-calendar");
    } catch (e: any) {
      showToast(e.message || "Failed to remove session", "error");
    }
  }, [mutateSlots, mutateUnassigned, globalMutate, showToast]);


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
  const totalUnassigned = unassigned?.length ?? 0;
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
      <PageTransition className="flex flex-col h-full p-4 sm:p-6 gap-4">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
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
            <span>{totalUnassigned} unassigned</span>
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
        <div className="flex items-center gap-1 border-b border-border -mb-2">
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
        </div>

        {/* Main content: grid/calendar + unassigned panel */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Loading configuration...
          </div>
        ) : (
          <>
            <div className="flex gap-4 flex-1 min-h-0">
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
                ) : (
                  <SummerSessionCalendar
                    configId={configId!}
                    location={location}
                    courseStartDate={activeConfig!.course_start_date}
                    courseEndDate={activeConfig!.course_end_date}
                    openDays={openDays}
                    timeSlots={timeSlots}
                    onDropStudent={handleDropStudentCalendar}
                    onRemoveSession={handleRemoveSession}
                    onClickStudent={setSelectedAppId}
                    dragPrefs={dragPrefs}
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
                />
              </div>
            </div>

            {/* Mobile: floating toggle button */}
            <button
              className="md:hidden fixed bottom-4 right-4 z-40 rounded-full bg-primary text-primary-foreground p-3 shadow-lg"
              onClick={() => setMobilePanelOpen(true)}
            >
              <Users className="h-5 w-5" />
              {totalUnassigned > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                  {totalUnassigned}
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
                />
              </div>
            </div>
          </>
        )}

        {/* Auto-suggest modal */}
        {autoSuggestOpen && configId && (
          <SummerAutoSuggestModal
            isOpen={autoSuggestOpen}
            onClose={() => setAutoSuggestOpen(false)}
            configId={configId}
            location={location}
            onAccepted={refreshAll}
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
      </PageTransition>
    </DeskSurface>
  );
}
