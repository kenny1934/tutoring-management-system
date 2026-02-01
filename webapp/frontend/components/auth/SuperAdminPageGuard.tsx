"use client";

import { useAuth } from "@/contexts/AuthContext";
import { ShieldAlert, Loader2 } from "lucide-react";

interface SuperAdminPageGuardProps {
  children: React.ReactNode;
}

/**
 * Guard component that only renders children if user is a Super Admin
 * and not currently impersonating another role.
 *
 * Shows loading state while auth is being checked.
 * Shows access denied message for non-Super Admin users or when impersonating.
 */
export function SuperAdminPageGuard({ children }: SuperAdminPageGuardProps) {
  const { user, isLoading, isSuperAdmin, isImpersonating } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#a0704b]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
        <ShieldAlert className="h-12 w-12 text-gray-400" />
        <p className="text-gray-600 dark:text-gray-400">Please log in to access this page</p>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
        <ShieldAlert className="h-12 w-12 text-red-400" />
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Super Admin Access Required
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            This page is restricted to Super Admins only.
          </p>
        </div>
      </div>
    );
  }

  if (isImpersonating) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
        <ShieldAlert className="h-12 w-12 text-amber-400" />
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Debug Access Disabled
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Exit impersonation mode to access the debug panel.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
