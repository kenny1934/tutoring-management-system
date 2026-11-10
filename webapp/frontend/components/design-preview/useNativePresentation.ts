"use client";

// Existing presentation wrappers share this value. The accepted presentation
// is now the default on the server and client, independent of old preview URLs
// or session storage. Reduced motion is handled by each interaction itself.
export type NativePresentationMode = "motion" | "original";
export function useNativePresentation(): NativePresentationMode {
  return "motion";
}
