"use client";

import { GraduationCap, School } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccentProps {
  className?: string;
}

// These used to be small drawn illustrations with their own fills, which
// stood out from every other card header and stayed light-mode coloured in
// dark mode. They are now the same plain line icon the other card headers
// use. The className callers pass is kept for its layout classes only, so
// an old "w-8 h-6" doesn't stretch the icon.
function plain(className?: string) {
  return cn(
    className?.split(/\s+/).filter((c) => !/^(w|h)-/.test(c)).join(" "),
    "h-4 w-4 flex-shrink-0 text-ink-subtle",
  );
}

export function GradeAccent({ className }: AccentProps) {
  return <GraduationCap className={plain(className)} aria-hidden="true" />;
}

export function SchoolAccent({ className }: AccentProps) {
  return <School className={plain(className)} aria-hidden="true" />;
}
