"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useLocation } from "@/contexts/LocationContext";
import { ActiveEnrollmentsTable } from "@/components/dashboard/ActiveEnrollmentsTable";
import { GradeDistributionChart } from "@/components/dashboard/GradeDistributionChart";
import { SchoolDistributionChart } from "@/components/dashboard/SchoolDistributionChart";
import type { DashboardStats } from "@/types";
import { Users, BookOpen, Calendar, DollarSign, AlertCircle } from "lucide-react";
import { DeskSurface } from "@/components/layout/DeskSurface";
import { PageTransition, StickyNote, GraphPaper } from "@/lib/design-system";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { selectedLocation } = useLocation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile device for performance optimization
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        const data = await api.stats.getDashboard(selectedLocation);
        setStats(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [selectedLocation]);

  if (loading) {
    return (
      <DeskSurface>
        <PageTransition className="flex flex-col gap-6 p-4 sm:p-8">
          {/* Header Skeleton - Cork board style */}
          <div className={cn(
            "h-32 bg-gradient-to-br from-[#c19a6b] to-[#a0826d] rounded-lg animate-pulse border-4 border-[#8b6f47]",
          )} />

          {/* Stats Grid Skeleton */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={cn(
                "h-32 bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg animate-pulse border-4 border-[#d4a574] dark:border-[#8b6f47]",
                !isMobile && "paper-texture"
              )} />
            ))}
          </div>

          {/* Quick Stats Skeleton */}
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className={cn(
                "h-48 bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg animate-pulse border-2 border-[#e8d4b8] dark:border-[#6b5a4a]",
                !isMobile && "paper-texture"
              )} />
            ))}
          </div>

          {/* Table Skeleton */}
          <div className={cn(
            "h-64 bg-white dark:bg-[#1a1a1a] rounded-lg animate-pulse border-2 border-[#e8d4b8] dark:border-[#6b5a4a]",
            !isMobile && "paper-texture"
          )} />

          {/* Charts Skeleton */}
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <div key={i} className={cn(
                "h-64 bg-[#fef9f3] dark:bg-[#2d2618] rounded-lg animate-pulse border-2 border-[#e8d4b8] dark:border-[#6b5a4a]",
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
          <StickyNote variant="pink" size="lg" showTape={true}>
            <div className="text-center">
              <p className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Oops!</p>
              <p className="text-sm text-gray-900 dark:text-gray-100">Error: {error}</p>
            </div>
          </StickyNote>
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
        {/* Cork Board Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: isMobile ? 0.3 : 0.5, ease: [0.38, 1.21, 0.22, 1.00] }}
          className="relative rounded-lg overflow-hidden desk-shadow-medium"
          style={{
            background: 'linear-gradient(135deg, #c19a6b 0%, #b8956a 50%, #a0826d 100%)',
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
          }}
        >
          {/* Cork texture - hidden on mobile for performance */}
          {!isMobile && (
            <div
              className="absolute inset-0 opacity-60"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='cork'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23cork)' opacity='0.4'/%3E%3C/svg%3E")`,
              }}
            />
          )}

          {/* Content */}
          <div className="relative p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
            <div className="flex items-center gap-4">
              {/* Pinned sticky note with title */}
              <motion.div
                initial={{ scale: 0, rotate: -5 }}
                animate={{ scale: 1, rotate: -2 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="relative"
              >
                <StickyNote variant="yellow" size="sm" showTape={false}>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    Dashboard
                  </h1>
                </StickyNote>
                {/* Pushpin */}
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-red-500 shadow-md"
                  style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.3), inset 0 -1px 2px rgba(0,0,0,0.2)' }}
                />
              </motion.div>

              {/* Pinned info card */}
              <motion.div
                initial={{ scale: 0, rotate: 3 }}
                animate={{ scale: 1, rotate: 1 }}
                transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                className="relative hidden sm:block"
              >
                <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded shadow-md border border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-muted-foreground">
                    Welcome back! Here&apos;s an overview of your tutoring center
                  </p>
                </div>
                {/* Pushpin */}
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-blue-500 shadow-md"
                  style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.3), inset 0 -1px 2px rgba(0,0,0,0.2)' }}
                />
              </motion.div>
            </div>

            {/* Location badge */}
            {selectedLocation && selectedLocation !== "All Locations" && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
                className="relative"
              >
                <div className="bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-100 px-4 py-2 rounded-full border-2 border-amber-600 dark:border-amber-700 font-bold shadow-md">
                  {selectedLocation}
                </div>
                {/* Pushpin */}
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-green-500 shadow-md"
                  style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.3), inset 0 -1px 2px rgba(0,0,0,0.2)' }}
                />
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Stats Grid - Index Card Style */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Total Students Card */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
            whileHover={!isMobile ? { scale: 1.03, y: -4, transition: { duration: 0.2 } } : {}}
            className={cn(
              "relative bg-[#fef9f3] dark:bg-[#2d2618] border-4 border-[#d4a574] dark:border-[#8b6f47] rounded-lg p-4 desk-shadow-low",
              !isMobile && "paper-texture"
            )}
            style={{ transform: isMobile ? 'none' : 'rotate(-0.5deg)' }}
          >
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                Total Students
              </h3>
              <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-full">
                <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold text-[#a0704b] dark:text-[#cd853f]">{stats.total_students}</div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {stats.active_students} active
              </p>
            </div>
            {!isMobile && (
              <div className="absolute bottom-0 right-0 w-0 h-0 border-b-[20px] border-b-gray-200 dark:border-b-gray-700 border-l-[20px] border-l-transparent opacity-50" />
            )}
          </motion.div>

          {/* Enrollments Card */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
            whileHover={!isMobile ? { scale: 1.03, y: -4, transition: { duration: 0.2 } } : {}}
            className={cn(
              "relative bg-[#fef9f3] dark:bg-[#2d2618] border-4 border-[#d4a574] dark:border-[#8b6f47] rounded-lg p-4 desk-shadow-low",
              !isMobile && "paper-texture"
            )}
            style={{ transform: isMobile ? 'none' : 'rotate(0.3deg)' }}
          >
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                Enrollments
              </h3>
              <div className="bg-green-100 dark:bg-green-900 p-2 rounded-full">
                <BookOpen className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold text-[#a0704b] dark:text-[#cd853f]">{stats.total_enrollments}</div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {stats.active_enrollments} active
              </p>
            </div>
            {!isMobile && (
              <div className="absolute bottom-0 right-0 w-0 h-0 border-b-[20px] border-b-gray-200 dark:border-b-gray-700 border-l-[20px] border-l-transparent opacity-50" />
            )}
          </motion.div>

          {/* Sessions Card */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.7, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
            whileHover={!isMobile ? { scale: 1.03, y: -4, transition: { duration: 0.2 } } : {}}
            className={cn(
              "relative bg-[#fef9f3] dark:bg-[#2d2618] border-4 border-[#d4a574] dark:border-[#8b6f47] rounded-lg p-4 desk-shadow-low",
              !isMobile && "paper-texture"
            )}
            style={{ transform: isMobile ? 'none' : 'rotate(-0.2deg)' }}
          >
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                Sessions This Week
              </h3>
              <div className="bg-purple-100 dark:bg-purple-900 p-2 rounded-full">
                <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold text-[#a0704b] dark:text-[#cd853f]">{stats.sessions_this_week}</div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {stats.sessions_this_month} this month
              </p>
            </div>
            {!isMobile && (
              <div className="absolute bottom-0 right-0 w-0 h-0 border-b-[20px] border-b-gray-200 dark:border-b-gray-700 border-l-[20px] border-l-transparent opacity-50" />
            )}
          </motion.div>

          {/* Revenue Card */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.8, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
            whileHover={!isMobile ? { scale: 1.03, y: -4, transition: { duration: 0.2 } } : {}}
            className={cn(
              "relative bg-[#fef9f3] dark:bg-[#2d2618] border-4 border-[#d4a574] dark:border-[#8b6f47] rounded-lg p-4 desk-shadow-low",
              !isMobile && "paper-texture"
            )}
            style={{ transform: isMobile ? 'none' : 'rotate(0.4deg)' }}
          >
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                Revenue (Month)
              </h3>
              <div className="bg-amber-100 dark:bg-amber-900 p-2 rounded-full">
                <DollarSign className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-bold text-[#a0704b] dark:text-[#cd853f]">
                ${stats.revenue_this_month ? stats.revenue_this_month.toLocaleString() : "0"}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                From active enrollments
              </p>
            </div>
            {!isMobile && (
              <div className="absolute bottom-0 right-0 w-0 h-0 border-b-[20px] border-b-gray-200 dark:border-b-gray-700 border-l-[20px] border-l-transparent opacity-50" />
            )}
          </motion.div>
        </div>

        {/* Alerts Section - Sticky Note */}
        {stats.pending_payment_enrollments > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -20, rotate: -2 }}
            animate={{ opacity: 1, x: 0, rotate: -1 }}
            transition={{ delay: 0.9, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
            className="flex justify-center"
          >
            <StickyNote variant="pink" size="lg" showTape={true} className="desk-shadow-medium">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                  Pending Payments
                </h3>
              </div>
              <p className="text-sm text-gray-900 dark:text-gray-100">
                {stats.pending_payment_enrollments} enrollment{stats.pending_payment_enrollments !== 1 ? "s" : ""} with pending payments require attention.
              </p>
            </StickyNote>
          </motion.div>
        )}

        {/* Quick Stats - Sticky Notes */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Student Overview */}
          <motion.div
            initial={{ opacity: 0, y: 20, rotate: -2 }}
            animate={{ opacity: 1, y: 0, rotate: -1 }}
            transition={{ delay: 1.0, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
            className="flex justify-center"
          >
            <StickyNote variant="blue" size="lg" showTape={true} className="desk-shadow-medium w-full">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                  Student Overview
                </h3>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Active Students</span>
                  <Badge variant="success">{stats.active_students}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Total Students</span>
                  <Badge variant="secondary">{stats.total_students}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Active Enrollments</span>
                  <Badge variant="default">{stats.active_enrollments}</Badge>
                </div>
              </div>
            </StickyNote>
          </motion.div>

          {/* Session Activity */}
          <motion.div
            initial={{ opacity: 0, y: 20, rotate: 2 }}
            animate={{ opacity: 1, y: 0, rotate: 1 }}
            transition={{ delay: 1.1, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
            className="flex justify-center"
          >
            <StickyNote variant="green" size="lg" showTape={true} className="desk-shadow-medium w-full">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                  Session Activity
                </h3>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">This Week</span>
                  <Badge variant="success">{stats.sessions_this_week}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">This Month</span>
                  <Badge variant="secondary">{stats.sessions_this_month}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Avg per Day</span>
                  <Badge variant="outline">
                    {Math.round(stats.sessions_this_month / 30)}
                  </Badge>
                </div>
              </div>
            </StickyNote>
          </motion.div>
        </div>

        {/* Active Enrollments Table - Graph Paper Style */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
          style={{ transform: isMobile ? 'none' : 'rotate(-0.2deg)' }}
        >
          <GraphPaper gridSize="1cm" className="desk-shadow-medium">
            <div className="mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-[#a0704b] dark:text-[#cd853f]" />
                Active Enrollments
              </h3>
            </div>
            <ActiveEnrollmentsTable />
          </GraphPaper>
        </motion.div>

        {/* Distribution Charts - Index Card Style */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Grade Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 1.3, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
            whileHover={!isMobile ? { scale: 1.02, y: -4, transition: { duration: 0.2 } } : {}}
            className={cn(
              "relative bg-[#fef9f3] dark:bg-[#2d2618] border-4 border-[#d4a574] dark:border-[#8b6f47] rounded-lg p-4 sm:p-6 desk-shadow-low",
              !isMobile && "paper-texture"
            )}
            style={{ transform: isMobile ? 'none' : 'rotate(-0.3deg)' }}
          >
            <GradeDistributionChart />
            {!isMobile && (
              <div className="absolute bottom-0 right-0 w-0 h-0 border-b-[25px] border-b-gray-200 dark:border-b-gray-700 border-l-[25px] border-l-transparent opacity-50" />
            )}
          </motion.div>

          {/* School Distribution */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 1.4, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
            whileHover={!isMobile ? { scale: 1.02, y: -4, transition: { duration: 0.2 } } : {}}
            className={cn(
              "relative bg-[#fef9f3] dark:bg-[#2d2618] border-4 border-[#d4a574] dark:border-[#8b6f47] rounded-lg p-4 sm:p-6 desk-shadow-low",
              !isMobile && "paper-texture"
            )}
            style={{ transform: isMobile ? 'none' : 'rotate(0.3deg)' }}
          >
            <SchoolDistributionChart />
            {!isMobile && (
              <div className="absolute bottom-0 right-0 w-0 h-0 border-b-[25px] border-b-gray-200 dark:border-b-gray-700 border-l-[25px] border-l-transparent opacity-50" />
            )}
          </motion.div>
        </div>
      </PageTransition>
    </DeskSurface>
  );
}
