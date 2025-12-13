"use client";

import { useEffect, useState } from "react";
import { useLocation } from "@/contexts/LocationContext";
import { useDashboardStats, usePageTitle } from "@/lib/hooks";
import { GradeDistributionChart } from "@/components/dashboard/GradeDistributionChart";
import { SchoolDistributionChart } from "@/components/dashboard/SchoolDistributionChart";
import { TestCalendar } from "@/components/dashboard/TestCalendar";
import { TodaySessionsCard } from "@/components/dashboard/TodaySessionsCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition } from "@/lib/design-system";
import { BinderClip, PaperClip, Pushpin } from "@/components/ui/stationery-accents";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { selectedLocation } = useLocation();
  const { data: stats, isLoading, error } = useDashboardStats(selectedLocation);
  const [isMobile, setIsMobile] = useState(false);

  usePageTitle("Dashboard");

  // Detect mobile device for performance optimization
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (isLoading) {
    return (
      <DeskSurface>
        <PageTransition className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-8">
          {/* Header Skeleton (taller now - includes stats row) */}
          <div className={cn(
            "h-44 rounded-xl shimmer-sepia border border-[#e8d4b8] dark:border-[#6b5a4a]",
            !isMobile && "paper-texture"
          )} />

          {/* Today's Sessions + Calendar Skeleton */}
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className={cn(
                "h-56 rounded-xl shimmer-sepia border border-[#e8d4b8] dark:border-[#6b5a4a]",
                !isMobile && "paper-texture"
              )} />
            ))}
          </div>

          {/* Charts Skeleton */}
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className={cn(
                "h-64 rounded-xl shimmer-sepia border border-[#e8d4b8] dark:border-[#6b5a4a]",
                !isMobile && "paper-texture"
              )} />
            ))}
          </div>
        </PageTransition>
      </DeskSurface>
    );
  }

  if (error) {
    return (
      <DeskSurface>
        <PageTransition className="flex h-full items-center justify-center p-8">
          <div className={cn(
            "bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 p-8 text-center max-w-md",
            !isMobile && "paper-texture"
          )}>
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <p className="text-lg font-semibold text-red-700 dark:text-red-300 mb-2">
              Something went wrong
            </p>
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        </PageTransition>
      </DeskSurface>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <DeskSurface>
      <PageTransition className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-8">
        {/* Dashboard Header with branding, welcome, and quick links */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <DashboardHeader
            userName="Kenny"
            location={selectedLocation}
            isMobile={isMobile}
            pendingPayments={stats.pending_payment_enrollments}
            stats={stats}
          />
        </motion.div>

        {/* Today's Sessions + Test Calendar */}
        <div className="grid gap-4 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 16, rotate: -0.5 }}
            animate={{ opacity: 1, y: 0, rotate: -0.5 }}
            transition={{ delay: 0.15, duration: 0.3, ease: "easeOut" }}
          >
            <TodaySessionsCard isMobile={isMobile} />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 16, rotate: 0.7 }}
            animate={{ opacity: 1, y: 0, rotate: 0.7 }}
            transition={{ delay: 0.2, duration: 0.3, ease: "easeOut" }}
            id="tests-calendar"
          >
            <TestCalendar isMobile={isMobile} />
          </motion.div>
        </div>

        {/* Distribution Charts */}
        <div className="grid gap-4 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 16, rotate: -0.3 }}
            animate={{ opacity: 1, y: 0, rotate: -0.3 }}
            whileHover={{ y: -2, rotate: -0.3, boxShadow: "0 8px 16px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08)" }}
            transition={{ delay: 0.25, duration: 0.3, ease: "easeOut" }}
            className={cn(
              "relative bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] p-4 sm:p-6",
              !isMobile && "paper-texture"
            )}
          >
            {/* Stationery accent */}
            <BinderClip size="sm" className="absolute -top-2 left-1/2 -translate-x-1/2 z-10" />
            <GradeDistributionChart />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 16, rotate: 0.5 }}
            animate={{ opacity: 1, y: 0, rotate: 0.5 }}
            whileHover={{ y: -2, rotate: 0.5, boxShadow: "0 8px 16px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08)" }}
            transition={{ delay: 0.3, duration: 0.3, ease: "easeOut" }}
            className={cn(
              "relative bg-[#fef9f3] dark:bg-[#2d2618] rounded-xl border border-[#e8d4b8] dark:border-[#6b5a4a] p-4 sm:p-6",
              !isMobile && "paper-texture"
            )}
          >
            {/* Stationery accent */}
            <PaperClip variant="gold" size="sm" className="absolute -top-1 right-4 z-10 rotate-12" />
            <SchoolDistributionChart />
          </motion.div>
        </div>

        {/* Activity Feed */}
        <motion.div
          initial={{ opacity: 0, y: 16, rotate: -0.4 }}
          animate={{ opacity: 1, y: 0, rotate: -0.4 }}
          whileHover={{ y: -2, rotate: -0.4, boxShadow: "0 8px 16px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08)" }}
          transition={{ delay: 0.35, duration: 0.3, ease: "easeOut" }}
        >
          <ActivityFeed isMobile={isMobile} />
        </motion.div>
      </PageTransition>
    </DeskSurface>
  );
}
