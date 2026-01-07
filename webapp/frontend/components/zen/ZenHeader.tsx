"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useCallback, useMemo, useState } from "react";
import { useCalendarEvents, useDashboardStats } from "@/lib/hooks";
import { useLocation } from "@/contexts/LocationContext";
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
  const [showNotifications, setShowNotifications] = useState(false);

  const { selectedLocation } = useLocation();

  // Fetch data for notifications (matching GUI NotificationBell logic)
  const { data: calendarEvents } = useCalendarEvents(7);
  const { data: stats } = useDashboardStats(
    selectedLocation === "All Locations" ? undefined : selectedLocation
  );

  // Count tests this week (7 days) - matches GUI logic
  const testsThisWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (calendarEvents || []).filter((event) => {
      const eventDate = new Date(event.start_date + "T00:00:00");
      const daysUntil = Math.ceil(
        (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysUntil >= 0 && daysUntil <= 7;
    }).length;
  }, [calendarEvents]);

  // Pending payments from stats
  const pendingPayments = stats?.pending_payment_enrollments ?? 0;

  // Calculate notification counts (matching GUI)
  const notifications = useMemo(() => {
    return {
      pendingPayments,
      testsThisWeek,
      total: pendingPayments + testsThisWeek,
    };
  }, [pendingPayments, testsThisWeek]);

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

  // Keyboard shortcuts for navigation and notifications
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

      // Handle ! for notifications (works with Shift since ! requires Shift)
      if (event.key === "!" || (event.shiftKey && event.key === "1")) {
        event.preventDefault();
        setShowNotifications((prev) => !prev);
        return;
      }

      // Handle Escape to close notifications
      if (event.key === "Escape" && showNotifications) {
        event.preventDefault();
        setShowNotifications(false);
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
  }, [handleNavigation, focusedSection, showNotifications]);

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
          position: "relative",
        }}
      >
        {/* Notification badge - clickable */}
        <button
          onClick={() => setShowNotifications((prev) => !prev)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: showNotifications ? "var(--zen-border)" : "none",
            border: "1px solid var(--zen-border)",
            padding: "4px 8px",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: "12px",
            color: notifications.total > 0 ? "var(--zen-warning)" : "var(--zen-dim)",
            textShadow: notifications.total > 0 ? "var(--zen-glow)" : "none",
          }}
          title="Toggle notifications (!)"
        >
          <span style={{ fontSize: "14px" }}>!</span>
          {notifications.total > 0 && (
            <span>{notifications.total}</span>
          )}
        </button>

        {/* Notification dropdown */}
        {showNotifications && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: "8px",
              backgroundColor: "var(--zen-bg)",
              border: "1px solid var(--zen-border)",
              minWidth: "320px",
              maxWidth: "400px",
              zIndex: 200,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "8px 12px",
                borderBottom: "1px solid var(--zen-border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: "bold", color: "var(--zen-fg)" }}>
                NOTIFICATIONS
              </span>
              <span style={{ color: "var(--zen-dim)", fontSize: "10px" }}>
                Esc to close
              </span>
            </div>

            {/* Content - matching GUI NotificationBell */}
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              {/* Overdue Payments */}
              {notifications.pendingPayments > 0 && (
                <button
                  onClick={() => {
                    router.push("/zen/students?status=pending");
                    setShowNotifications(false);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 12px",
                    background: "none",
                    border: "none",
                    borderBottom: "1px solid var(--zen-border)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <span style={{ color: "var(--zen-error)" }}>$</span>
                  <span style={{ flex: 1, color: "var(--zen-error)" }}>
                    Overdue Payments
                  </span>
                  <span
                    style={{
                      backgroundColor: "var(--zen-error)",
                      color: "var(--zen-bg)",
                      padding: "2px 6px",
                      fontSize: "11px",
                      fontWeight: "bold",
                    }}
                  >
                    {notifications.pendingPayments}
                  </span>
                  <span style={{ color: "var(--zen-dim)" }}>&gt;</span>
                </button>
              )}

              {/* Tests This Week */}
              {notifications.testsThisWeek > 0 && (
                <button
                  onClick={() => {
                    setShowNotifications(false);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 12px",
                    background: "none",
                    border: "none",
                    borderBottom: "1px solid var(--zen-border)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                  }}
                >
                  <span style={{ color: "var(--zen-warning)" }}>T</span>
                  <span style={{ flex: 1, color: "var(--zen-warning)" }}>
                    Tests This Week
                  </span>
                  <span
                    style={{
                      backgroundColor: "var(--zen-warning)",
                      color: "var(--zen-bg)",
                      padding: "2px 6px",
                      fontSize: "11px",
                      fontWeight: "bold",
                    }}
                  >
                    {notifications.testsThisWeek}
                  </span>
                  <span style={{ color: "var(--zen-dim)" }}>&gt;</span>
                </button>
              )}

              {/* Empty state */}
              {notifications.total === 0 && (
                <div
                  style={{
                    padding: "24px 12px",
                    textAlign: "center",
                    color: "var(--zen-dim)",
                  }}
                >
                  No notifications
                </div>
              )}
            </div>
          </div>
        )}

        {/* Help hint */}
        <span
          style={{
            color: "var(--zen-dim)",
            borderLeft: "1px solid var(--zen-border)",
            paddingLeft: "12px",
          }}
        >
          <span style={{ color: "var(--zen-fg)" }}>!</span>=alerts{" "}
          <span style={{ color: "var(--zen-fg)" }}>T</span>=tools{" "}
          <span style={{ color: "var(--zen-fg)" }}>P</span>=puzzle{" "}
          <span style={{ color: "var(--zen-fg)" }}>?</span>=help
        </span>
      </div>
    </header>
  );
}
