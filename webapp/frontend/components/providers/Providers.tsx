"use client";

import { ReactNode } from "react";
import { SWRConfig } from "swr";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/auth";
import { LocationProvider } from "@/contexts/LocationContext";
import { RoleProvider } from "@/contexts/RoleContext";
import { CommandPaletteProvider } from "@/contexts/CommandPaletteContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { ZenProvider } from "@/contexts/ZenContext";
import { CommandPalette } from "@/components/CommandPalette";
import { ZenActivator } from "@/components/zen";
import { PageErrorBoundary } from "@/components/ui/error-boundary";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { ExerciseClipboardWidget } from "@/components/ui/ExerciseClipboardWidget";

// Module-level constant — avoids recreating the config object on every render
const SWR_CONFIG = {
  revalidateOnFocus: true,
  revalidateOnReconnect: true, // Refresh data when user returns from offline
  dedupingInterval: 5000,
  keepPreviousData: true, // Show stale data while revalidating
};

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={SWR_CONFIG}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <AuthProvider>
          <AuthGuard>
            <LocationProvider>
              <RoleProvider>
                <ZenProvider>
                  <CommandPaletteProvider>
                    <ToastProvider>
                      <PageErrorBoundary>
                        {children}
                      </PageErrorBoundary>
                      <CommandPalette />
                      <ZenActivator />
                      <OfflineBanner />
                      <ExerciseClipboardWidget />
                    </ToastProvider>
                  </CommandPaletteProvider>
                </ZenProvider>
              </RoleProvider>
            </LocationProvider>
          </AuthGuard>
        </AuthProvider>
      </ThemeProvider>
    </SWRConfig>
  );
}
