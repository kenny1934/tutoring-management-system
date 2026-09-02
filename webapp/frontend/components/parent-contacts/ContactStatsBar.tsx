"use client";

import { cn } from "@/lib/utils";
import type { ParentCommunicationStats } from "@/lib/api";
import { Users, TrendingUp, TrendingDown, Minus, Calendar, BarChart3 } from "lucide-react";
import { CONTACT_TYPES, contactTypeMeta } from "./contact-utils";

interface ContactStatsBarProps {
  stats?: ParentCommunicationStats;
  loading?: boolean;
}

export function ContactStatsBar({ stats, loading = false }: ContactStatsBarProps) {
  if (loading && !stats) {
    return (
      <div className="flex flex-wrap gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a]">
            <div className="w-4 h-4 rounded shimmer-sepia" />
            <div className="w-16 h-4 rounded shimmer-sepia" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const weekTrend = stats.contacts_this_week - stats.contacts_last_week;

  // The known types first, in the order they read everywhere else, then
  // anything the database still holds that the app no longer offers, so an old
  // row is never silently left out of the total.
  const counts = stats.type_counts ?? {};
  const shownTypes = [
    ...CONTACT_TYPES.filter((t) => counts[t] > 0),
    ...Object.keys(counts).filter((t) => !CONTACT_TYPES.includes(t as never) && counts[t] > 0),
  ];
  const totalTypeContacts = shownTypes.reduce((sum, t) => sum + counts[t], 0);

  return (
    <div className="flex flex-wrap gap-2 sm:gap-3">
      {/* Coverage */}
      <div className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg border",
        "border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a]"
      )}>
        <Users className="h-3.5 w-3.5 text-[#a0704b] dark:text-[#cd853f] flex-shrink-0" />
        <div className="flex items-baseline gap-1.5">
          <span className={cn(
            "text-sm font-semibold",
            stats.contact_coverage_percent >= 75 ? "text-green-600 dark:text-green-400" :
            stats.contact_coverage_percent >= 50 ? "text-yellow-600 dark:text-yellow-400" :
            "text-red-600 dark:text-red-400"
          )}>
            {stats.contact_coverage_percent}%
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">
            coverage ({stats.students_contacted_recently}/{stats.total_active_students})
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 sm:hidden">
            covered
          </span>
        </div>
      </div>

      {/* Weekly Activity */}
      <div className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg border",
        "border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a]"
      )}>
        <Calendar className="h-3.5 w-3.5 text-[#a0704b] dark:text-[#cd853f] flex-shrink-0" />
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {stats.contacts_this_week}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">this week</span>
        {weekTrend > 0 ? (
          <TrendingUp className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
        ) : weekTrend < 0 ? (
          <TrendingDown className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
        ) : (
          <Minus className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        )}
      </div>

      {/* Type Distribution (last 30 days) */}
      {totalTypeContacts > 0 && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg border",
          "border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a]"
        )}>
          <BarChart3 className="h-3.5 w-3.5 text-[#a0704b] dark:text-[#cd853f] flex-shrink-0" />
          <div className="flex items-center gap-2 text-xs">
            {shownTypes.map((type) => (
              // A coloured dot and a number said nothing about which type it
              // stood for unless you already knew the code, so each one now
              // names itself on hover.
              <span
                key={type}
                className="flex items-center gap-1"
                title={`${type}: ${counts[type]} in the last 30 days`}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", contactTypeMeta(type).dot)} />
                <span className="text-gray-600 dark:text-gray-300">{counts[type]}</span>
              </span>
            ))}
            <span className="text-gray-400 dark:text-gray-500 hidden sm:inline">30d</span>
          </div>
        </div>
      )}

      {/* Average Days */}
      {stats.average_days_since_contact != null && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg border",
          "border-[#e8d4b8] dark:border-[#6b5a4a] bg-white dark:bg-[#1a1a1a]"
        )}>
          <span className={cn(
            "text-sm font-semibold",
            stats.average_days_since_contact <= 28 ? "text-green-600 dark:text-green-400" :
            stats.average_days_since_contact <= 50 ? "text-yellow-600 dark:text-yellow-400" :
            "text-red-600 dark:text-red-400"
          )}>
            {Math.round(stats.average_days_since_contact)}d
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">avg since contact</span>
          <span className="text-xs text-gray-500 dark:text-gray-400 sm:hidden">avg</span>
        </div>
      )}
    </div>
  );
}
