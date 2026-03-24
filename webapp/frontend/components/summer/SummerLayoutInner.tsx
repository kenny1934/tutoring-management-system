"use client";

import { usePathname } from "next/navigation";
import { SummerHeader } from "./SummerHeader";
import { SummerFooter } from "./SummerFooter";

export function SummerLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isProspect = pathname.startsWith("/summer/prospect") ||
    (typeof window !== 'undefined' && window.location.hostname.startsWith('prospect.'));
  const isBuddyTracker = pathname.startsWith("/summer/buddy");
  const forceLight = !isProspect && !isBuddyTracker;

  const themeClass = isBuddyTracker ? "buddy-theme" : forceLight ? "summer-light" : "";

  return (
    <div className={`${themeClass} min-h-screen flex flex-col bg-background text-foreground`}>
      <SummerHeader />
      <main className="flex-1 w-full mx-auto px-4 sm:px-8 py-8">
        {children}
      </main>
      <SummerFooter />
    </div>
  );
}
