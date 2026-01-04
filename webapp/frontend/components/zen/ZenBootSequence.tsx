"use client";

import { useState, useEffect } from "react";

interface ZenBootSequenceProps {
  onComplete: () => void;
  mode: "enter" | "exit";
}

const BOOT_LINES = [
  { text: "Initializing terminal mode...", delay: 0 },
  { text: "Loading preferences... done", delay: 400 },
  { text: "Mounting data... done", delay: 800 },
  { text: "Starting session...", delay: 1200 },
  { text: "", delay: 1600 },
];

const EXIT_LINES = [
  { text: "Saving preferences...", delay: 0 },
  { text: "Closing terminal session...", delay: 400 },
  { text: "Initializing GUI mode...", delay: 800 },
  { text: "", delay: 1200 },
];

const ASCII_LOGO = `
    ██████╗███████╗███╗   ███╗
   ██╔════╝██╔════╝████╗ ████║
   ██║     ███████╗██╔████╔██║
   ██║     ╚════██║██║╚██╔╝██║
   ╚██████╗███████║██║ ╚═╝ ██║
    ╚═════╝╚══════╝╚═╝     ╚═╝  PRO
                            ───
`;

const WELCOME_TEXT = "Welcome to CSM Pro Zen Mode v1.0";
const HELP_TEXT = "Type 'help' to get started.";

export function ZenBootSequence({ onComplete, mode }: ZenBootSequenceProps) {
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [showLogo, setShowLogo] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const lines = mode === "enter" ? BOOT_LINES : EXIT_LINES;

  useEffect(() => {
    // Show logo first
    const logoTimer = setTimeout(() => setShowLogo(true), 200);

    // Show boot lines progressively
    const lineTimers = lines.map((line, index) =>
      setTimeout(() => {
        setVisibleLines((prev) => [...prev, line.text]);
      }, line.delay + 600)
    );

    // Show welcome message (only for enter mode)
    const welcomeTimer =
      mode === "enter"
        ? setTimeout(() => setShowWelcome(true), 2000)
        : undefined;

    // Fade out and complete
    const fadeTimer = setTimeout(
      () => setFadeOut(true),
      mode === "enter" ? 2800 : 1600
    );
    const completeTimer = setTimeout(
      onComplete,
      mode === "enter" ? 3200 : 2000
    );

    return () => {
      clearTimeout(logoTimer);
      lineTimers.forEach(clearTimeout);
      if (welcomeTimer) clearTimeout(welcomeTimer);
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [lines, mode, onComplete]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "#0a0a0a",
        color: "#00ff00",
        fontFamily: '"IBM Plex Mono", "JetBrains Mono", monospace',
        fontSize: "14px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        opacity: fadeOut ? 0 : 1,
        transition: "opacity 0.4s ease-out",
      }}
    >
      {/* Logo */}
      {showLogo && (
        <pre
          style={{
            color: "#00ff00",
            textShadow: "0 0 10px #00ff00",
            margin: 0,
            fontSize: "12px",
            lineHeight: 1.2,
            animation: "fadeIn 0.5s ease-out",
          }}
        >
          {ASCII_LOGO}
        </pre>
      )}

      {/* Boot lines */}
      <div
        style={{
          marginTop: "24px",
          textAlign: "left",
          minHeight: "120px",
        }}
      >
        {visibleLines.map((line, index) => (
          <div
            key={index}
            style={{
              opacity: line ? 1 : 0,
              color: "#008800",
              textShadow: "0 0 5px #004400",
            }}
          >
            {line}
          </div>
        ))}
      </div>

      {/* Welcome message */}
      {showWelcome && mode === "enter" && (
        <div
          style={{
            marginTop: "16px",
            textAlign: "center",
            animation: "fadeIn 0.3s ease-out",
          }}
        >
          <div
            style={{
              color: "#00ff00",
              textShadow: "0 0 10px #00ff00",
              marginBottom: "8px",
            }}
          >
            {WELCOME_TEXT}
          </div>
          <div style={{ color: "#008800" }}>{HELP_TEXT}</div>
        </div>
      )}

      {/* CSS animations */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
