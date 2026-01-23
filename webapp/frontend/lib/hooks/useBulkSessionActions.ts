/**
 * Hook for managing bulk session actions (mark attended, no-show, reschedule, etc.)
 * Provides a unified handler with loading state management and toast notifications.
 */

import { useState, useCallback, useMemo } from 'react';
import { sessionsAPI } from '@/lib/api';
import { updateSessionInCache } from '@/lib/session-cache';
import { canBeMarked } from '@/components/zen/utils/sessionSorting';
import type { Session } from '@/types';

export type BulkActionType = 'attended' | 'no-show' | 'reschedule' | 'sick-leave' | 'weather-cancelled';

interface BulkActionConfig {
  apiCall: (sessionId: number) => Promise<Session>;
  loadingKey: BulkActionType;
  successMessage: (count: number) => string;
  errorLogMessage: string;
}

const ACTION_CONFIGS: Record<BulkActionType, BulkActionConfig> = {
  'attended': {
    apiCall: sessionsAPI.markAttended,
    loadingKey: 'attended',
    successMessage: (count) => `${count} session${count !== 1 ? 's' : ''} marked as attended`,
    errorLogMessage: 'attended',
  },
  'no-show': {
    apiCall: sessionsAPI.markNoShow,
    loadingKey: 'no-show',
    successMessage: (count) => `${count} session${count !== 1 ? 's' : ''} marked as no show`,
    errorLogMessage: 'no show',
  },
  'reschedule': {
    apiCall: sessionsAPI.markRescheduled,
    loadingKey: 'reschedule',
    successMessage: (count) => `${count} session${count !== 1 ? 's' : ''} marked as rescheduled`,
    errorLogMessage: 'rescheduled',
  },
  'sick-leave': {
    apiCall: sessionsAPI.markSickLeave,
    loadingKey: 'sick-leave',
    successMessage: (count) => `${count} session${count !== 1 ? 's' : ''} marked as sick leave`,
    errorLogMessage: 'sick leave',
  },
  'weather-cancelled': {
    apiCall: sessionsAPI.markWeatherCancelled,
    loadingKey: 'weather-cancelled',
    successMessage: (count) => `${count} session${count !== 1 ? 's' : ''} marked as weather cancelled`,
    errorLogMessage: 'weather cancelled',
  },
};

interface UseBulkSessionActionsOptions {
  sessions: Session[];
  selectedIds: Set<number>;
  clearSelection: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function useBulkSessionActions({
  sessions,
  selectedIds,
  clearSelection,
  showToast,
}: UseBulkSessionActionsOptions) {
  const [bulkActionLoading, setBulkActionLoading] = useState<BulkActionType | null>(null);
  const [loadingSessionActions, setLoadingSessionActions] = useState<Map<number, string>>(new Map());

  // Compute selected sessions from IDs
  const selectedSessions = useMemo(
    () => sessions.filter(s => selectedIds.has(s.id)),
    [sessions, selectedIds]
  );

  // Compute which bulk actions are available
  const bulkActionsAvailable = useMemo(() => ({
    attended: selectedSessions.length > 0 && selectedSessions.every(canBeMarked),
    noShow: selectedSessions.length > 0 && selectedSessions.every(canBeMarked),
    reschedule: selectedSessions.length > 0 && selectedSessions.every(canBeMarked),
    sickLeave: selectedSessions.length > 0 && selectedSessions.every(canBeMarked),
    weatherCancelled: selectedSessions.length > 0 && selectedSessions.every(canBeMarked),
  }), [selectedSessions]);

  // Unified bulk action handler
  const handleBulkAction = useCallback(async (actionType: BulkActionType) => {
    if (selectedSessions.length === 0) return;

    const config = ACTION_CONFIGS[actionType];
    setBulkActionLoading(config.loadingKey);

    // For actions that need filtering (reschedule, sick-leave, weather-cancelled)
    const sessionsToProcess = ['reschedule', 'sick-leave', 'weather-cancelled'].includes(actionType)
      ? selectedSessions.filter(canBeMarked)
      : selectedSessions;

    // Set loading state for all affected sessions
    setLoadingSessionActions(prev => {
      const next = new Map(prev);
      for (const s of sessionsToProcess) {
        next.set(s.id, config.loadingKey);
      }
      return next;
    });

    let successCount = 0;
    let failCount = 0;

    for (const session of sessionsToProcess) {
      try {
        const updatedSession = await config.apiCall(session.id);
        updateSessionInCache(updatedSession);
        successCount++;
      } catch (error) {
        console.error(`Failed to mark session ${session.id} as ${config.errorLogMessage}:`, error);
        failCount++;
      }
      // Clear individual session loading state
      setLoadingSessionActions(prev => {
        const next = new Map(prev);
        next.delete(session.id);
        return next;
      });
    }

    setBulkActionLoading(null);
    clearSelection();

    if (failCount === 0) {
      showToast(config.successMessage(successCount), 'success');
    } else {
      showToast(`${successCount} succeeded, ${failCount} failed`, failCount > successCount ? 'error' : 'info');
    }
  }, [selectedSessions, clearSelection, showToast]);

  // Handler for individual action buttons to update loading state
  const handleActionLoadingChange = useCallback((sessionId: number, isLoading: boolean, actionId?: string) => {
    setLoadingSessionActions(prev => {
      const next = new Map(prev);
      if (isLoading && actionId) {
        next.set(sessionId, actionId);
      } else {
        next.delete(sessionId);
      }
      return next;
    });
  }, []);

  return {
    bulkActionLoading,
    loadingSessionActions,
    selectedSessions,
    bulkActionsAvailable,
    handleBulkAction,
    handleActionLoadingChange,
  };
}
