// The colour of each staff role's chip. The tutor list and a tutor's own page
// both read it from here, so a role looks the same wherever it appears.
export const ROLE_BADGE: Record<string, string> = {
  "Super Admin": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  Admin: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Tutor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

// For a role with no colour of its own, such as Supervisor or Guest.
export const ROLE_BADGE_FALLBACK = "bg-tint text-foreground/70";

// The chip's shape, shared by both pages.
export const ROLE_CHIP = "text-[11px] font-medium px-1.5 py-0.5 rounded-full";
