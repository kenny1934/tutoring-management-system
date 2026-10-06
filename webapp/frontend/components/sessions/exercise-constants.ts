import { cn } from "@/lib/utils";

// The look of the shared Input in components/controls: 32px, the field edge,
// a white face and the oak focus ring. The exercise rows add their own size
// (h-7 and text-xs on the second row) on top of it.
export const exerciseInputClass = cn(
  "w-full min-w-0 h-8 px-2.5 rounded border border-field bg-field-fill",
  "text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400",
  "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25",
  "text-sm"
);
