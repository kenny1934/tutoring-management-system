"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useCalendarEvents } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { AlertTriangle, CreditCard, BookOpen, ChevronRight } from "lucide-react";

interface AttentionCardProps {
  pendingPayments: number;
  className?: string;
  isMobile?: boolean;
}

export function AttentionCard({ pendingPayments, className, isMobile = false }: AttentionCardProps) {
  // Fetch calendar events for upcoming tests
  const { data: events = [] } = useCalendarEvents(7); // Next 7 days

  // Count tests this week
  const testsThisWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return events.filter(event => {
      const eventDate = new Date(event.start_date + 'T00:00:00');
      const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntil >= 0 && daysUntil <= 7;
    }).length;
  }, [events]);

  // Build attention items
  const attentionItems = useMemo(() => {
    const items: Array<{
      id: string;
      icon: React.ReactNode;
      label: string;
      count: number;
      severity: 'danger' | 'warning' | 'info';
      href: string;
    }> = [];

    if (pendingPayments > 0) {
      items.push({
        id: 'payments',
        icon: <CreditCard className="h-4 w-4" />,
        label: 'Overdue Payments',
        count: pendingPayments,
        severity: 'danger',
        href: '/enrollments?status=pending',
      });
    }

    if (testsThisWeek > 0) {
      items.push({
        id: 'tests',
        icon: <BookOpen className="h-4 w-4" />,
        label: 'Tests This Week',
        count: testsThisWeek,
        severity: 'warning',
        href: '#tests-calendar', // Scroll to tests section
      });
    }

    return items;
  }, [pendingPayments, testsThisWeek]);

  const severityStyles = {
    danger: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800',
      icon: 'text-red-500',
      text: 'text-red-700 dark:text-red-300',
      badge: 'bg-red-500 text-white',
    },
    warning: {
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      border: 'border-orange-200 dark:border-orange-800',
      icon: 'text-orange-500',
      text: 'text-orange-700 dark:text-orange-300',
      badge: 'bg-orange-500 text-white',
    },
    info: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-800',
      icon: 'text-blue-500',
      text: 'text-blue-700 dark:text-blue-300',
      badge: 'bg-blue-500 text-white',
    },
  };

  // If no attention items, show a positive message
  if (attentionItems.length === 0) {
    return (
      <div className={cn(
        "bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden",
        !isMobile && "paper-texture",
        className
      )}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f]" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Needs Attention</h3>
          </div>
        </div>

        <div className="p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">All caught up!</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">No items need attention</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] overflow-hidden",
      !isMobile && "paper-texture",
      className
    )}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e8d4b8] dark:border-[#6b5a4a] bg-[#f5ede3] dark:bg-[#3d3628]">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[#a0704b] dark:text-[#cd853f]" />
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Needs Attention</h3>
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 font-medium">
            {attentionItems.length} {attentionItems.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      </div>

      {/* Attention Items */}
      <div className="p-3 space-y-2">
        {attentionItems.map((item) => {
          const styles = severityStyles[item.severity];
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all",
                "hover:scale-[1.01] hover:shadow-sm",
                styles.bg,
                styles.border
              )}
            >
              <div className={cn("flex-shrink-0", styles.icon)}>
                {item.icon}
              </div>
              <span className={cn("flex-1 text-sm font-medium", styles.text)}>
                {item.label}
              </span>
              <span className={cn(
                "flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full",
                styles.badge
              )}>
                {item.count}
              </span>
              <ChevronRight className={cn("h-4 w-4 flex-shrink-0", styles.icon)} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
