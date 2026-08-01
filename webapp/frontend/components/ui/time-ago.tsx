"use client";

import { useEffect, useState } from "react";
import { formatTimeAgo } from "@/lib/formatters";

/** Self-ticking "Updated X ago" label. Keeps its own 30s interval so the
 *  parent page doesn't re-render just to update a timestamp string. */
export function TimeAgo({ timestamp }: { timestamp: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <span
      className="hidden md:inline text-[11px] text-muted-foreground tabular-nums"
      title={new Date(timestamp).toLocaleString()}
    >
      Updated {formatTimeAgo(new Date(timestamp).toISOString())}
    </span>
  );
}
