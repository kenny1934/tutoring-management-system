"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

type ViewMode = "my-view" | "center-view";

interface RoleContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  mounted: boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>("center-view");
  const [mounted, setMounted] = useState(false);
  const { effectiveRole, isImpersonating } = useAuth();

  // Hydration-safe: Only read from localStorage after component mounts
  // Default view mode based on role: Tutor → my-view, Admin/Super Admin → center-view
  // When impersonating, always use role-based default (ignore localStorage)
  useEffect(() => {
    setMounted(true);

    if (isImpersonating && effectiveRole) {
      // When impersonating, always use role-based default
      const defaultMode = effectiveRole === "Tutor" ? "my-view" : "center-view";
      setViewMode(defaultMode);
    } else {
      // Normal mode - use saved preference or role-based default
      const saved = localStorage.getItem("viewMode");
      if (saved === "my-view" || saved === "center-view") {
        setViewMode(saved);
      } else if (effectiveRole) {
        const defaultMode = effectiveRole === "Tutor" ? "my-view" : "center-view";
        setViewMode(defaultMode);
      }
    }
  }, [effectiveRole, isImpersonating]);

  const handleSetViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("viewMode", mode);
    }
  }, []);

  return (
    <RoleContext.Provider
      value={{
        viewMode,
        setViewMode: handleSetViewMode,
        mounted,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (context === undefined) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
}
