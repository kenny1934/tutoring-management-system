"use client";

import { useState, useEffect } from "react";
import { Wifi, WifiOff } from "lucide-react";
import type { ConnectionStatus as Status } from "@/lib/useSSE";

export default function ConnectionStatus({ status }: { status: Status }) {
  // Only show after a brief delay to avoid flashing on initial load
  const [showReconnecting, setShowReconnecting] = useState(false);

  useEffect(() => {
    if (status === "connected") {
      setShowReconnecting(false);
      return;
    }
    // Show after 2s of not being connected
    const timer = setTimeout(() => setShowReconnecting(true), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  if (!showReconnecting) return null;

  const isDisconnected = status === "disconnected";

  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg mx-2 mt-2 animate-in slide-in-from-top-2 fade-in duration-300 ${
        isDisconnected
          ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/40"
          : "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40"
      }`}
    >
      {isDisconnected ? (
        <WifiOff className="h-3 w-3" />
      ) : (
        <Wifi className="h-3 w-3 animate-pulse" />
      )}
      <span>{isDisconnected ? "Disconnected" : "Reconnecting..."}</span>
    </div>
  );
}
