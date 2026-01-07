"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

/**
 * Focus sections in Zen mode
 * - sessions: Today's sessions list
 * - tests: Upcoming tests list
 * - command: Command bar input
 * - detail: Expanded detail view
 */
export type ZenFocusSection = "sessions" | "tests" | "command" | "detail" | null;

interface ZenKeyboardFocusContextType {
  focusedSection: ZenFocusSection;
  setFocusedSection: (section: ZenFocusSection) => void;
  isFocused: (section: ZenFocusSection) => boolean;
}

const ZenKeyboardFocusContext = createContext<ZenKeyboardFocusContextType | null>(null);

interface ZenKeyboardFocusProviderProps {
  children: ReactNode;
  defaultSection?: ZenFocusSection;
}

export function ZenKeyboardFocusProvider({
  children,
  defaultSection = "sessions",
}: ZenKeyboardFocusProviderProps) {
  const [focusedSection, setFocusedSectionState] = useState<ZenFocusSection>(defaultSection);

  const setFocusedSection = useCallback((section: ZenFocusSection) => {
    setFocusedSectionState(section);
  }, []);

  const isFocused = useCallback(
    (section: ZenFocusSection) => focusedSection === section,
    [focusedSection]
  );

  return (
    <ZenKeyboardFocusContext.Provider
      value={{
        focusedSection,
        setFocusedSection,
        isFocused,
      }}
    >
      {children}
    </ZenKeyboardFocusContext.Provider>
  );
}

export function useZenKeyboardFocus() {
  const context = useContext(ZenKeyboardFocusContext);
  if (!context) {
    throw new Error(
      "useZenKeyboardFocus must be used within a ZenKeyboardFocusProvider"
    );
  }
  return context;
}

/**
 * Get all navigable sections in order for Tab cycling
 */
export const NAVIGABLE_SECTIONS: ZenFocusSection[] = ["sessions", "tests", "command"];

/**
 * Get the next section in the cycle
 */
export function getNextSection(current: ZenFocusSection): ZenFocusSection {
  const currentIndex = NAVIGABLE_SECTIONS.indexOf(current);
  if (currentIndex === -1) return NAVIGABLE_SECTIONS[0];
  return NAVIGABLE_SECTIONS[(currentIndex + 1) % NAVIGABLE_SECTIONS.length];
}

/**
 * Get the previous section in the cycle
 */
export function getPrevSection(current: ZenFocusSection): ZenFocusSection {
  const currentIndex = NAVIGABLE_SECTIONS.indexOf(current);
  if (currentIndex === -1) return NAVIGABLE_SECTIONS[NAVIGABLE_SECTIONS.length - 1];
  return NAVIGABLE_SECTIONS[
    (currentIndex - 1 + NAVIGABLE_SECTIONS.length) % NAVIGABLE_SECTIONS.length
  ];
}
