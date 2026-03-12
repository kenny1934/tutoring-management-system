/**
 * Shared utilities for summer course public pages.
 */

import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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

/** Format a date string like "2025-07-05" to localized display. */
export function formatDate(dateStr: string, lang: Lang): string {
  const d = new Date(dateStr + "T00:00:00");
  if (lang === "zh") {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Common form input class (themed to match main app palette). */
export const inputClass =
  "w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-base placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary transition-colors duration-200";

/** Section card class. */
export const sectionClass =
  "bg-card rounded-2xl shadow-sm border border-border p-6 sm:p-8 space-y-6";

/** Label class for form fields. */
export const labelClass = "block text-sm font-medium text-foreground mb-2";

/** Radio group container. */
export const radioGroupClass = "flex flex-wrap gap-2.5";

/** Radio pill label class. */
export const radioLabelClass = (selected: boolean) =>
  `cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all duration-200 ${
    selected
      ? "bg-primary/10 text-primary border-primary shadow-sm"
      : "bg-card text-foreground border-border hover:border-primary/50 hover:bg-primary/5"
  }`;

/** Small checkmark shown inside selected radio pills. */
export const RadioCheck = () => (
  <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
    <Check className="h-2.5 w-2.5" strokeWidth={3} />
  </span>
);

/** Icon + label pattern for form field labels. */
export function IconLabel({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-4 w-4 shrink-0 text-primary/70" />
      <span>{children}</span>
    </span>
  );
}

/** Icon + text row for structured info blocks. */
export function InfoRow({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 text-sm text-foreground">
      <Icon className="h-4 w-4 shrink-0 mt-0.5 text-primary/70" />
      <span>{children}</span>
    </div>
  );
}

/** Red asterisk for required fields. */
export const RequiredMark = () => (
  <span className="text-red-500 ml-0.5">*</span>
);
