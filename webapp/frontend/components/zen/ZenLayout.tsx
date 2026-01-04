"use client";

import { ReactNode, useEffect } from "react";
import { useZen } from "@/contexts/ZenContext";
import { ZenHeader } from "./ZenHeader";
import { ZenStatusBar } from "./ZenStatusBar";
import { ZenCommandBar } from "./ZenCommandBar";

interface ZenLayoutProps {
  children: ReactNode;
}

export function ZenLayout({ children }: ZenLayoutProps) {
  const { theme, glowEnabled, glowIntensity } = useZen();

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
        }}
      >
        {children}
      </main>
      <ZenStatusBar />
      <ZenCommandBar />
    </div>
  );
}
