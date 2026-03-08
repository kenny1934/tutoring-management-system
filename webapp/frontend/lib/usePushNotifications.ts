import { useEffect } from "react";

/** Post subscription info to backend (upsert). */
async function syncSubscription(sub: PushSubscription) {
  const subJson = sub.toJSON();
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      endpoint: subJson.endpoint,
      keys: subJson.keys,
    }),
  });
}

/**
 * Registers the service worker and subscribes to Web Push notifications.
 * Only subscribes if the user has already granted notification permission.
 * Re-syncs existing subscriptions to handle backend purges.
 */
export function usePushNotifications(tutorId: number | null) {
  useEffect(() => {
    if (
      !tutorId ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    )
      return;

    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      // Only proceed when permission is already granted
      if (Notification.permission !== "granted") return;

      try {
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          // Re-sync to backend once per session (avoids POST on every page load)
          if (!sessionStorage.getItem("push-synced")) {
            await syncSubscription(existing);
            sessionStorage.setItem("push-synced", "1");
          }
          return;
        }

        const resp = await fetch("/api/push/vapid-key");
        if (!resp.ok) return;
        const { publicKey } = await resp.json();
        if (!publicKey) return;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        });

        await syncSubscription(sub);
      } catch (err) {
        console.warn("Push subscription failed:", err);
      }
    });
  }, [tutorId]);
}
