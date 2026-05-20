"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = {
  id: string;
  label: string;
  count?: number;
};

type Props = {
  studentId: string;
  tabs: Tab[];
};

export function StudentTabStrip({ studentId, tabs }: Props) {
  const pathname = usePathname();

  return (
    <div className="border-b border-ink-200 overflow-x-auto">
      <div className="flex gap-1 min-w-max">
        {tabs.map((tab) => {
          const href =
            tab.id === "overview"
              ? `/students/${studentId}`
              : `/students/${studentId}/${tab.id}`;
          const active =
            tab.id === "overview"
              ? pathname === `/students/${studentId}`
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={tab.id}
              href={href}
              className={`px-3 py-2 text-sm whitespace-nowrap relative transition-colors ${
                active
                  ? "text-ink-900 font-medium"
                  : "text-ink-500 hover:text-ink-800"
              }`}
            >
              {tab.label}
              {typeof tab.count === "number" && tab.count > 0 && (
                <span
                  className={`ml-1.5 text-xs ${
                    active ? "text-ink-500" : "text-ink-400"
                  }`}
                >
                  ({tab.count})
                </span>
              )}
              {active && (
                <span
                  className="absolute left-2 right-2 -bottom-px h-0.5 bg-mc-red-600 rounded-full"
                  aria-hidden
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
