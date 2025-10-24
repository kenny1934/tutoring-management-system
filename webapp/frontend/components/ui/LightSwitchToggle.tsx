"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function LightSwitchToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Theme</span>
        <div className="w-12 h-6" />
      </div>
    );
  }

  const isDark = theme === "dark";

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Theme</span>
      <button
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className={cn(
          "relative w-12 h-6 rounded-sm transition-colors",
          "border-2 shadow-inner",
          isDark
            ? "bg-gray-700 border-gray-600"
            : "bg-gray-200 border-gray-300"
        )}
        aria-label="Toggle theme"
      >
        {/* Light switch toggle */}
        <div
          className={cn(
            "absolute w-5 h-5 rounded-sm shadow-md transition-all duration-200",
            "border border-gray-400",
            isDark
              ? "left-0.5 top-0.5 bg-gray-600"
              : "left-5.5 top-0.5 bg-white"
          )}
        >
          {/* Switch plate detail */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={cn(
              "w-0.5 h-3 rounded-full",
              isDark ? "bg-gray-500" : "bg-gray-300"
            )} />
          </div>
        </div>

        {/* Screw details for realism */}
        <div className="absolute top-0.5 left-0.5 w-1 h-1 rounded-full bg-gray-500 opacity-30" />
        <div className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-gray-500 opacity-30" />
      </button>
    </div>
  );
}
