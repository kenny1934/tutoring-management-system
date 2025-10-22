"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground/70">Theme</span>
        <div className="w-11 h-6" />
      </div>
    );
  }

  const isDark = theme === "dark";

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wide text-foreground/70 flex items-center gap-2">
        {isDark ? (
          <Moon className="h-4 w-4" />
        ) : (
          <Sun className="h-4 w-4" />
        )}
        Theme
      </span>
      <button
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className={cn(
          "relative w-12 h-7 rounded-full shadow-sm hover:scale-105 active:scale-95",
          isDark ? "bg-primary" : "bg-foreground/20"
        )}
        style={{ transition: 'all 200ms var(--spring-expressive-default)' }}
        aria-label="Toggle theme"
      >
        {/* Toggle knob - M3 Expressive */}
        <div
          className={cn(
            "absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center",
            isDark ? "left-5" : "left-0.5"
          )}
          style={{
            transition: 'all 250ms var(--spring-expressive-default)'
          }}
        >
          {isDark ? (
            <Moon className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Sun className="h-3.5 w-3.5 text-amber-500" />
          )}
        </div>
      </button>
    </div>
  );
}
