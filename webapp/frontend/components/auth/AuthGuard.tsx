"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { isPublicPath, isPublicSubdomain } from "@/lib/public-routes";
import { hasReturnPath, rememberReturnPath, takeReturnPath } from "@/lib/return-after-sign-in";

interface AuthGuardProps {
  children: React.ReactNode;
}

// Parent-facing pages come from lib/public-routes. /login is public too but is
// only ever a staff destination, so it stays local to the guard. The preview of
// the sign-in board is public on a development server only, because it stands
// in for the login page and nobody previewing it is signed in.
const PUBLIC_ROUTES =
  process.env.NODE_ENV === "development" ? ["/login", "/dev/login-board"] : ["/login"];

/**
 * AuthGuard component that redirects unauthenticated users to /login.
 * Wrap your app content with this to protect all routes.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading, waitingForConnection } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isPublicRoute =
    isPublicSubdomain() || PUBLIC_ROUTES.includes(pathname) || isPublicPath(pathname);

  useEffect(() => {
    // Don't redirect while loading or on public routes
    if (isLoading || isPublicRoute) return;

    // Redirect to login if not authenticated, noting the page so signing in
    // comes back to it rather than to the home page.
    if (!isAuthenticated) {
      rememberReturnPath(window.location.pathname + window.location.search);
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, isPublicRoute, router]);

  // Back from signing in: Google returns everyone to the home page, so go on
  // to the page they were on before.
  const returning = !isLoading && isAuthenticated && pathname === "/" && hasReturnPath();
  useEffect(() => {
    if (!returning) return;
    const path = takeReturnPath();
    if (path) router.replace(path);
  }, [returning, router]);

  // Show loading state while checking auth - use theme-aware background
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600" />
        {waitingForConnection && (
          <p role="status" className="px-6 text-center text-sm text-ink-subtle">
            CSM can&apos;t reach the internet. It will carry on as soon as you&apos;re connected.
          </p>
        )}
      </div>
    );
  }

  // A moment of spinner while going on to the page they were on, so the home
  // page doesn't flash past first.
  if (returning) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600" />
      </div>
    );
  }

  // Allow public routes without auth
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Don't render protected content if not authenticated (will redirect)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600" />
      </div>
    );
  }

  return <>{children}</>;
}
