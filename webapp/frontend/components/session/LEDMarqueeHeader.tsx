"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import type { Session } from "@/types";
import { User, GraduationCap, Calendar, Clock, MapPin } from "lucide-react";

interface LEDMarqueeHeaderProps {
  session: Session;
  statusColor: "success" | "default" | "destructive" | "secondary";
}

export function LEDMarqueeHeader({ session, statusColor }: LEDMarqueeHeaderProps) {
  const sessionDate = new Date(session.session_date);
  const formattedDate = sessionDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Build marquee data with icons
  const studentInfo = session.school_student_id
    ? `${session.school_student_id} ${session.student_name || "Unknown Student"}`
    : session.student_name || "Unknown Student";

  // Data segment component
  const DataSegment = ({ icon: Icon, value }: { icon: any; value: string }) => (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-white text-sm font-medium mx-1.5">
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      <span>{value}</span>
    </span>
  );

  const segments = (
    <>
      <DataSegment icon={User} value={studentInfo} />
      <DataSegment icon={GraduationCap} value={session.tutor_name || "No Tutor"} />
      <DataSegment icon={Calendar} value={formattedDate} />
      <DataSegment icon={Clock} value={session.time_slot || "N/A"} />
      <DataSegment icon={MapPin} value={session.location || "N/A"} />
    </>
  );

  return (
    <div className="relative overflow-hidden rounded-lg border border-primary/30 bg-background/40 backdrop-blur-sm w-full">
      <div className="flex items-center gap-4 p-4">
        {/* Scrolling LED Marquee - constrained width */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="marquee-container group">
            <div className="marquee-content">
              {segments}
              {segments}
              {segments}
              {segments}
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.3 }}
          className="flex-shrink-0"
        >
          <Badge
            variant={statusColor}
            className="text-base px-4 py-2 shadow-lg whitespace-nowrap"
          >
            {session.session_status}
          </Badge>
        </motion.div>
      </div>

      {/* Neon glow effect on left edge only */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-background/80 to-transparent" />
      </div>

      <style jsx>{`
        .marquee-container {
          overflow: hidden;
          position: relative;
        }

        .marquee-content {
          display: inline-flex;
          align-items: center;
          white-space: nowrap;
          animation: marquee 40s linear infinite;
        }

        .group:hover .marquee-content {
          animation-play-state: paused;
        }

        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-25%);
          }
        }
      `}</style>
    </div>
  );
}
