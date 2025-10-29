"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GradeBookHeaderProps {
  /**
   * Main title text
   */
  title: string;

  /**
   * Subtitle or description
   */
  subtitle?: string;

  /**
   * Right side content (e.g., count badge)
   */
  rightContent?: ReactNode;

  /**
   * Grade book color theme
   * @default "burgundy"
   */
  theme?: "burgundy" | "navy" | "forest";

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Show ribbon bookmark
   * @default true
   */
  showRibbon?: boolean;
}

/**
 * GradeBookHeader - Leather-bound grade book aesthetic for headers
 *
 * Creates a professional grade book cover with embossed title, gold label,
 * and optional ribbon bookmark. Use for student list pages and registry views.
 *
 * @example
 * ```tsx
 * <GradeBookHeader
 *   title="Student Registry"
 *   subtitle="Spring 2025"
 *   rightContent={<Badge>42 students</Badge>}
 *   theme="burgundy"
 * />
 * ```
 */
export function GradeBookHeader({
  title,
  subtitle,
  rightContent,
  theme = "burgundy",
  showRibbon = true,
  className,
}: GradeBookHeaderProps) {
  const themeColors = {
    burgundy: {
      bg: "linear-gradient(135deg, #8B1538 0%, #6d1028 50%, #4a0b1a 100%)",
      border: "border-[#6d1028]",
      label: "bg-gradient-to-br from-[#D4AF37] to-[#B8941F]",
      ribbon: "bg-[#c41e3a]",
    },
    navy: {
      bg: "linear-gradient(135deg, #1e3a5f 0%, #162840 50%, #0d1827 100%)",
      border: "border-[#162840]",
      label: "bg-gradient-to-br from-[#D4AF37] to-[#B8941F]",
      ribbon: "bg-[#2c5aa0]",
    },
    forest: {
      bg: "linear-gradient(135deg, #2d5016 0%, #1f3610 50%, #13220a 100%)",
      border: "border-[#1f3610]",
      label: "bg-gradient-to-br from-[#D4AF37] to-[#B8941F]",
      ribbon: "bg-[#3d7018]",
    },
  };

  const colors = themeColors[theme];

  return (
    <div className={cn("relative w-full", className)}>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.38, 1.21, 0.22, 1.0] }}
        className={cn(
          "relative rounded-lg overflow-hidden border-4",
          colors.border
        )}
        style={{
          background: colors.bg,
          boxShadow:
            "0 10px 25px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.3)",
        }}
      >
        {/* Leather texture overlay */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='leather'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.6' numOctaves='4'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23leather)' opacity='0.5'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Stitching detail - top */}
        <div className="absolute top-2 left-4 right-4 h-px border-t-2 border-dashed border-white/20" />

        {/* Stitching detail - bottom */}
        <div className="absolute bottom-2 left-4 right-4 h-px border-t-2 border-dashed border-white/20" />

        {/* Content */}
        <div className="relative p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Gold label plate with embossed title */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className={cn(
              "relative px-6 py-4 rounded border-2 border-[#9d8a3c]",
              colors.label
            )}
            style={{
              boxShadow:
                "0 4px 6px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 -1px 0 rgba(0, 0, 0, 0.2)",
            }}
          >
            <div className="text-center">
              <h1
                className="text-2xl sm:text-3xl font-bold text-gray-900"
                style={{
                  textShadow: "0 1px 2px rgba(255, 255, 255, 0.5)",
                  fontFamily: "Georgia, serif",
                }}
              >
                {title}
              </h1>
              {subtitle && (
                <p
                  className="text-sm sm:text-base text-gray-800 mt-1"
                  style={{
                    textShadow: "0 1px 1px rgba(255, 255, 255, 0.3)",
                    fontFamily: "Georgia, serif",
                  }}
                >
                  {subtitle}
                </p>
              )}
            </div>

            {/* Corner decorations */}
            <div className="absolute top-1 left-1 w-3 h-3 border-l-2 border-t-2 border-[#9d8a3c]/40" />
            <div className="absolute top-1 right-1 w-3 h-3 border-r-2 border-t-2 border-[#9d8a3c]/40" />
            <div className="absolute bottom-1 left-1 w-3 h-3 border-l-2 border-b-2 border-[#9d8a3c]/40" />
            <div className="absolute bottom-1 right-1 w-3 h-3 border-r-2 border-b-2 border-[#9d8a3c]/40" />
          </motion.div>

          {/* Right content (badges, etc.) */}
          {rightContent && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
            >
              {rightContent}
            </motion.div>
          )}
        </div>

        {/* Ribbon bookmark */}
        {showRibbon && (
          <div
            className={cn(
              "absolute -right-2 top-0 bottom-0 w-8",
              colors.ribbon
            )}
            style={{
              boxShadow: "inset 2px 0 4px rgba(0, 0, 0, 0.3)",
              clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 95%, 0 100%)",
            }}
          >
            {/* Ribbon shine */}
            <div
              className="absolute inset-0 opacity-20"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, white 50%, transparent 100%)",
              }}
            />
          </div>
        )}
      </motion.div>
    </div>
  );
}

