"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import type { Session } from "@/types";

interface ChalkboardHeaderProps {
  session: Session;
  statusColor: "success" | "default" | "destructive" | "secondary";
}

export function ChalkboardHeader({ session, statusColor }: ChalkboardHeaderProps) {
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
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full rounded-lg overflow-hidden shadow-xl"
      style={{ height: '100px' }}
    >
      {/* Chalkboard background with texture */}
      <div className="absolute inset-0 bg-[#2d4739] dark:bg-[#1a2821]">
        {/* Chalk dust texture overlay */}
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.3'/%3E%3C/svg%3E")`,
        }} />

        {/* Subtle wood frame effect */}
        <div className="absolute inset-0 border-8 border-[#4a3728] dark:border-[#3a2818] rounded-lg" style={{
          boxShadow: 'inset 0 0 20px rgba(0,0,0,0.3)',
        }} />
      </div>

      {/* Content */}
      <div className="relative h-full flex items-center justify-between px-8 py-4">
        {/* Left side - Student and Date */}
        <div className="flex-1 min-w-0">
          <motion.h1
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-2xl font-handwritten text-white/95 mb-1 truncate"
            style={{
              textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
              fontFamily: 'var(--font-handwritten, "Comic Sans MS", cursive)',
            }}
          >
            {session.student_name || "Unknown Student"}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-sm text-white/80"
            style={{
              textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
            }}
          >
            {formattedDate}
          </motion.p>
        </div>

        {/* Center - Tutor */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="hidden md:block text-center px-6"
        >
          <p className="text-xs text-white/60 mb-1">Tutor</p>
          <p className="text-base text-white/90 font-medium" style={{
            textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
          }}>
            {session.tutor_name || "Not Assigned"}
          </p>
        </motion.div>

        {/* Right side - Status Badge */}
        <motion.div
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.5 }}
          className="flex-shrink-0"
        >
          <div className="relative">
            {/* Chalk circle background */}
            <div className="absolute inset-0 -m-2 rounded-full bg-white/20 blur-sm" />
            <Badge
              variant={statusColor}
              className="relative text-sm px-4 py-1.5 shadow-lg whitespace-nowrap font-medium border-2 border-white/30"
              style={{
                textShadow: 'none',
              }}
            >
              {session.session_status}
            </Badge>
          </div>
        </motion.div>
      </div>

      {/* Chalk dust particles effect (bottom) */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-t from-white/10 to-transparent" />

      {/* Eraser marks (subtle) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.15, 0] }}
        transition={{ delay: 0.8, duration: 1.5 }}
        className="absolute top-4 right-32 w-24 h-8 bg-white/10 rounded-full blur-md transform -rotate-12"
      />
    </motion.div>
  );
}
