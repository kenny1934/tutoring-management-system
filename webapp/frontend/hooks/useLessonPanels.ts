"use client";

import { useCallback, useState } from "react";

/**
 * The three things both lesson views open over the lesson, from the header or
 * a key: Wolfram, the print-all menu and the shortcut help. Escape closes them
 * in that order, so each view hands `keyState` and `keyHandlers` straight to
 * useLessonKeys, and the two views can't wire them differently.
 */
export function useLessonPanels() {
  const [wolframOpen, setWolframOpen] = useState(false);
  const [printMenuOpen, setPrintMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const toggleWolfram = useCallback(() => setWolframOpen((open) => !open), []);
  const closeWolfram = useCallback(() => setWolframOpen(false), []);
  const closePrintMenu = useCallback(() => setPrintMenuOpen(false), []);
  const toggleHelp = useCallback(() => setHelpOpen((open) => !open), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  return {
    wolframOpen,
    toggleWolfram,
    closeWolfram,
    printMenuOpen,
    setPrintMenuOpen,
    helpOpen,
    toggleHelp,
    closeHelp,
    /** Which of them are open, for the key table. */
    keyState: { wolframOpen, printMenuOpen, helpOpen },
    /** The keys that open and close them. */
    keyHandlers: { toggleWolfram, closeWolfram, closePrintMenu, toggleHelp, closeHelp },
  };
}
