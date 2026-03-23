"use client";

import { usePathname } from "next/navigation";
import { SummerHeader } from "./SummerHeader";
import { SummerFooter } from "./SummerFooter";

export function SummerLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isProspect = pathname.startsWith("/summer/prospect") ||
    (typeof window !== 'undefined' && window.location.hostname.startsWith('prospect.'));
  const forceLight = !isProspect;

  return (
    <div className={`${forceLight ? "summer-light" : ""} min-h-screen flex flex-col bg-background text-foreground`}>
      <SummerHeader />
      <main className="flex-1 w-full mx-auto px-4 sm:px-8 py-8">
        {children}
      </main>
      <SummerFooter />
    </div>
  );
}
