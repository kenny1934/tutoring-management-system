/**
 * Generic selection management hooks.
 * Used by courseware page tabs and folder-tree-modal for multi-select functionality.
 */

import { useState, useCallback } from 'react';

/**
 * Generic hook for managing Map-based selections.
 * Handles toggle, clear, selectAll, and remove operations.
 *
 * @template K - Key type (string for paths, number for IDs)
 * @template V - Value type (the selected item data)
 */
export function useMapSelection<K, V>() {
  const [selections, setSelections] = useState<Map<K, V>>(new Map());

  // Toggle selection: add if missing, remove if present
  const toggle = useCallback((key: K, value: V) => {
    setSelections(prev => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    });
  }, []);

  // Add or update a selection
  const set = useCallback((key: K, value: V) => {
    setSelections(prev => new Map(prev).set(key, value));
  }, []);

  // Update an existing selection (no-op if not present)
  const update = useCallback((key: K, updater: (value: V) => V) => {
    setSelections(prev => {
      const existing = prev.get(key);
      if (existing === undefined) return prev;
      const next = new Map(prev);
      next.set(key, updater(existing));
      return next;
    });
  }, []);

  // Remove a single selection
  const remove = useCallback((key: K) => {
    setSelections(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // Clear all selections
  const clear = useCallback(() => {
    setSelections(new Map());
  }, []);

  // Select all items from an array
  const selectAll = useCallback((items: V[], getKey: (item: V) => K) => {
    setSelections(new Map(items.map(item => [getKey(item), item])));
  }, []);

  // Check if a key is selected
  const has = useCallback((key: K) => selections.has(key), [selections]);

  // Get a selection by key
  const get = useCallback((key: K) => selections.get(key), [selections]);

  return {
    selections,
    setSelections,
    toggle,
    set,
    update,
    remove,
    clear,
    selectAll,
    has,
    get,
    size: selections.size,
    isEmpty: selections.size === 0,
    values: Array.from(selections.values()),
    keys: Array.from(selections.keys()),
    entries: Array.from(selections.entries()),
  };
}

/**
 * Selection state for search tab documents.
 */
export interface DocSelection {
  path: string;
  title: string;
}
