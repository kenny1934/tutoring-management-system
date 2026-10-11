/**
 * Where the page tells the service worker whose unread count belongs on the
 * app's icon. The service worker can't see the page's state, so when a push
 * arrives while CSM is closed it reads the tutor from here, asks the server
 * for their count and puts it on the icon. Both sides can reach Cache
 * Storage, which is why it lives there. public/sw.js uses the same names.
 */
export const BADGE_CACHE = "csm-meta";
export const BADGE_TUTOR_KEY = "/__csm/badge-tutor";

export async function rememberBadgeTutor(tutorId: number | null): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(BADGE_CACHE);
    if (tutorId === null) await cache.delete(BADGE_TUTOR_KEY);
    else await cache.put(BADGE_TUTOR_KEY, new Response(JSON.stringify({ tutorId })));
  } catch {
    // Private browsing can refuse Cache Storage. The badge then only changes while CSM is open.
  }
}

/** Shows the count on the icon, or clears it at zero. Does nothing where badges aren't supported. */
export function showBadge(count: number): void {
  if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;
  (count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
}