interface StudentCardProps {
  /**
   * Student name
   */
  studentName: string;

  /**
   * Student ID
   */
  studentId?: string;

  /**
   * Grade level
   */
  grade?: string;

  /**
   * School name
   */
  school?: string;

  /**
   * Location
   */
  location?: string;

  /**
   * Number of enrollments
   */
  enrollmentCount?: number;

  /**
   * Click handler
   */
  onClick?: () => void;

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Is card currently flipping
   */
  isFlipping?: boolean;
}

/**
 * StudentCard - Report card style student info card
 *
 * Displays student information in a clean report card format with
 * lined sections and perforated edge detail.
 *
 * @example
 * ```tsx
 * <StudentCard
 *   studentName="Jane Smith"
 *   studentId="STU-12345"
 *   grade="S3"
 *   school="ABC High School"
 *   location="Downtown"
 *   enrollmentCount={2}
 *   onClick={() => router.push(`/students/123`)}
 * />
 * ```
 */
export function StudentCard({
  studentName,
  studentId,
  grade,
  school,
  location,
  enrollmentCount,
  onClick,
  className,
  isFlipping = false,
}: StudentCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: 1,
        y: 0,
        rotateY: isFlipping ? 90 : 0,
        scale: isFlipping ? 0.95 : 1,
      }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "relative bg-[#FFF8DC] dark:bg-[#2d2618] rounded-lg p-5 cursor-pointer transition-all duration-200",
        "border-2 border-[#1e3a5f] dark:border-[#4a6fa5]",
        "hover:border-[#2c5aa0] dark:hover:border-[#5a7fb5] hover:shadow-lg",
        className
      )}
      style={{
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        background:
          "linear-gradient(to bottom, #FFF8DC 0%, #FFEFD5 100%)",
      }}
    >
      {/* Perforated edge detail at top */}
      <div className="absolute top-0 left-0 right-0 h-4 flex items-center justify-around px-2">
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600"
          />
        ))}
      </div>

      {/* Header with name */}
      <div className="mt-2 mb-4 pb-3 border-b-2 border-[#1e3a5f]/30 dark:border-[#4a6fa5]/30">
        <h3
          className="text-xl font-bold text-[#1e3a5f] dark:text-[#7a9fd5]"
          style={{ fontFamily: "Georgia, serif" }}
        >
          {studentName}
        </h3>
        {studentId && (
          <p className="text-xs font-mono text-gray-600 dark:text-gray-400 mt-1">
            ID: {studentId}
          </p>
        )}
      </div>

      {/* Info grid with lined sections */}
      <div className="space-y-2 text-sm">
        {grade && (
          <div className="flex justify-between items-center py-1 border-b border-gray-300 dark:border-gray-600">
            <span className="text-gray-600 dark:text-gray-400 font-medium">
              Grade:
            </span>
            <span className="font-semibold text-[#1e3a5f] dark:text-[#7a9fd5] px-2 py-0.5 bg-white/50 dark:bg-black/20 rounded border border-[#1e3a5f]/30 dark:border-[#4a6fa5]/30">
              {grade}
            </span>
          </div>
        )}

        {school && (
          <div className="flex justify-between items-center py-1 border-b border-gray-300 dark:border-gray-600">
            <span className="text-gray-600 dark:text-gray-400 font-medium">
              School:
            </span>
            <span className="text-gray-900 dark:text-gray-100 text-right flex-1 ml-2 truncate">
              {school}
            </span>
          </div>
        )}

        {location && (
          <div className="flex justify-between items-center py-1 border-b border-gray-300 dark:border-gray-600">
            <span className="text-gray-600 dark:text-gray-400 font-medium">
              Location:
            </span>
            <span className="text-gray-900 dark:text-gray-100">
              {location}
            </span>
          </div>
        )}

        {enrollmentCount !== undefined && (
          <div className="flex justify-between items-center py-1">
            <span className="text-gray-600 dark:text-gray-400 font-medium">
              Enrollments:
            </span>
            <span className="font-bold text-[#2d5016] dark:text-[#6d9d3f] px-2 py-0.5 bg-green-100 dark:bg-green-950/40 rounded border border-green-600 dark:border-green-700">
              {enrollmentCount}
            </span>
          </div>
        )}
      </div>

      {/* Corner fold effect */}
      <div className="absolute bottom-0 right-0 w-0 h-0 border-b-[24px] border-b-[#E6D5B8] dark:border-b-gray-700 border-l-[24px] border-l-transparent opacity-70" />
    </motion.div>
  );
}
