"use client";

import { WifiOff } from "lucide-react";
import { useNetworkStatus } from "@/lib/hooks/useNetworkStatus";

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 px-4 py-2 bg-amber-100 dark:bg-amber-900/80 border border-amber-300 dark:border-amber-700 rounded-lg shadow-lg">
        <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
          You're offline. Some features may be unavailable.
        </span>
      </div>
    </div>
  );
}
