"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useCallback } from "react";

interface NavItem {
  key: string;
  label: string;
  shortcut: string;
  path: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: "d", label: "Dashboard", shortcut: "D", path: "/zen" },
  { key: "s", label: "Students", shortcut: "S", path: "/zen/students" },
  { key: "n", label: "Sessions", shortcut: "N", path: "/zen/sessions" },
  { key: "c", label: "Courseware", shortcut: "C", path: "/zen/courseware" },
  { key: "r", label: "Revenue", shortcut: "R", path: "/zen/revenue" },
];

export function ZenHeader() {
  const pathname = usePathname();
  const router = useRouter();

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

      // Don't trigger with modifiers
      if (event.ctrlKey || event.metaKey || event.altKey) {
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
  }, [handleNavigation]);

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
            [<span style={{ textDecoration: "underline" }}>{item.shortcut}</span>]
            {item.label.slice(1)}
          </button>
        ))}
      </nav>
    </header>
  );
}
