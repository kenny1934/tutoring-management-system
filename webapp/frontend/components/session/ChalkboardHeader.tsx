"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Clock, MapPin, CheckCircle2, HandCoins, Info, GraduationCap, Hash, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSessionStatusConfig, getDisplayStatus } from "@/lib/session-status";
import type { Session } from "@/types";

interface ChalkboardHeaderProps {
  session: Session;
}

export function ChalkboardHeader({ session }: ChalkboardHeaderProps) {
  const displayStatus = getDisplayStatus(session);
  const statusConfig = getSessionStatusConfig(displayStatus);
  const [showAcademicInfo, setShowAcademicInfo] = useState(false);
  const [showMobileStatus, setShowMobileStatus] = useState(false);
  const [popoverAlign, setPopoverAlign] = useState<'left' | 'center' | 'right'>('left');
  const infoButtonRef = useRef<HTMLButtonElement>(null);

  // Calculate popover alignment based on available space
  const handleInfoMouseEnter = () => {
    if (infoButtonRef.current) {
      const rect = infoButtonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const popoverWidth = 280; // Approximate popover width
      const padding = 16;

      const spaceOnRight = viewportWidth - rect.left;
      const spaceOnLeft = rect.right;
      const needed = popoverWidth + padding;

      if (spaceOnRight >= needed) {
        setPopoverAlign('left');
      } else if (spaceOnLeft >= needed) {
        setPopoverAlign('right');
      } else {
        setPopoverAlign('center'); // Fallback: center it
      }
    }
    setShowAcademicInfo(true);
  };

  const sessionDate = new Date(session.session_date);
  const formattedDate = sessionDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.38, 1.21, 0.22, 1.00] }} // M3 Expressive spring
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className="relative w-full rounded-[20px] sm:rounded-[28px] group z-50 min-h-[80px] sm:min-h-[100px]"
      style={{
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
        transition: 'all 350ms cubic-bezier(0.38, 1.21, 0.22, 1.00)',
      }}
    >
      {/* M3 Expressive Wood Frame - Outer (3D dimensional) */}
      <div className="absolute inset-0 rounded-[20px] sm:rounded-[28px] bg-gradient-to-br from-[#b89968] via-[#a67c52] to-[#8b6f47]">
        {/* Wood grain texture */}
        <div className="absolute inset-0 rounded-[20px] sm:rounded-[28px] opacity-40" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='wood'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.05,0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23wood)' opacity='0.3'/%3E%3C/svg%3E")`,
        }} />

        {/* Inner shadow for depth */}
        <div className="absolute inset-0 rounded-[20px] sm:rounded-[28px]" style={{
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3), inset 0 -2px 4px rgba(255,255,255,0.2)',
        }} />
      </div>

      {/* Chalkboard Surface - Inner with matching rounded corners */}
      <div className="absolute inset-2 sm:inset-3 bg-[#2d4739] dark:bg-[#1a2821] rounded-[14px] sm:rounded-[20px] transition-colors duration-350">
        {/* Chalk dust texture overlay - enhanced for M3 */}
        <div className="absolute inset-0 rounded-[14px] sm:rounded-[20px] opacity-30 transition-opacity duration-350 group-hover:opacity-40" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.3'/%3E%3C/svg%3E")`,
        }} />

        {/* Chalkboard inner shadow */}
        <div className="absolute inset-0 rounded-[14px] sm:rounded-[20px]" style={{
          boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5), inset 0 2px 4px rgba(0,0,0,0.3)',
        }} />
      </div>

      {/* Content - M3 Expressive */}
      <div className="relative h-full flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        {/* Left side - Student ID, Name, and Metadata with M3 Expressive animation */}
        <div className="flex-1 min-w-0 relative">
          <motion.div
            initial={{ opacity: 0, x: -20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{
              delay: 0.15,
              duration: 0.35,
              ease: [0.38, 1.21, 0.22, 1.00], // M3 Expressive default spring
            }}
            className="flex items-center gap-2 mb-1"
          >
            <h1
              className="text-lg sm:text-xl lg:text-2xl font-bold text-white/98 truncate"
              style={{
                textShadow: '2px 2px 6px rgba(0,0,0,0.5), 0 0 12px rgba(255,255,255,0.15)',
                letterSpacing: '0.03em', // M3 Expressive wide tracking
                fontWeight: 700, // M3 Expressive display bold
              }}
            >
              {session.school_student_id && (
                <span className="text-white/85 mr-2">{session.school_student_id}</span>
              )}
              <Link
                href={`/students/${session.student_id}`}
                className="hover:text-amber-200 hover:underline decoration-amber-200/50 underline-offset-2 transition-colors"
              >
                {session.student_name || "Unknown Student"}
              </Link>
            </h1>

            {/* Info Button - always shown since we always have session ID */}
            <button
                ref={infoButtonRef}
                onMouseEnter={handleInfoMouseEnter}
                onMouseLeave={() => setShowAcademicInfo(false)}
                className="relative flex-shrink-0 p-1 rounded-full hover:bg-white/10 transition-colors"
                aria-label="View academic information"
              >
                <Info className="h-4 w-4 text-white/70 hover:text-white/90 transition-colors" />

                {/* Academic Info Popover - dynamic positioning based on viewport */}
                <AnimatePresence>
                  {showAcademicInfo && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -5 }}
                      transition={{
                        duration: 0.2,
                        ease: [0.38, 1.21, 0.22, 1.00],
                      }}
                      className={cn(
                        "absolute top-full mt-2 w-auto max-w-[90vw] overflow-x-auto p-2.5 bg-[#e6d5b8] dark:bg-[#3d3a32] rounded-lg shadow-xl border border-amber-900/40 dark:border-amber-900/20 z-[9999]",
                        popoverAlign === 'left' && 'left-0',
                        popoverAlign === 'right' && 'right-0',
                        popoverAlign === 'center' && 'left-1/2 -translate-x-1/2'
                      )}
                      style={{
                        boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                      }}
                    >
                      <div className="space-y-2">
                        {/* Academic Info Row */}
                        {(session.grade || session.lang_stream || session.school) && (
                          <table className="text-center w-full">
                            <thead>
                              <tr>
                                {session.grade && (
                                  <th className="px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400">
                                    Grade
                                  </th>
                                )}
                                {session.lang_stream && (
                                  <th className="px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400">
                                    Stream
                                  </th>
                                )}
                                {session.school && (
                                  <th className="px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400">
                                    School
                                  </th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                {session.grade && (
                                  <td className="px-3 py-1 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                    {session.grade}
                                  </td>
                                )}
                                {session.lang_stream && (
                                  <td className="px-3 py-1 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                    {session.lang_stream}
                                  </td>
                                )}
                                {session.school && (
                                  <td className="px-3 py-1 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <GraduationCap className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                                      <span>{session.school}</span>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            </tbody>
                          </table>
                        )}

                        {/* IDs Row */}
                        <table className="text-center w-full">
                          <thead>
                            <tr>
                              <th className="px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400">
                                Session
                              </th>
                              {session.enrollment_id && (
                                <th className="px-3 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400">
                                  Enrollment
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="px-3 py-1 text-sm font-mono font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                #{session.id}
                              </td>
                              {session.enrollment_id && (
                                <td className="px-3 py-1 text-sm font-mono font-medium whitespace-nowrap">
                                  <Link
                                    href={`/enrollments/${session.enrollment_id}`}
                                    className="text-blue-600 dark:text-blue-400 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    #{session.enrollment_id}
                                  </Link>
                                </td>
                              )}
                            </tr>
                          </tbody>
                        </table>

                        {/* Linked Sessions */}
                        {session.rescheduled_to && (
                          <div className="pt-2 border-t border-amber-900/20 dark:border-amber-900/10">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Make-up Session</span>
                              <Link
                                href={`/sessions/${session.rescheduled_to.id}`}
                                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ArrowRight className="h-3 w-3" />
                                <span className="font-mono">#{session.rescheduled_to.id}</span>
                              </Link>
                            </div>
                            <div className="text-xs text-gray-700 dark:text-gray-300 pl-2 space-y-0.5">
                              <div>{new Date(session.rescheduled_to.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                              <div className="flex items-center gap-2">
                                {session.rescheduled_to.tutor_name && <span>{session.rescheduled_to.tutor_name}</span>}
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">{session.rescheduled_to.session_status}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {session.make_up_for && (
                          <div className="pt-2 border-t border-amber-900/20 dark:border-amber-900/10">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Original Session</span>
                              <Link
                                href={`/sessions/${session.make_up_for.id}`}
                                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ArrowRight className="h-3 w-3 rotate-180" />
                                <span className="font-mono">#{session.make_up_for.id}</span>
                              </Link>
                            </div>
                            <div className="text-xs text-gray-700 dark:text-gray-300 pl-2 space-y-0.5">
                              <div>{new Date(session.make_up_for.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                              <div className="flex items-center gap-2">
                                {session.make_up_for.tutor_name && <span>{session.make_up_for.tutor_name}</span>}
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">{session.make_up_for.session_status}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
            </button>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              delay: 0.25,
              duration: 0.3,
              ease: [0.38, 1.21, 0.22, 1.00],
            }}
            className="flex items-center gap-3 text-sm text-white/75 font-medium flex-wrap"
            style={{
              textShadow: '1px 1px 3px rgba(0,0,0,0.4)',
            }}
          >
            {/* Mobile Tutor Display - inline with metadata */}
            <span className="md:hidden text-white/60 text-xs">
              {session.tutor_name || "N/A"}
            </span>
            <span className="md:hidden text-white/50">•</span>

            {/* Date */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: 0.3,
                duration: 0.25,
                ease: [0.38, 1.21, 0.22, 1.00],
              }}
              className="flex items-center gap-1.5"
            >
              <Calendar className="h-3.5 w-3.5 text-white/85" />
              <span>{formattedDate}</span>
            </motion.div>

            {/* Separator */}
            {session.time_slot && <span className="text-white/50">•</span>}

            {/* Time */}
            {session.time_slot && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  delay: 0.35,
                  duration: 0.25,
                  ease: [0.38, 1.21, 0.22, 1.00],
                }}
                className="flex items-center gap-1.5"
              >
                <Clock className="h-3.5 w-3.5 text-white/85" />
                <span>{session.time_slot}</span>
              </motion.div>
            )}

            {/* Separator */}
            {session.location && <span className="text-white/50">•</span>}

            {/* Location */}
            {session.location && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  delay: 0.4,
                  duration: 0.25,
                  ease: [0.38, 1.21, 0.22, 1.00],
                }}
                className="flex items-center gap-1.5"
              >
                <MapPin className="h-3.5 w-3.5 text-white/85" />
                <span>{session.location}</span>
              </motion.div>
            )}

            {/* Separator */}
            {session.financial_status && <span className="text-white/50">•</span>}

            {/* Financial Status */}
            {session.financial_status && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  delay: 0.45,
                  duration: 0.25,
                  ease: [0.38, 1.21, 0.22, 1.00],
                }}
                className="flex items-center gap-1.5"
              >
                {session.financial_status === "Paid" ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    <span className="text-green-300 font-semibold">Paid</span>
                  </>
                ) : (
                  <>
                    <HandCoins className="h-3.5 w-3.5 text-red-400" />
                    <span className="text-red-300 font-semibold">Unpaid</span>
                  </>
                )}
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* Center - Tutor with M3 Expressive */}
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{
            delay: 0.3,
            duration: 0.35,
            ease: [0.38, 1.21, 0.22, 1.00],
          }}
          className="hidden md:block text-center px-6"
        >
          <p className="text-xs text-white/70 mb-1 uppercase tracking-wider font-bold">Tutor</p>
          <p className="text-xl text-white/98 font-bold" style={{
            textShadow: '2px 2px 5px rgba(0,0,0,0.5), 0 0 8px rgba(255,255,255,0.1)',
            letterSpacing: '0.02em', // M3 Expressive tracking
            fontWeight: 700,
          }}>
            {session.tutor_name || "Not Assigned"}
          </p>
        </motion.div>

        {/* Right side - Status Badge */}
        <div className="flex-shrink-0">
          {/* Mobile: Compact icon-only with tap to expand */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
            className="md:hidden relative"
          >
            <button
              onClick={() => setShowMobileStatus(!showMobileStatus)}
              className={cn(
                "relative w-9 h-9 rounded-full shadow-lg flex items-center justify-center border-2 border-white/40",
                statusConfig.bgClass
              )}
              aria-label={`Status: ${displayStatus}`}
            >
              <statusConfig.Icon className={cn("h-4 w-4 text-white", statusConfig.iconClass)} />
            </button>

            {/* Mobile status tooltip */}
            <AnimatePresence>
              {showMobileStatus && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -5 }}
                  transition={{ duration: 0.2 }}
                  className={cn(
                    "absolute right-0 top-full mt-2 px-3 py-1.5 rounded-lg shadow-lg text-xs font-bold text-white whitespace-nowrap z-50",
                    statusConfig.bgClass
                  )}
                >
                  {displayStatus}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Desktop: Full pill with icon + text */}
          <motion.div
            initial={{ scale: 0, rotate: -10, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{
              delay: 0.4,
              duration: 0.4,
              ease: [0.38, 1.21, 0.22, 1.00],
            }}
            whileHover={{
              scale: 1.08,
              rotate: 2,
              transition: { duration: 0.2 },
            }}
            whileTap={{
              scale: 0.95,
              transition: { duration: 0.1 },
            }}
            className="hidden md:block cursor-pointer"
          >
            <div className="relative">
              <div className="absolute inset-0 -m-3 rounded-full bg-white/25 blur-md transition-all duration-300 group-hover:bg-white/35" />
              <div
                className={cn(
                  "relative text-sm px-5 py-2 shadow-lg whitespace-nowrap font-bold border-2 border-white/40 rounded-full text-white flex items-center gap-2",
                  statusConfig.bgClass
                )}
                style={{
                  textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                  transition: 'all 200ms cubic-bezier(0.30, 1.25, 0.40, 1.00)',
                  letterSpacing: '0.02em',
                }}
              >
                <statusConfig.Icon className={cn("h-4 w-4", statusConfig.iconClass)} />
                {displayStatus}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* M3 Expressive chalk dust particles effect (bottom) */}
      <div className="absolute bottom-2 sm:bottom-3 left-4 sm:left-6 right-4 h-1 sm:h-1.5 bg-gradient-to-t from-white/15 to-transparent transition-opacity duration-300 group-hover:from-white/20 rounded-b-[12px] sm:rounded-b-[18px]" />

      {/* Chalk eraser - subtle detail (inspired by reference image) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, x: 10 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        transition={{ delay: 0.7, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
        className="absolute bottom-2 sm:bottom-3 right-2 sm:right-4 w-8 sm:w-10 h-3 sm:h-4 bg-gradient-to-br from-gray-200 to-gray-300 rounded-sm shadow-md"
        style={{
          transform: 'perspective(100px) rotateX(5deg)',
          boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5), 0 2px 4px rgba(0,0,0,0.3)',
        }}
      >
        {/* Eraser felt detail */}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-yellow-100/40 via-yellow-50/30 to-yellow-100/40 rounded-b-sm" />
      </motion.div>

      {/* M3 Expressive eraser marks (subtle animation) - hidden on mobile */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0, 0.18, 0.12, 0] }}
        transition={{
          delay: 0.6,
          duration: 2,
          ease: [0.42, 1.15, 0.30, 1.00], // M3 Expressive slow
        }}
        className="hidden sm:block absolute top-4 right-32 w-28 h-10 bg-white/12 rounded-full blur-lg transform -rotate-12"
      />

      {/* Secondary eraser mark for depth - hidden on mobile */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0, 0.12, 0.08, 0] }}
        transition={{
          delay: 0.8,
          duration: 2.2,
          ease: [0.42, 1.15, 0.30, 1.00],
        }}
        className="hidden sm:block absolute top-5 right-48 w-20 h-8 bg-white/8 rounded-full blur-md transform rotate-6"
      />
    </motion.div>
  );
}
