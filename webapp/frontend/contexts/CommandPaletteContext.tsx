"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode, type RefObject } from "react";

import { rememberScroll, type ScrollPlace } from "@/components/material/materialJourney";

export type SearchOrigin = { token: string; url: string; source: HTMLElement | null; anchor: DOMRect | null; scroll: ScrollPlace[] };
let sequence = 0;

interface CommandPaletteContextType {
  isOpen: boolean;
  open: (source?: HTMLElement) => void;
  origin: RefObject<SearchOrigin | null>;
  close: () => void;
  toggle: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextType | undefined>(undefined);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const origin = useRef<SearchOrigin | null>(null);
  const openNow = useRef(false);
  const open = useCallback((source?: HTMLElement) => {
    const focused = source ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null);
    const token = `${Date.now()}:${++sequence}`;
    origin.current = { token, url: window.location.href, source: focused, anchor: source?.getBoundingClientRect() ?? null, scroll: focused ? rememberScroll(focused) : [] };
    window.history.replaceState({ ...window.history.state, csmSearchReturn: token }, "");
    openNow.current = true; setIsOpen(true);
  }, []);
  const close = useCallback(() => { openNow.current = false; setIsOpen(false); }, []);
  const toggle = useCallback(() => { if (openNow.current) close(); else open(); }, [open, close]);

  // Global keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip in Zen mode - Ctrl+J/K is used for exercise row navigation there
      if (
        typeof window !== "undefined" &&
        (window.location.pathname.startsWith("/zen") ||
          window.location.pathname.startsWith("/summer") ||
          document.querySelector(".zen-layout"))
      ) {
        return;
      }

      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggle();
      }

    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggle]);

  const contextValue = useMemo(() => ({
    isOpen, open, close, toggle, origin,
  }), [isOpen, open, close, toggle, origin]);

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette() {
  const context = useContext(CommandPaletteContext);
  if (context === undefined) {
    throw new Error("useCommandPalette must be used within a CommandPaletteProvider");
  }
  return context;
}
