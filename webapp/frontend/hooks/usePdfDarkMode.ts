"use client";

import { useCallback } from "react";
import { createBooleanPreference } from "@/lib/boolean-preference";

/**
 * The lesson viewer's dark PDF mode, as one switch for every viewer on the
 * page. The worksheet and the answer key used to keep a setting each, so the
 * two halves of the board could end up one dark and one light. The Draft
 * follows it too.
 */
const darkMode = createBooleanPreference("csm_pdf_dark_mode");

export function usePdfDarkMode(): [dark: boolean, toggle: () => void] {
  const [dark, setDark] = darkMode.usePreference();
  const toggle = useCallback(() => setDark(!darkMode.get()), [setDark]);
  return [dark, toggle];
}
