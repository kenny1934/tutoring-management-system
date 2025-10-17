"use client";

import { ReactNode } from "react";
import { LocationProvider } from "@/contexts/LocationContext";
import { RoleProvider } from "@/contexts/RoleContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <LocationProvider>
      <RoleProvider>
        {children}
      </RoleProvider>
    </LocationProvider>
  );
}
