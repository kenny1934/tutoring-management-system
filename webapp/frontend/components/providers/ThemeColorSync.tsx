"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

/**
 * Keeps the browser's bar, and an installed app's status bar, the colour of
 * the header. The root layout gives the theme colour for a phone in light and
 * dark mode, but someone can pick a theme in CSM that differs from their
 * phone's, so this paints the colour the header actually is, read from the
 * page once the theme has changed.
 */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const paper = getComputedStyle(document.documentElement).getPropertyValue("--color-paper").trim();
    if (!paper) return;
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.content = paper;
    }
  }, [resolvedTheme]);
  return null;
}
