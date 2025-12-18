"use client";

import { ReactNode } from "react";
import { SWRConfig } from "swr";
import { ThemeProvider } from "next-themes";
import { LocationProvider } from "@/contexts/LocationContext";
import { RoleProvider } from "@/contexts/RoleContext";
import { CommandPaletteProvider } from "@/contexts/CommandPaletteContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { CommandPalette } from "@/components/CommandPalette";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: true,
        revalidateOnReconnect: false,
        dedupingInterval: 5000,
        keepPreviousData: true, // Show stale data while revalidating
      }}
    >
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <LocationProvider>
          <RoleProvider>
            <CommandPaletteProvider>
              <ToastProvider>
                {children}
                <CommandPalette />
              </ToastProvider>
            </CommandPaletteProvider>
          </RoleProvider>
        </LocationProvider>
      </ThemeProvider>
    </SWRConfig>
  );
}
