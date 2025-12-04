"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Calendar, AlertTriangle } from "lucide-react";
import type { UpcomingTestAlert } from "@/types";
import { cn } from "@/lib/utils";

interface TestAlertBannerProps {
  tests: UpcomingTestAlert[];
}

// Helper function to get colors based on event type
function getEventTypeColors(eventType: string) {
  const type = eventType.toLowerCase();

  if (type.includes('quiz')) {
    return {
      background: 'bg-green-100/80 dark:bg-green-950/40',
      border: 'border-green-400 dark:border-green-600',
      icon: 'bg-green-500 dark:bg-green-600',
      text: 'text-green-700 dark:text-green-300',
      badge: 'bg-green-500 dark:bg-green-600'
    };
  } else if (type.includes('exam')) {
    return {
      background: 'bg-purple-100/80 dark:bg-purple-950/40',
      border: 'border-purple-400 dark:border-purple-600',
      icon: 'bg-purple-500 dark:bg-purple-600',
      text: 'text-purple-700 dark:text-purple-300',
      badge: 'bg-purple-500 dark:bg-purple-600'
    };
  } else {
    // Default to Test (red)
    return {
      background: 'bg-red-100/80 dark:bg-red-950/40',
      border: 'border-red-400 dark:border-red-600',
      icon: 'bg-red-500 dark:bg-red-600',
      text: 'text-red-700 dark:text-red-300',
      badge: 'bg-red-500 dark:bg-red-600'
    };
  }
}

export function TestAlertBanner({ tests }: TestAlertBannerProps) {
  if (!tests || tests.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="mb-6"
      >
        {/* Educational theme: Index Card / Flash Card style */}
        <div className="relative bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/40 dark:to-yellow-950/40 border-4 border-amber-400 dark:border-amber-600 rounded-lg shadow-lg desk-shadow-medium overflow-hidden">
          {/* Paper texture overlay */}
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04' numOctaves='5' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23paper)' opacity='0.5'/%3E%3C/svg%3E")`,
            }}
          />

          {/* Sticky corner fold effect */}
          <div className="absolute top-0 right-0 w-0 h-0 border-t-[30px] border-t-amber-600 dark:border-t-amber-700 border-l-[30px] border-l-transparent" />

          <div className="relative p-3 sm:p-5">
            {/* Header */}
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-amber-500 dark:bg-amber-600 rounded-full shadow-md">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-amber-900 dark:text-amber-100 uppercase tracking-wide flex items-center gap-2">
                  Upcoming Assessments
                  <span className="text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 bg-amber-500 dark:bg-amber-600 text-white rounded-full">
                    {tests.length}
                  </span>
                </h3>
                <p className="text-[10px] sm:text-xs text-amber-700 dark:text-amber-300">
                  Assessments scheduled within the next 14 days
                </p>
              </div>
            </div>

            {/* Test List */}
            <div className="space-y-2 sm:space-y-3">
              {tests.map((test, index) => {
                const testDate = new Date(test.start_date);
                const formattedDate = testDate.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });

                // Get colors based on event type
                const colors = getEventTypeColors(test.event_type);

                return (
                  <motion.div
                    key={test.event_id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 + 0.2 }}
                    className={cn(
                      "flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-md border-2 transition-all duration-200 hover:scale-[1.02] hover:shadow-md",
                      colors.background,
                      colors.border
                    )}
                  >
                    {/* Calendar Icon */}
                    <div
                      className={cn(
                        "flex-shrink-0 flex flex-col items-center justify-center w-10 h-10 sm:w-14 sm:h-14 rounded-md shadow-sm",
                        colors.icon
                      )}
                    >
                      <Calendar className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                      <span className="text-[10px] sm:text-xs font-bold text-white mt-0.5">
                        {test.days_until}d
                      </span>
                    </div>

                    {/* Test Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-gray-900 dark:text-gray-100">
                              {test.title}
                            </h4>
                            <span className={cn(
                              "text-xs font-semibold px-2 py-0.5 rounded-full text-white",
                              colors.badge
                            )}>
                              {test.event_type}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {test.school} • {test.grade}
                            {test.academic_stream && ` (${test.academic_stream})`}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {formattedDate}
                          </p>
                          <p className={cn("text-xs font-semibold", colors.text)}>
                            {test.days_until === 0
                              ? "Today!"
                              : test.days_until === 1
                              ? "Tomorrow"
                              : `In ${test.days_until} days`}
                          </p>
                        </div>
                      </div>
                      {test.description && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 italic">
                          {test.description}
                        </p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
