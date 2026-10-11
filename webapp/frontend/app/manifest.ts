import type { MetadataRoute } from "next";

/**
 * What a phone needs to install CSM as an app. With it, "Add to Home Screen"
 * on an iPhone and "Install app" on Android open CSM full screen, without the
 * browser's address bar, under its own icon.
 *
 * The background colour is the splash screen a phone shows while the app
 * starts, so it is the cream the app opens on. The icons are drawn by
 * scripts/logo/build.py. The maskable one keeps the logo inside the middle
 * 80%, so Android can crop it to a circle or a squircle without cutting it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CSM Pro",
    short_name: "CSM",
    description: "Professional tutoring management and scheduling platform",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fef9f3",
    theme_color: "#fef9f3",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
