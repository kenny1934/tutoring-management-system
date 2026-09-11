"use client";

import { createBooleanPreference } from "@/lib/boolean-preference";

/**
 * The lesson viewer's dark PDF mode, as one switch for every viewer on the
 * page. The worksheet and the answer key used to keep a setting each, so the
 * two halves of the board could end up one dark and one light. The Draft
 * follows it too.
 */
const darkMode = createBooleanPreference("csm_pdf_dark_mode");

const toggleDarkMode = () => darkMode.set(!darkMode.get());

/**
 * The filter that darkens a page in dark PDF mode. It goes on the page and its
 * ink together, so black ink turns light on the darkened page instead of
 * vanishing, and the worksheet and the Draft use the same one so they match.
 */
export const PDF_DARK_FILTER = "invert(0.86) hue-rotate(180deg)";

export function usePdfDarkMode(): [dark: boolean, toggle: () => void] {
  const [dark] = darkMode.usePreference();
  return [dark, toggleDarkMode];
}
