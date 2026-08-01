"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

interface AuthGuardProps {
  children: React.ReactNode;
}

// Routes that don't require authentication. /summer and /regular hold only
// parent-facing pages, the staff views for both living under /admin. /apply
// and /status are the clean URLs those subdomains rewrite from, so they are
// listed too: the hostname check below cannot run during server rendering, and
// the visible path is what the guard sees first.
const PUBLIC_ROUTES = ["/login"];
const PUBLIC_ROUTE_PREFIXES = ["/summer", "/regular", "/apply", "/status"];

/**
 * AuthGuard component that redirects unauthenticated users to /login.
 * Wrap your app content with this to protect all routes.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isSubdomainPublic = typeof window !== 'undefined' &&
    (window.location.hostname.startsWith('prospect.') || window.location.hostname.startsWith('summer.') || window.location.hostname.startsWith('buddy.') || window.location.hostname.startsWith('regular.'));

  const isPublicRoute =
    isSubdomainPublic ||
    PUBLIC_ROUTES.includes(pathname) ||
    PUBLIC_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    // Don't redirect while loading or on public routes
    if (isLoading || isPublicRoute) return;

    // Redirect to login if not authenticated
    if (!isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, isPublicRoute, router]);

  // Show loading state while checking auth - use theme-aware background
  if (isLoading) {
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
