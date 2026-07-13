"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SWRConfig } from "swr";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/auth";
import { LocationProvider } from "@/contexts/LocationContext";
import { RoleProvider } from "@/contexts/RoleContext";
import { CommandPaletteProvider } from "@/contexts/CommandPaletteContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { ConfirmProvider } from "@/contexts/ConfirmContext";
import { ZenProvider } from "@/contexts/ZenContext";
import { CommandPalette } from "@/components/CommandPalette";
import { ZenActivator } from "@/components/zen";
import { PageErrorBoundary } from "@/components/ui/error-boundary";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { ExerciseClipboardWidget } from "@/components/ui/ExerciseClipboardWidget";

// Module-level constant — avoids recreating the config object on every render
const SWR_CONFIG = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true, // Refresh data when user returns from offline
  dedupingInterval: 5000,
  keepPreviousData: true, // Show stale data while revalidating
};

/** Hides admin-only floating widgets (command palette, zen, exercise clipboard)
 *  on the public-facing summer/prospect/buddy subdomains and on the clean
 *  public URLs (/apply, /status, /summer/*) — these widgets opened on the
 *  deployed apply form via Ctrl+K, leaking admin functionality to parents.
 *  Also hidden until the user is authenticated, so the command palette can't
 *  be opened (e.g. via Ctrl+K) on the login page before sign-in. */
function AdminOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const [pathAllowed, setPathAllowed] = useState(false);
  useEffect(() => {
    const host = window.location.hostname;
    const onPublicSubdomain =
      host.startsWith("summer.") ||
      host.startsWith("prospect.") ||
      host.startsWith("buddy.");
    const onPublicPath =
      pathname === "/apply" || pathname?.startsWith("/apply/") ||
      pathname === "/status" || pathname?.startsWith("/status/") ||
      pathname?.startsWith("/summer/") ||
      (onPublicSubdomain && pathname === "/");
    setPathAllowed(!onPublicSubdomain && !onPublicPath);
  }, [pathname]);
  if (!pathAllowed || !isAuthenticated) return null;
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={SWR_CONFIG}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <AuthProvider>
          <AuthGuard>
            <LocationProvider>
              <RoleProvider>
                <ZenProvider>
                  <CommandPaletteProvider>
                    <ToastProvider>
                      <ConfirmProvider>
                        <PageErrorBoundary>
                          {children}
                        </PageErrorBoundary>
                        <AdminOnly>
                          <CommandPalette />
                          <ZenActivator />
                          <ExerciseClipboardWidget />
                        </AdminOnly>
                        <OfflineBanner />
                      </ConfirmProvider>
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
