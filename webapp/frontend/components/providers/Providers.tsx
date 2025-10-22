"use client";

import { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { LocationProvider } from "@/contexts/LocationContext";
import { RoleProvider } from "@/contexts/RoleContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <LocationProvider>
        <RoleProvider>
          {children}
        </RoleProvider>
      </LocationProvider>
    </ThemeProvider>
  );
}
