"use client";

import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { ExtensionRequestsList } from "@/components/admin/ExtensionRequestsList";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/lib/hooks";
import { Clock } from "lucide-react";

export default function AdminExtensionsPage() {
  usePageTitle("Extension Requests");
  const { user, isLoading, canViewAdminPages, isReadOnly } = useAuth();

  // Get current tutor ID from authenticated user
  const currentTutorId = user?.id;

  return (
    <DeskSurface>
      <PageTransition className="min-h-full p-4 sm:p-6">
        <div className="bg-[#faf8f5] dark:bg-[#1a1a1a] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] shadow-sm p-4 sm:p-6">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Extension Requests
              </h1>
              <p className="text-sm text-foreground/60">
                Review and approve enrollment extension requests
                {isReadOnly && <span className="ml-2 text-amber-600">(Read-only)</span>}
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          /* Skeleton cards while loading tutors */
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-4 rounded-lg border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-16 rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                      <div className="h-4 w-32 rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                      <div className="h-5 w-20 rounded-full animate-pulse bg-amber-100 dark:bg-amber-900/30" />
                    </div>
                    <div className="h-4 w-48 rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
                    <div className="h-3 w-64 rounded animate-pulse bg-gray-100 dark:bg-gray-800" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : !user ? (
          <div className="text-center py-12 text-foreground/60">
            Please sign in to view extension requests
          </div>
        ) : !canViewAdminPages ? (
          <div className="text-center py-12 text-foreground/60">
            Admin access required to manage extension requests
          </div>
        ) : currentTutorId ? (
          <ExtensionRequestsList adminTutorId={currentTutorId} readOnly={isReadOnly} />
        ) : (
          <div className="text-center py-12 text-foreground/60">
            Unable to identify current user
          </div>
        )}
        </div>
      </PageTransition>
    </DeskSurface>
  );
}
