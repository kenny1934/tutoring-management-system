"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface AdminTab {
  name: string;
  href: string;
  /** Prefix for the active test; defaults to `href`. Set it when a tab
   *  deep-links (e.g. /admin/summer/applications) but should stay highlighted
   *  across the whole section root. */
  match?: string;
}

/** The horizontal tab bar shared by the admin intake sections (summer, regular,
 *  and the cross-intake prospects module). Renders its children below the bar
 *  in a fill-height column. */
export function AdminTabBar({
  tabs,
  children,
}: {
  tabs: AdminTab[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 overflow-x-auto overflow-y-hidden">
        <nav className="flex items-center gap-1 -mb-px whitespace-nowrap">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.match ?? tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "px-3 py-2 text-sm font-medium border-b-2 transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300 dark:hover:border-gray-600"
                )}
              >
                {tab.name}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
