"use client";

import { useAuth } from "@/contexts/AuthContext";
import { ShieldAlert } from "lucide-react";

interface AdminPageGuardProps {
  children: React.ReactNode;
  /** Custom message to show when access is denied */
  accessDeniedMessage?: string;
}

/**
 * AdminPageGuard component that restricts access to admin-only pages.
 * Shows a loading state while checking auth, and an access denied message for non-admins.
 *
 * Usage:
 *   <AdminPageGuard>
 *     <YourAdminContent />
 *   </AdminPageGuard>
 */
export function AdminPageGuard({
  children,
  accessDeniedMessage = "Admin access required to view this page",
}: AdminPageGuardProps) {
  const { user, isLoading, isAdmin } = useAuth();

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600" />
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 text-foreground/60">
        <ShieldAlert className="h-12 w-12 text-amber-500/50" />
        <p>Please sign in to view this page</p>
      </div>
    );
  }

  // Not an admin
  if (!isAdmin) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 text-foreground/60">
        <ShieldAlert className="h-12 w-12 text-red-500/50" />
        <p>{accessDeniedMessage}</p>
        <p className="text-sm text-foreground/40">
          Contact an administrator if you need access
        </p>
      </div>
    );
  }

  // Admin - render children
  return <>{children}</>;
}
