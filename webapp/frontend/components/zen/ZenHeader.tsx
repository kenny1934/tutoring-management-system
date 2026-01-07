"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useCallback, useMemo } from "react";
import { useCalendarEvents, useActivityFeed } from "@/lib/hooks";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";

interface NavItem {
  key: string;
  label: string;
  shortcut: string;
  path: string;
  /** Index of the character to wrap in brackets (default: 0) */
  bracketIndex?: number;
}

const NAV_ITEMS: NavItem[] = [
  { key: "d", label: "Dashboard", shortcut: "D", path: "/zen" },
  { key: "s", label: "Students", shortcut: "S", path: "/zen/students" },
  { key: "n", label: "Sessions", shortcut: "n", path: "/zen/sessions", bracketIndex: 6 },
  { key: "c", label: "Courseware", shortcut: "C", path: "/zen/courseware" },
  { key: "r", label: "Revenue", shortcut: "R", path: "/zen/revenue" },
];

/**
 * Render nav label with bracket around the shortcut character
 */
function renderNavLabel(item: NavItem) {
  const idx = item.bracketIndex ?? 0;
  const before = item.label.slice(0, idx);
  const char = item.label[idx];
  const after = item.label.slice(idx + 1);

  return (
    <>
      {before}[<span style={{ textDecoration: "underline" }}>{char}</span>]{after}
    </>
  );
}

export function ZenHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { focusedSection } = useZenKeyboardFocus();

  // Fetch data for notifications
  const { data: calendarEvents } = useCalendarEvents(7); // Tests in next 7 days
  const { data: activityEvents } = useActivityFeed();

  // Calculate notification counts
  const notifications = useMemo(() => {
    // Count urgent tests (within 3 days)
    const urgentTests = (calendarEvents || []).filter((event) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const eventDate = new Date(event.start_date);
      const diffDays = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 3;
    }).length;

    // Count recent important activity (last 24 hours)
    const recentActivity = (activityEvents || []).filter((event) => {
      const now = new Date();
      const eventTime = new Date(event.timestamp);
      const diffHours = (now.getTime() - eventTime.getTime()) / (1000 * 60 * 60);
      return diffHours <= 24;
    }).length;

    return { urgentTests, recentActivity };
  }, [calendarEvents, activityEvents]);

  const isActive = (path: string) => {
    if (path === "/zen") {
      return pathname === "/zen" || pathname === "/zen/dashboard";
    }
    return pathname.startsWith(path);
  };

  const handleNavigation = useCallback(
    (path: string) => {
      router.push(path);
    },
    [router]
  );

  // Keyboard shortcuts for navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger when typing in inputs or command bar
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        target.closest(".zen-command-bar")
      ) {
        return;
      }

      // Don't trigger with modifiers (including Shift for Shift+C calendar toggle)
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return;
      }

      // Skip navigation shortcuts when detail view is focused
      // This allows ZenSessionDetail to handle 'c', 'h', 'e', etc.
      if (focusedSection === "detail") {
        return;
      }

      const key = event.key.toLowerCase();
      const navItem = NAV_ITEMS.find((item) => item.key === key);

      if (navItem) {
        event.preventDefault();
        handleNavigation(navItem.path);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNavigation, focusedSection]);

  return (
    <header
      className="zen-header"
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 16px",
        borderBottom: "1px solid var(--zen-border)",
        backgroundColor: "var(--zen-bg)",
        gap: "16px",
        flexWrap: "wrap",
      }}
    >
      {/* Logo */}
      <div
        style={{
          fontWeight: "bold",
          color: "var(--zen-accent)",
          textShadow: "var(--zen-glow)",
          marginRight: "16px",
          whiteSpace: "nowrap",
        }}
      >
        CSM PRO
      </div>

      {/* Navigation */}
      <nav
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => handleNavigation(item.path)}
            style={{
              background: isActive(item.path)
                ? "var(--zen-accent)"
                : "transparent",
              color: isActive(item.path) ? "var(--zen-bg)" : "var(--zen-fg)",
              border: "1px solid var(--zen-border)",
              padding: "4px 12px",
              fontFamily: "inherit",
              fontSize: "13px",
              cursor: "pointer",
              textShadow: isActive(item.path) ? "none" : "var(--zen-glow)",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!isActive(item.path)) {
                e.currentTarget.style.borderColor = "var(--zen-accent)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive(item.path)) {
                e.currentTarget.style.borderColor = "var(--zen-border)";
              }
            }}
          >
            {renderNavLabel(item)}
          </button>
        ))}
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Notifications */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "center",
          fontSize: "12px",
        }}
      >
        {notifications.urgentTests > 0 && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              color: "var(--zen-warning)",
              textShadow: "var(--zen-glow)",
            }}
            title={`${notifications.urgentTests} test(s) within 3 days`}
          >
            <span style={{ fontSize: "14px" }}>!</span>
            <span>{notifications.urgentTests} test{notifications.urgentTests !== 1 ? "s" : ""}</span>
          </span>
        )}
        {notifications.recentActivity > 0 && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              color: "var(--zen-dim)",
            }}
            title={`${notifications.recentActivity} event(s) in last 24h`}
          >
            <span style={{ fontSize: "10px" }}>*</span>
            <span>{notifications.recentActivity}</span>
          </span>
        )}

        {/* Help hint */}
        <span
          style={{
            color: "var(--zen-dim)",
            borderLeft: "1px solid var(--zen-border)",
            paddingLeft: "12px",
          }}
        >
          Press <span style={{ color: "var(--zen-fg)" }}>?</span> for help
        </span>
      </div>
    </header>
  );
}
