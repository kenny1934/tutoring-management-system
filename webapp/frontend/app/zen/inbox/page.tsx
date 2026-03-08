"use client";

import { useEffect } from "react";
import { usePageTitle } from "@/lib/hooks";
import { useAuth } from "@/contexts/AuthContext";
import { useRole } from "@/contexts/RoleContext";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";
import { ZenInbox } from "@/components/zen/ZenInbox";

export default function ZenInboxPage() {
  usePageTitle("Inbox - Zen Mode");
  const { user, canViewAdminPages, impersonatedTutor, isImpersonating, effectiveRole } = useAuth();
  const { viewMode } = useRole();
  const { setDisableSectionCycling } = useZenKeyboardFocus();

  useEffect(() => {
    setDisableSectionCycling(true);
    return () => setDisableSectionCycling(false);
  }, [setDisableSectionCycling]);

  const effectiveTutorId = (canViewAdminPages && viewMode === "center-view")
    ? null
    : (isImpersonating && effectiveRole === "Tutor" && impersonatedTutor?.id)
      ? impersonatedTutor.id
      : (user?.id ?? null);

  return <ZenInbox tutorId={effectiveTutorId} />;
}
