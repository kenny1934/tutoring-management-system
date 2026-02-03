import { useState, useCallback } from "react";
import { calendarAPI } from "@/lib/api";

interface UseCalendarSyncOptions {
  initialFetchDaysBehind?: number;
  onSyncComplete?: () => void;
}

interface UseCalendarSyncResult {
  isSyncing: boolean;
  lastSyncMessage: string | null;
  fetchDaysBehind: number;
  handleManualSync: () => Promise<void>;
  handleLoadOlderMonth: (viewedMonth: Date) => Promise<void>;
}

/**
 * Hook to manage calendar sync state and operations.
 * Handles syncing with Google Calendar and loading older events.
 */
export function useCalendarSync({
  initialFetchDaysBehind = 60,
  onSyncComplete,
}: UseCalendarSyncOptions = {}): UseCalendarSyncResult {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);
  const [fetchDaysBehind, setFetchDaysBehind] = useState(initialFetchDaysBehind);

  const handleManualSync = useCallback(async () => {
    setIsSyncing(true);
    setLastSyncMessage(null);
    try {
      const result = await calendarAPI.sync(true, fetchDaysBehind);
      setLastSyncMessage(`Synced ${result.events_synced} events`);
      await onSyncComplete?.();
      setTimeout(() => setLastSyncMessage(null), 6000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setLastSyncMessage(`Sync failed: ${errorMsg}`);
      setTimeout(() => setLastSyncMessage(null), 10000);
    } finally {
      setIsSyncing(false);
    }
  }, [fetchDaysBehind, onSyncComplete]);

  const handleLoadOlderMonth = useCallback(async (viewedMonth: Date) => {
    setIsSyncing(true);
    setLastSyncMessage(null);
    try {
      // Calculate days_behind to cover the viewed month
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const viewMonthStart = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth(), 1);
      const daysBehind = Math.ceil((today.getTime() - viewMonthStart.getTime()) / (1000 * 60 * 60 * 24)) + 30;

      // Sync events from Google Calendar
      const result = await calendarAPI.sync(true, daysBehind);
      setLastSyncMessage(`Synced ${result.events_synced} events`);

      // Expand fetch range to include the viewed month
      setFetchDaysBehind(daysBehind);

      await onSyncComplete?.();
      setTimeout(() => setLastSyncMessage(null), 6000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setLastSyncMessage(`Sync failed: ${errorMsg}`);
      setTimeout(() => setLastSyncMessage(null), 10000);
    } finally {
      setIsSyncing(false);
    }
  }, [onSyncComplete]);

  return {
    isSyncing,
    lastSyncMessage,
    fetchDaysBehind,
    handleManualSync,
    handleLoadOlderMonth,
  };
}
