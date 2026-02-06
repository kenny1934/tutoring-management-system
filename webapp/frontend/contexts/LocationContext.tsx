"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface LocationContextType {
  selectedLocation: string;
  setSelectedLocation: (location: string) => void;
  locations: string[];
  setLocations: (locations: string[]) => void;
  mounted: boolean;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [selectedLocation, setSelectedLocation] = useState<string>("All Locations");
  const [locations, setLocations] = useState<string[]>(["All Locations"]);
  const [mounted, setMounted] = useState(false);

  // Hydration-safe: Only read from localStorage after component mounts
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("selectedLocation");
    if (saved) {
      setSelectedLocation(saved);
    }
  }, []);

  const handleSetLocation = useCallback((location: string) => {
    setSelectedLocation(location);
    if (typeof window !== "undefined") {
      localStorage.setItem("selectedLocation", location);
    }
  }, []);

  return (
    <LocationContext.Provider
      value={{
        selectedLocation,
        setSelectedLocation: handleSetLocation,
        locations,
        setLocations,
        mounted,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error("useLocation must be used within a LocationProvider");
  }
  return context;
}
