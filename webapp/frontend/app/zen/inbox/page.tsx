"use client";

import { useEffect } from "react";
import { usePageTitle } from "@/lib/hooks";
import { useAuth } from "@/contexts/AuthContext";
import { useZenKeyboardFocus } from "@/contexts/ZenKeyboardFocusContext";
import { ZenInbox } from "@/components/zen/ZenInbox";

export default function ZenInboxPage() {
  usePageTitle("Inbox - Zen Mode");
  const { user, impersonatedTutor, isImpersonating, effectiveRole } = useAuth();
  const { setDisableSectionCycling } = useZenKeyboardFocus();

  useEffect(() => {
    setDisableSectionCycling(true);
    return () => setDisableSectionCycling(false);
  }, [setDisableSectionCycling]);

  const effectiveTutorId = (isImpersonating && effectiveRole === "Tutor" && impersonatedTutor?.id)
    ? impersonatedTutor.id
    : (user?.id ?? null);

  return <ZenInbox tutorId={effectiveTutorId} />;
}
