"use client";

import { ReactNode, useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useZen } from "@/contexts/ZenContext";
import { useZenSession } from "@/contexts/ZenSessionContext";
import {
  ZenKeyboardFocusProvider,
  useZenKeyboardFocus,
  getNextSection,
  getPrevSection,
} from "@/contexts/ZenKeyboardFocusContext";
import { ZenHeader } from "./ZenHeader";
import { ZenStatusBar, setZenStatus } from "./ZenStatusBar";
import { ZenCommandBar } from "./ZenCommandBar";
import { ZenHelpOverlay } from "./ZenHelpOverlay";

interface ZenLayoutProps {
  children: ReactNode;
}

export function ZenLayout({ children }: ZenLayoutProps) {
  return (
    <ZenKeyboardFocusProvider defaultSection="sessions">
      <ZenLayoutInner>{children}</ZenLayoutInner>
    </ZenKeyboardFocusProvider>
  );
}

function ZenLayoutInner({ children }: ZenLayoutProps) {
  const { theme, glowEnabled, glowIntensity } = useZen();
  const { moveCursor, flatSessions } = useZenSession();
  const { focusedSection, setFocusedSection } = useZenKeyboardFocus();
  const router = useRouter();
  const pathname = usePathname();
  const [gPending, setGPending] = useState(false); // For vim-style gg
  const [showHelp, setShowHelp] = useState(false);

  // Apply theme CSS variables
  useEffect(() => {
    const root = document.documentElement;
    const { colors, glow, font } = theme;

    // Set CSS custom properties for the theme
    root.style.setProperty("--zen-bg", colors.background);
    root.style.setProperty("--zen-fg", colors.foreground);
    root.style.setProperty("--zen-dim", colors.dim);
    root.style.setProperty("--zen-accent", colors.accent);
    root.style.setProperty("--zen-cursor", colors.cursor);
    root.style.setProperty("--zen-success", colors.success);
    root.style.setProperty("--zen-error", colors.error);
    root.style.setProperty("--zen-warning", colors.warning);
    root.style.setProperty("--zen-border", colors.border);
    root.style.setProperty("--zen-font", `"${font.family}", ${font.fallback}`);

    // Glow effect
    const glowValue = glowEnabled
      ? `0 0 ${glow.intensity * glowIntensity * 10}px ${glow.color}`
      : "none";
    root.style.setProperty("--zen-glow", glowValue);

    return () => {
      // Clean up on unmount
      root.style.removeProperty("--zen-bg");
      root.style.removeProperty("--zen-fg");
      root.style.removeProperty("--zen-dim");
      root.style.removeProperty("--zen-accent");
      root.style.removeProperty("--zen-cursor");
      root.style.removeProperty("--zen-success");
      root.style.removeProperty("--zen-error");
      root.style.removeProperty("--zen-warning");
      root.style.removeProperty("--zen-border");
      root.style.removeProperty("--zen-font");
      root.style.removeProperty("--zen-glow");
    };
  }, [theme, glowEnabled, glowIntensity]);

  // Global keyboard shortcuts
  useEffect(() => {
    let gTimeout: NodeJS.Timeout | null = null;

    // HANDLER 1: Scroll prevention only (capture phase - runs FIRST)
    // This prevents arrow keys and space from scrolling the page
    const scrollPreventHandler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      const scrollPreventKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "];
      if (scrollPreventKeys.includes(e.key) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
      }
      // DO NOT stopImmediatePropagation - let other handlers run
    };

    // HANDLER 2: Main navigation (bubbling phase - can be blocked by stopImmediatePropagation)
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Skip Shift+C specifically - handled by page.tsx for calendar toggle
      // (Don't skip all Shift+letters because we need Shift+G for "go to last")
      if ((e.key === "C" || e.key === "c") && e.shiftKey) {
        return;
      }

      // Navigation shortcuts - skip when detail view is focused
      // This allows ZenSessionDetail to handle 'c', 'h', 'e', etc.
      if (focusedSection === "detail") {
        // Still handle non-conflicting keys like ? for help
        if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          setShowHelp(true);
        }
        return;
      }

      const navRoutes: Record<string, string> = {
        s: "/zen/students",
        n: "/zen/sessions",
        c: "/zen/courseware",
        r: "/zen/revenue",
        d: "/zen",
      };

      // Handle vim-style gg (go to first)
      if (e.key === "g" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (gPending) {
          // Second g - go to first session
          e.preventDefault();
          moveCursor(0);
          setGPending(false);
          if (gTimeout) clearTimeout(gTimeout);
          return;
        } else {
          // First g - wait for second
          setGPending(true);
          gTimeout = setTimeout(() => setGPending(false), 500);
          return;
        }
      }

      // Cancel g pending on any other key
      if (gPending) {
        setGPending(false);
        if (gTimeout) clearTimeout(gTimeout);
      }

      // G (shift+g) - go to last session
      if (e.key === "G" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (flatSessions.length > 0) {
          moveCursor(flatSessions.length - 1);
        }
        return;
      }

      // Home - go to first session
      if (e.key === "Home") {
        e.preventDefault();
        moveCursor(0);
        return;
      }

      // End - go to last session
      if (e.key === "End") {
        e.preventDefault();
        if (flatSessions.length > 0) {
          moveCursor(flatSessions.length - 1);
        }
        return;
      }

      // Navigation keys (s, n, c, r, d) - exclude Shift to allow Shift+C for calendar
      if (navRoutes[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        const route = navRoutes[e.key];
        if (pathname !== route) {
          router.push(route);
          const pageName = route.split("/").pop() || "dashboard";
          setZenStatus(`→ ${pageName}`, "info");
        }
        return;
      }

      // ? - Show help overlay
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowHelp(true);
        return;
      }

      // Tab - cycle focus between sections
      // Note: When focusedSection === "detail", we return early at line 95-102,
      // so Tab is not intercepted and ZenExerciseAssign can handle it internally
      if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const nextSection = e.shiftKey
          ? getPrevSection(focusedSection)
          : getNextSection(focusedSection);
        setFocusedSection(nextSection);
        setZenStatus(`Focus: ${nextSection}`, "info");
        return;
      }
    };

    // Register scroll prevention in CAPTURE phase (runs first, prevents scroll)
    window.addEventListener("keydown", scrollPreventHandler, { capture: true });
    // Register main handler in BUBBLING phase (can be blocked by stopImmediatePropagation)
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", scrollPreventHandler, { capture: true });
      window.removeEventListener("keydown", handleKeyDown);
      if (gTimeout) clearTimeout(gTimeout);
    };
  }, [pathname, router, moveCursor, flatSessions.length, gPending, focusedSection, setFocusedSection]);

  return (
    <div
      className="zen-layout"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--zen-bg)",
        color: "var(--zen-fg)",
        fontFamily: "var(--zen-font)",
        fontSize: "14px",
        lineHeight: "1.5",
      }}
    >
      <ZenHeader />
      <main
        className="zen-main"
        style={{
          flex: 1,
          overflow: "auto",
          padding: "16px",
          paddingBottom: "80px", // Space for fixed bottom bar
        }}
      >
        {children}
      </main>

      {/* Fixed bottom bar container */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: "var(--zen-bg)",
          borderTop: "1px solid var(--zen-border)",
          zIndex: 100,
        }}
      >
        <ZenStatusBar />
        <ZenCommandBar />
      </div>

      {/* Help overlay */}
      {showHelp && <ZenHelpOverlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}
