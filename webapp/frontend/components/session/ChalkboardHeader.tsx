"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, CheckCircle2, HandCoins, Info, GraduationCap } from "lucide-react";
import type { Session } from "@/types";

interface ChalkboardHeaderProps {
  session: Session;
  statusColor: "success" | "default" | "destructive" | "secondary";
}

export function ChalkboardHeader({ session, statusColor }: ChalkboardHeaderProps) {
  const [showAcademicInfo, setShowAcademicInfo] = useState(false);

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
      className="relative w-full rounded-[28px] overflow-visible group z-50"
      style={{
        height: '100px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
        transition: 'all 350ms cubic-bezier(0.38, 1.21, 0.22, 1.00)',
      }}
    >
      {/* M3 Expressive Wood Frame - Outer (3D dimensional) */}
      <div className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-[#b89968] via-[#a67c52] to-[#8b6f47]">
        {/* Wood grain texture */}
        <div className="absolute inset-0 rounded-[28px] opacity-40" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='wood'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.05,0.8' numOctaves='3'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23wood)' opacity='0.3'/%3E%3C/svg%3E")`,
        }} />

        {/* Inner shadow for depth */}
        <div className="absolute inset-0 rounded-[28px]" style={{
          boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3), inset 0 -2px 4px rgba(255,255,255,0.2)',
        }} />
      </div>

      {/* Chalkboard Surface - Inner with matching rounded corners */}
      <div className="absolute inset-3 bg-[#2d4739] dark:bg-[#1a2821] rounded-[20px] transition-colors duration-350">
        {/* Chalk dust texture overlay - enhanced for M3 */}
        <div className="absolute inset-0 rounded-[20px] opacity-30 transition-opacity duration-350 group-hover:opacity-40" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.3'/%3E%3C/svg%3E")`,
        }} />

        {/* Chalkboard inner shadow */}
        <div className="absolute inset-0 rounded-[20px]" style={{
          boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5), inset 0 2px 4px rgba(0,0,0,0.3)',
        }} />
      </div>

      {/* Content - M3 Expressive */}
      <div className="relative h-full flex items-center justify-between px-8 py-4">
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
              className="text-2xl font-bold text-white/98 truncate"
              style={{
                textShadow: '2px 2px 6px rgba(0,0,0,0.5), 0 0 12px rgba(255,255,255,0.15)',
                letterSpacing: '0.03em', // M3 Expressive wide tracking
                fontWeight: 700, // M3 Expressive display bold
              }}
            >
              {session.school_student_id && (
                <span className="text-white/85 mr-2">{session.school_student_id}</span>
              )}
              {session.student_name || "Unknown Student"}
            </h1>

            {/* Academic Info Button */}
            {(session.grade || session.lang_stream || session.school) && (
              <button
                onMouseEnter={() => setShowAcademicInfo(true)}
                onMouseLeave={() => setShowAcademicInfo(false)}
                className="relative flex-shrink-0 p-1 rounded-full hover:bg-white/10 transition-colors"
                aria-label="View academic information"
              >
                <Info className="h-4 w-4 text-white/70 hover:text-white/90 transition-colors" />

                {/* Academic Info Popover */}
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
                      className="absolute left-0 top-full mt-2 w-auto p-2.5 bg-[#e6d5b8] dark:bg-[#3d3a32] rounded-lg shadow-xl border border-amber-900/40 dark:border-amber-900/20 z-[9999]"
                      style={{
                        boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                      }}
                    >
                      <table className="text-center">
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            )}
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

        {/* Right side - Status Badge with M3 Expressive */}
        <motion.div
          initial={{ scale: 0, rotate: -10, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{
            delay: 0.4,
            duration: 0.4,
            ease: [0.38, 1.21, 0.22, 1.00], // M3 Expressive spring
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
          className="flex-shrink-0 cursor-pointer"
        >
          <div className="relative">
            {/* M3 Expressive glow effect */}
            <div className="absolute inset-0 -m-3 rounded-full bg-white/25 blur-md transition-all duration-300 group-hover:bg-white/35" />
            <Badge
              variant={statusColor}
              className="relative text-sm px-5 py-2 shadow-lg whitespace-nowrap font-bold border-2 border-white/40 rounded-full"
              style={{
                textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                transition: 'all 200ms cubic-bezier(0.30, 1.25, 0.40, 1.00)', // M3 Expressive fast
                letterSpacing: '0.02em',
              }}
            >
              {session.session_status}
            </Badge>
          </div>
        </motion.div>
      </div>

      {/* M3 Expressive chalk dust particles effect (bottom) */}
      <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-t from-white/15 to-transparent transition-opacity duration-300 group-hover:from-white/20" />

      {/* Chalk eraser - subtle detail (inspired by reference image) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, x: 10 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        transition={{ delay: 0.7, duration: 0.4, ease: [0.38, 1.21, 0.22, 1.00] }}
        className="absolute bottom-3 right-4 w-10 h-4 bg-gradient-to-br from-gray-200 to-gray-300 rounded-sm shadow-md"
        style={{
          transform: 'perspective(100px) rotateX(5deg)',
          boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.5), 0 2px 4px rgba(0,0,0,0.3)',
        }}
      >
        {/* Eraser felt detail */}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-yellow-100/40 via-yellow-50/30 to-yellow-100/40 rounded-b-sm" />
      </motion.div>

      {/* M3 Expressive eraser marks (subtle animation) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0, 0.18, 0.12, 0] }}
        transition={{
          delay: 0.6,
          duration: 2,
          ease: [0.42, 1.15, 0.30, 1.00], // M3 Expressive slow
        }}
        className="absolute top-4 right-32 w-28 h-10 bg-white/12 rounded-full blur-lg transform -rotate-12"
      />

      {/* Secondary eraser mark for depth */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0, 0.12, 0.08, 0] }}
        transition={{
          delay: 0.8,
          duration: 2.2,
          ease: [0.42, 1.15, 0.30, 1.00],
        }}
        className="absolute top-5 right-48 w-20 h-8 bg-white/8 rounded-full blur-md transform rotate-6"
      />
    </motion.div>
  );
}
