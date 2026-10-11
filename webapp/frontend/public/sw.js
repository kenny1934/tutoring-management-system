/*
 * CSM's service worker. It does three things.
 *
 * 1. It keeps the app's own files on the phone, so CSM opens quickly on a
 *    weak signal. The code, styles and fonts under /_next/static are named
 *    after their contents, so a cached copy can never be out of date, and they
 *    are served from the cache first. The pages themselves are fetched fresh
 *    every time. The last copy of each is kept, though, and is shown when the
 *    network hasn't answered within a few seconds or isn't there at all. The
 *    pages hold no one's data, since everything personal is fetched after they
 *    load, and the server data under /api is never cached.
 *
 * 2. It shows Web Push notifications for new messages.
 *
 * 3. When a push arrives, it updates the unread count on the app's icon.
 *
 * On the development server (any address with a port) it caches nothing, so
 * hot reloading keeps working.
 */

const STATIC_CACHE = "csm-static-v1";
const PAGES_CACHE = "csm-pages-v1";
// Shared with the page, see lib/app-badge.ts.
const META_CACHE = "csm-meta";
const BADGE_TUTOR_KEY = "/__csm/badge-tutor";

const CACHES_IN_USE = [STATIC_CACHE, PAGES_CACHE, META_CACHE];
const IS_DEV = self.location.port !== "";
// How long a page may take before the saved copy is shown instead.
const PAGE_TIMEOUT_MS = 3000;
// Old builds' files pile up after each deploy, so the oldest go past this many.
const STATIC_LIMIT = 400;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name.startsWith("csm-") && !CACHES_IN_USE.includes(name)).map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (IS_DEV || request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/")) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, event));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    trim(cache);
  }
  return response;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - STATIC_LIMIT))) await cache.delete(key);
}

// A page's saved copy is kept under its path alone, so /sessions?date=... and
// /sessions share one copy. The page reads the query string itself.
function pageKey(request) {
  const url = new URL(request.url);
  return url.origin + url.pathname;
}

async function networkFirst(request, event) {
  const cache = await caches.open(PAGES_CACHE);
  const fromNetwork = fetch(request).then((response) => {
    // A redirect (to sign-in, say) or an error page isn't worth keeping.
    if (response.ok && response.type === "basic" && !response.redirected) {
      cache.put(pageKey(request), response.clone());
    }
    return response;
  });
  // Saving the fresh copy carries on after a slow answer lost to the saved one.
  event.waitUntil(fromNetwork.catch(() => {}));

  const cached = await cache.match(pageKey(request));
  if (!cached) return fromNetwork;

  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), PAGE_TIMEOUT_MS));
  return Promise.race([fromNetwork.catch(() => cached), timeout]);
}

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || "New Message", {
        body: data.body || "",
        icon: "/favicon.png",
        data: data.data || {},
        tag: "inbox-" + (data.data?.threadId || "general"),
      }),
      refreshBadge().catch(() => {}),
    ]),
  );
});

// Asks the server for the signed-in tutor's unread count and puts it on the
// icon. The page leaves the tutor's id in Cache Storage for this, and the
// request carries the sign-in cookie like any other.
async function refreshBadge() {
  if (!("setAppBadge" in self.navigator)) return;
  const cache = await caches.open(META_CACHE);
  const saved = await cache.match(BADGE_TUTOR_KEY);
  if (!saved) return;
  const { tutorId } = await saved.json();
  const response = await fetch(`/api/messages/unread-count?tutor_id=${tutorId}`, { credentials: "include" });
  if (!response.ok) return;
  const { count } = await response.json();
  await (count > 0 ? self.navigator.setAppBadge(count) : self.navigator.clearAppBadge());
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/inbox";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes("/inbox") && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
