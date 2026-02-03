"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/lib/hooks";
import { CreateEnrollmentModal } from "@/components/enrollments/CreateEnrollmentModal";
import { Loader2 } from "lucide-react";

/**
 * Standalone page for creating enrollments via direct URL access.
 * Renders the CreateEnrollmentModal and redirects on close/success.
 */
export default function NewEnrollmentPage() {
  usePageTitle("New Enrollment");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, isAdmin } = useAuth();

  const renewFromId = searchParams.get("renew_from");
  const [modalOpen, setModalOpen] = useState(false);

  // Open modal once auth is loaded and user is admin
  useEffect(() => {
    if (!authLoading && user && isAdmin) {
      setModalOpen(true);
    }
  }, [authLoading, user, isAdmin]);

  const handleClose = () => {
    setModalOpen(false);
    // Navigate back or to renewals page
    if (renewFromId) {
      router.push("/admin/renewals");
    } else {
      router.back();
    }
  };

  const handleSuccess = () => {
    // Navigate to renewals page after successful creation
    router.push("/admin/renewals");
  };

  return (
    <DeskSurface>
      <PageTransition className="min-h-full p-4 sm:p-6">
        {authLoading ? (
          <div className="text-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="mt-2 text-foreground/60">Loading...</p>
          </div>
        ) : !user ? (
          <div className="text-center py-12 text-foreground/60">
            Please sign in to create enrollments
          </div>
        ) : !isAdmin ? (
          <div className="text-center py-12 text-foreground/60">
            Admin access required to create enrollments
          </div>
        ) : null}
      </PageTransition>

      <CreateEnrollmentModal
        isOpen={modalOpen}
        onClose={handleClose}
        renewFromId={renewFromId ? parseInt(renewFromId) : null}
        onSuccess={handleSuccess}
      />
    </DeskSurface>
  );
}
