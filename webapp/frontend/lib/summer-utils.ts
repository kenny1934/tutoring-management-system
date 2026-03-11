/**
 * Shared utilities for summer course public pages.
 */

export type Lang = "zh" | "en";

/** Bilingual text selector. */
export const t = (zh: string, en: string, lang: Lang) =>
  lang === "zh" ? zh : en;

/** Day name translation map. */
const DAY_NAMES_ZH: Record<string, string> = {
  Monday: "星期一",
  Tuesday: "星期二",
  Wednesday: "星期三",
  Thursday: "星期四",
  Friday: "星期五",
  Saturday: "星期六",
  Sunday: "星期日",
};

/** Translate a day name based on language. */
export const dayLabel = (day: string, lang: Lang) =>
  lang === "zh" ? DAY_NAMES_ZH[day] || day : day;

/** Common form input class (themed to match main app palette). */
export const inputClass =
  "w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary";
