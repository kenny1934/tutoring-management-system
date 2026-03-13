"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { name: "Applications", href: "/admin/summer/applications" },
  { name: "Arrangement", href: "/admin/summer/arrangement" },
  { name: "Config", href: "/admin/summer/config" },
];

export default function SummerAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6">
        <nav className="flex items-center gap-1 -mb-px">
          {tabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href);
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
          <a
            href="/summer/apply"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
          >
            Form Preview
            <ExternalLink className="h-3 w-3" />
          </a>
        </nav>
      </div>
      {children}
    </div>
  );
}
