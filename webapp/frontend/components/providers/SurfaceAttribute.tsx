"use client";

import { useEffect } from "react";
import { surfacePreference } from "@/lib/surface-preference";

/**
 * Keeps `data-surface` on <html> in step with the chosen background, so a
 * change in the user menu, or in another tab, repaints every page at once.
 * The boot script in the root layout sets the attribute before the first
 * paint, and this takes over after that.
 */
export function SurfaceAttribute() {
  const [surface] = surfacePreference.usePreference();
  useEffect(() => {
    document.documentElement.dataset.surface = surface;
  }, [surface]);
  return null;
}
