"use client";

import { ReactNode } from "react";
import { useZen } from "@/contexts/ZenContext";

interface ZenGuardProps {
  children: ReactNode;
}

/**
 * ZenGuard protects /zen routes - shows access denied if zen mode not activated.
 * This preserves the easter egg mystery.
 */
export function ZenGuard({ children }: ZenGuardProps) {
  const { enabled, mounted } = useZen();

  // Wait for hydration
  if (!mounted) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "#0a0a0a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            color: "#00ff00",
            fontFamily: "monospace",
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

  // If zen mode is not enabled, show access denied
  if (!enabled) {
    return <ZenAccessDenied />;
  }

  return <>{children}</>;
}

function ZenAccessDenied() {
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0a0a0a",
        color: "#00ff00",
        fontFamily: '"IBM Plex Mono", "JetBrains Mono", monospace',
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
            color: "#00ff00",
            textShadow: "0 0 10px #00ff00",
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
            color: "#004400",
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
