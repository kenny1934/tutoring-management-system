"use client";

import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { rememberBadgeTutor, showBadge } from "@/lib/app-badge";
import { useNavigation } from "./useNavigation";

/**
 * Puts the Inbox's unread count on CSM's icon on the home screen, as WhatsApp
 * does. Only an installed app has an icon to badge (Android, and iOS from
 * 16.4), and browsers that can't show one ignore this.
 *
 * The count is the signed-in person's own. While an admin is viewing the app
 * as a tutor, the counts on screen are that tutor's, so the icon is left as
 * it was. Signing out clears it.
 */
export function AppBadge() {
  const { user, isLoading, isGuest, isSupervisor, isImpersonating } = useAuth();
  const { unreadCount, unreadLoaded } = useNavigation();
  const ownId = user && !isGuest && !isSupervisor ? user.id : null;

  useEffect(() => {
    if (isLoading) return;
    rememberBadgeTutor(ownId);
    if (ownId === null) showBadge(0);
  }, [isLoading, ownId]);

  useEffect(() => {
    if (isLoading || ownId === null || isImpersonating || !unreadLoaded) return;
    showBadge(unreadCount);
  }, [isLoading, ownId, isImpersonating, unreadLoaded, unreadCount]);

  return null;
}
