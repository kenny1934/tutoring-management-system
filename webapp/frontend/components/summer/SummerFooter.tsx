"use client";

import { usePathname } from "next/navigation";

export function SummerFooter() {
  const pathname = usePathname();
  const isBuddyPage = pathname.startsWith("/summer/buddy") ||
    (typeof window !== 'undefined' && window.location.hostname.startsWith('buddy.'));

  return (
    <footer className="bg-card border-t border-border py-4 text-center text-xs text-muted-foreground">
      <div className="mx-auto px-4 sm:px-8">
        {isBuddyPage
          ? <>&copy;Copyright {new Date().getFullYear()}. All Rights Reserved.</>
          : <>&copy; {new Date().getFullYear()} MathConcept Secondary Academy</>
        }
      </div>
    </footer>
  );
}
