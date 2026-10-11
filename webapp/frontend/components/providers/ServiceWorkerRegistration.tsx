"use client";

import { useEffect } from "react";

/**
 * Installs CSM's service worker (public/sw.js) for everyone, once the page has
 * finished loading so it never competes with the first paint. It used to be
 * installed only when someone opened the Inbox, for push notifications. Now it
 * also keeps the app's files on the phone so CSM opens quickly, which helps
 * everyone. Registering again when it's already installed costs nothing, so
 * the Inbox's own registration can stay as it is.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Without it CSM still works. It just loads from the network each time.
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
