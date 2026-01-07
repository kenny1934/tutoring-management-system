"use client";

import { ReactNode } from "react";
import { useZen, type ZenTheme } from "@/contexts/ZenContext";

interface ZenGuardProps {
  children: ReactNode;
}

/**
 * ZenGuard protects /zen routes - shows access denied if zen mode not activated.
 * This preserves the easter egg mystery.
 */
export function ZenGuard({ children }: ZenGuardProps) {
  const { enabled, mounted, isExiting, effectiveTheme: theme, glowEnabled, glowIntensity } = useZen();

  // Calculate glow style
  const glowStyle = glowEnabled
    ? `0 0 ${theme.glow.intensity * glowIntensity * 10}px ${theme.glow.color}`
    : "none";

  // Wait for hydration
  if (!mounted) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: theme.colors.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            color: theme.colors.accent,
            fontFamily: `"${theme.font.family}", ${theme.font.fallback}`,
            animation: "pulse 1s infinite",
          }}
        >
          Loading...
        </div>
        <style jsx>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  // If exiting, show nothing (navigation in progress)
  if (isExiting) {
    return null;
  }

  // If zen mode is not enabled, show access denied
  if (!enabled) {
    return <ZenAccessDenied theme={theme} glowStyle={glowStyle} />;
  }

  return <>{children}</>;
}

function ZenAccessDenied({ theme, glowStyle }: { theme: ZenTheme; glowStyle: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: theme.colors.background,
        color: theme.colors.foreground,
        fontFamily: `"${theme.font.family}", ${theme.font.fallback}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "20px",
      }}
    >
      <div>
        <pre
          style={{
            color: theme.colors.accent,
            textShadow: glowStyle,
            fontSize: "12px",
            lineHeight: 1.4,
            marginBottom: "24px",
          }}
        >
{`╭─────────────────────────────────────╮
│                                     │
│   CSM PRO                           │
│   ───────                           │
│                                     │
│   ACCESS DENIED                     │
│                                     │
│   ████████████████████████████████  │
│                                     │
│   Looking for something?            │
│   Some secrets must be discovered.  │
│                                     │
│   ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  │
│                                     │
╰─────────────────────────────────────╯`}
        </pre>
        <p
          style={{
            color: theme.colors.dim,
            fontSize: "12px",
            marginTop: "24px",
          }}
        >
          Error code: 0x45A573R-3GG
        </p>
      </div>
    </div>
  );
}
