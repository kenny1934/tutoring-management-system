"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The prospect module feeds both the summer and regular intakes, so it lives
// at /admin/prospects rather than under either one. That means it has no intake
// tab bar of its own — this layout restores a way back to both sections and
// marks Prospects as the active area.
const tabs = [
  { name: "Summer", href: "/admin/summer/applications", match: "/admin/summer" },
  { name: "Regular", href: "/admin/regular/applications", match: "/admin/regular" },
  { name: "Prospects", href: "/admin/prospects", match: "/admin/prospects" },
];

export default function AdminProspectsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 overflow-x-auto overflow-y-hidden">
        <nav className="flex items-center gap-1 -mb-px whitespace-nowrap">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.match);
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
