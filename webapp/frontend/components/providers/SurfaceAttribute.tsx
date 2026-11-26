"use client";

import { useEffect } from "react";
import { surfacePreference } from "@/lib/surface-preference";

/**
 * Keeps the shared Plain surface on <html> after hydration and storage
 * changes from another tab. The boot script applies it before first paint.
 */
export function SurfaceAttribute() {
  const [surface] = surfacePreference.usePreference();
  useEffect(() => {
    document.documentElement.dataset.surface = surface;
  }, [surface]);
  return null;
}
