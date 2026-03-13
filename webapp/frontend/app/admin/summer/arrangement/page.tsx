"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/lib/hooks";
import { useToast } from "@/contexts/ToastContext";
import { Grid3X3, Wand2, CheckCheck } from "lucide-react";
import useSWR from "swr";
import { summerAPI } from "@/lib/api";
import { SummerArrangementGrid } from "@/components/admin/SummerArrangementGrid";
import { SummerUnassignedPanel } from "@/components/admin/SummerUnassignedPanel";
import { SummerAutoSuggestModal } from "@/components/admin/SummerAutoSuggestModal";
import { SummerApplicationDetailModal } from "@/components/admin/SummerApplicationDetailModal";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { LOCATION_TO_CODE } from "@/lib/summer-utils";
import type { SummerSlotUpdate, SummerApplication } from "@/types";

export default function SummerArrangementPage() {
  usePageTitle("Summer Arrangement");
  const { isAdmin, isSuperAdmin } = useAuth();
  const { showToast } = useToast();
  const canView = isAdmin || isSuperAdmin;

  const [configId, setConfigId] = useState<number | null>(null);
  const [location, setLocation] = useState<string>("");
  const [autoSuggestOpen, setAutoSuggestOpen] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
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

  const handleDropStudent = useCallback(async (applicationId: number, slotId: number) => {
    try {
      await summerAPI.createPlacement({ application_id: applicationId, slot_id: slotId });
      mutateSlots();
      mutateUnassigned();
    } catch (e: any) {
      showToast(e.message || "Failed to place student", "error");
    }
  }, [mutateSlots, mutateUnassigned, showToast]);

  const handleRemovePlacement = useCallback(async (placementId: number) => {
    try {
      await summerAPI.deletePlacement(placementId);
      mutateSlots();
      mutateUnassigned();
    } catch (e: any) {
      showToast(e.message || "Failed to remove placement", "error");
    }
  }, [mutateSlots, mutateUnassigned, showToast]);

  const handleBulkConfirm = useCallback(async () => {
    if (!configId) return;
    try {
      const result = await summerAPI.bulkConfirmPlacements(configId, location);
      showToast(`Confirmed ${result.confirmed} placements`, "success");
      mutateSlots();
    } catch (e: any) {
      showToast(e.message || "Failed to confirm", "error");
    }
  }, [configId, location, mutateSlots, showToast]);

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
    (sum, s) => sum + s.placements.filter((p) => p.placement_status === "Tentative").length,
    0
  ) ?? 0;
  const totalConfirmed = slots?.reduce(
    (sum, s) => sum + s.placements.filter((p) => p.placement_status === "Confirmed").length,
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
            onClick={() => setAutoSuggestOpen(true)}
            disabled={!unassigned?.length || !slots?.length}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Auto-Suggest
          </button>

          {totalTentative > 0 && (
            <button
              onClick={handleBulkConfirm}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50 transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Confirm All
            </button>
          )}

          <RefreshButton
            onClick={refreshAll}
            isRefreshing={slotsValidating}
          />
        </div>

        {/* Main content: grid + unassigned panel */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Loading configuration...
          </div>
        ) : (
          <div className="flex gap-4 flex-1 min-h-0">
            <div className="flex-1 min-w-0 overflow-auto">
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
                onRemovePlacement={handleRemovePlacement}
                onClickStudent={setSelectedAppId}
                onDropFailed={(reason) => showToast(reason, "error")}
                dragPrefs={dragPrefs}
              />
            </div>
            <SummerUnassignedPanel
              applications={unassigned ?? []}
              grades={grades}
              loading={!unassigned && !!configId}
              onClickStudent={setSelectedAppId}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
          </div>
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

        {/* Application detail modal */}
        <SummerApplicationDetailModal
          application={selectedApp ?? null}
          isOpen={selectedAppId !== null}
          onClose={() => setSelectedAppId(null)}
          onUpdated={refreshAll}
          locations={locations}
        />
      </PageTransition>
    </DeskSurface>
  );
}
