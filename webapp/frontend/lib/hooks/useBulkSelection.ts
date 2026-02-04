/**
 * Hook for managing bulk selection state.
 * Provides toggle, select all, and clear functionality for lists of items.
 */

import { useState, useCallback, useMemo } from 'react';

export function useBulkSelection(allIds: number[]) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === allIds.length) {
        return new Set();
      }
      return new Set(allIds);
    });
  }, [allIds]);

  const selectIds = useCallback((ids: number[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const hasSelection = selectedIds.size > 0;
  const isAllSelected = selectedIds.size === allIds.length && allIds.length > 0;

  return {
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    selectIds,
    clearSelection,
    hasSelection,
    isAllSelected,
  };
}
