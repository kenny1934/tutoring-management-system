"use client";

import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface RefreshButtonProps {
  onRefresh: () => void;
  isRefreshing?: boolean;
  lastUpdated?: Date | null;
  className?: string;
  iconOnly?: boolean;
}

export function RefreshButton({
  onRefresh,
  isRefreshing = false,
  lastUpdated,
  className,
  iconOnly = false
}: RefreshButtonProps) {
  return (
    <button
      onClick={onRefresh}
      disabled={isRefreshing}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md",
        "bg-[#f5ede3] hover:bg-[#ebe0d0] dark:bg-[#3d3628] dark:hover:bg-[#4d4638]",
        "border border-[#e8d4b8] dark:border-[#6b5a4a]",
        "text-gray-600 dark:text-gray-300",
        "transition-colors disabled:opacity-50",
        className
      )}
      title={lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : "Refresh"}
    >
      <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
      {!iconOnly && <span className="hidden sm:inline">Refresh</span>}
    </button>
  );
}
