"use client";

import { useState, useEffect } from "react";
import { useLocation } from "@/contexts/LocationContext";
import { useRole } from "@/contexts/RoleContext";

interface StatusMessage {
  text: string;
  type: "success" | "error" | "info";
  timestamp: number;
}

// Global status message store
let globalStatusMessage: StatusMessage | null = null;
const statusListeners: Set<(msg: StatusMessage | null) => void> = new Set();

export function setZenStatus(text: string, type: StatusMessage["type"] = "info") {
  globalStatusMessage = { text, type, timestamp: Date.now() };
  statusListeners.forEach((listener) => listener(globalStatusMessage));

  // Auto-clear after 5 seconds
  setTimeout(() => {
    if (globalStatusMessage?.timestamp === globalStatusMessage?.timestamp) {
      globalStatusMessage = null;
      statusListeners.forEach((listener) => listener(null));
    }
  }, 5000);
}

export function ZenStatusBar() {
  const { selectedLocation } = useLocation();
  const { viewMode } = useRole();
  const [time, setTime] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);

  // Subscribe to global status messages
  useEffect(() => {
    const listener = (msg: StatusMessage | null) => setStatusMessage(msg);
    statusListeners.add(listener);
    return () => {
      statusListeners.delete(listener);
    };
  }, []);

  // Update time every minute
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  const roleLabel = viewMode === "center-view" ? "Admin" : "Tutor";
  const locationLabel =
    selectedLocation === "All Locations" ? "All" : selectedLocation;

  const getStatusColor = () => {
    if (!statusMessage) return "var(--zen-dim)";
    switch (statusMessage.type) {
      case "success":
        return "var(--zen-success)";
      case "error":
        return "var(--zen-error)";
      default:
        return "var(--zen-fg)";
    }
  };

  return (
    <div
      className="zen-status-bar"
      style={{
        display: "flex",
        alignItems: "center",
        padding: "4px 16px",
        borderTop: "1px solid var(--zen-border)",
        backgroundColor: "var(--zen-bg)",
        fontSize: "12px",
        gap: "8px",
        flexWrap: "wrap",
      }}
    >
      {/* Location */}
      <span
        style={{
          color: "var(--zen-accent)",
          padding: "2px 6px",
          border: "1px solid var(--zen-border)",
        }}
      >
        {locationLabel}
      </span>

      {/* Role */}
      <span
        style={{
          color: "var(--zen-accent)",
          padding: "2px 6px",
          border: "1px solid var(--zen-border)",
        }}
      >
        {roleLabel}
      </span>

      {/* Separator */}
      <span style={{ color: "var(--zen-border)" }}>│</span>

      {/* Status message */}
      <span
        style={{
          flex: 1,
          color: getStatusColor(),
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {statusMessage?.text || "Ready"}
      </span>

      {/* Separator */}
      <span style={{ color: "var(--zen-border)" }}>│</span>

      {/* Time */}
      <span style={{ color: "var(--zen-dim)" }}>{time}</span>
    </div>
  );
}
