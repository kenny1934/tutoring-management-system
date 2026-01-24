"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

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

  // Hydration-safe: Only read from localStorage after component mounts
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("viewMode");
    if (saved === "my-view" || saved === "center-view") {
      setViewMode(saved);
    }
  }, []);

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
