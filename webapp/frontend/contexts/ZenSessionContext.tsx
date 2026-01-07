"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useMemo,
} from "react";
import type { Session } from "@/types";
import { groupAndSortSessions, canBeMarked } from "@/components/zen/utils/sessionSorting";

interface ZenSessionContextType {
  // Session data
  sessions: Session[];
  setSessions: (sessions: Session[]) => void;
  flatSessions: Session[];

  // Date selection
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  getDateLabel: () => string;

  // Selection state
  selectedIds: Set<number>;
  toggleSelect: (id: number) => void;
  selectAll: () => void;
  selectActionable: () => void;
  clearSelection: () => void;
  isSelected: (id: number) => boolean;

  // Cursor state
  cursorIndex: number;
  moveCursor: (direction: "up" | "down" | number) => void;
  toggleCursorSelection: () => void;
  getCurrentSession: () => Session | undefined;

  // Actions
  getSelectedSessions: () => Session[];
  getActionableSessions: () => Session[];
}

const ZenSessionContext = createContext<ZenSessionContextType | undefined>(undefined);

// Helper to get today's date in local ISO format (YYYY-MM-DD)
const getToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// Helper to format date relative to today
const formatDateLabel = (dateStr: string): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateStr + "T00:00:00");
  const diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === -1) return "Yesterday";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays <= 7) return `In ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -7) return `${-diffDays} days ago`;

  // Format as date
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

export function ZenSessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [cursorIndex, setCursorIndex] = useState(0);
  const [selectedDate, setSelectedDateState] = useState(getToday);

  // Date handlers
  const setSelectedDate = useCallback((date: string) => {
    setSelectedDateState(date);
    // Clear selection when date changes
    setSelectedIds(new Set());
    setCursorIndex(0);
  }, []);

  const getDateLabel = useCallback(
    () => formatDateLabel(selectedDate),
    [selectedDate]
  );

  // Process sessions
  const { flatSessions } = useMemo(
    () => groupAndSortSessions(sessions),
    [sessions]
  );

  // Selection handlers
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(flatSessions.map((s) => s.id)));
  }, [flatSessions]);

  const selectActionable = useCallback(() => {
    const actionableIds = flatSessions
      .filter((s) => canBeMarked(s))
      .map((s) => s.id);
    setSelectedIds(new Set(actionableIds));
  }, [flatSessions]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (id: number) => selectedIds.has(id),
    [selectedIds]
  );

  // Cursor handlers
  const moveCursor = useCallback(
    (direction: "up" | "down" | number) => {
      if (typeof direction === "number") {
        setCursorIndex(Math.max(0, Math.min(direction, flatSessions.length - 1)));
      } else if (direction === "up") {
        setCursorIndex((prev) => Math.max(0, prev - 1));
      } else {
        setCursorIndex((prev) => Math.min(flatSessions.length - 1, prev + 1));
      }
    },
    [flatSessions.length]
  );

  const toggleCursorSelection = useCallback(() => {
    const session = flatSessions[cursorIndex];
    if (session && canBeMarked(session)) {
      toggleSelect(session.id);
    }
  }, [flatSessions, cursorIndex, toggleSelect]);

  const getCurrentSession = useCallback(
    () => flatSessions[cursorIndex],
    [flatSessions, cursorIndex]
  );

  // Getter helpers
  const getSelectedSessions = useCallback(
    () => flatSessions.filter((s) => selectedIds.has(s.id)),
    [flatSessions, selectedIds]
  );

  const getActionableSessions = useCallback(
    () => flatSessions.filter((s) => canBeMarked(s)),
    [flatSessions]
  );

  // Reset cursor when sessions change
  const handleSetSessions = useCallback((newSessions: Session[]) => {
    setSessions(newSessions);
    setCursorIndex(0);
    setSelectedIds(new Set());
  }, []);

  const value = useMemo(
    () => ({
      sessions,
      setSessions: handleSetSessions,
      flatSessions,
      selectedDate,
      setSelectedDate,
      getDateLabel,
      selectedIds,
      toggleSelect,
      selectAll,
      selectActionable,
      clearSelection,
      isSelected,
      cursorIndex,
      moveCursor,
      toggleCursorSelection,
      getCurrentSession,
      getSelectedSessions,
      getActionableSessions,
    }),
    [
      sessions,
      handleSetSessions,
      flatSessions,
      selectedDate,
      setSelectedDate,
      getDateLabel,
      selectedIds,
      toggleSelect,
      selectAll,
      selectActionable,
      clearSelection,
      isSelected,
      cursorIndex,
      moveCursor,
      toggleCursorSelection,
      getCurrentSession,
      getSelectedSessions,
      getActionableSessions,
    ]
  );

  return (
    <ZenSessionContext.Provider value={value}>
      {children}
    </ZenSessionContext.Provider>
  );
}

export function useZenSession() {
  const context = useContext(ZenSessionContext);
  if (context === undefined) {
    throw new Error("useZenSession must be used within a ZenSessionProvider");
  }
  return context;
}
