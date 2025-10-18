"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/lib/design-system";
import { Badge } from "@/components/ui/badge";
import type { Session } from "@/types";
import {
  Calendar,
  Clock,
  MapPin,
  User,
  GraduationCap,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionTabsCardProps {
  session: Session;
}

type TabType = "session" | "people";

export function SessionTabsCard({ session }: SessionTabsCardProps) {
  const [activeTab, setActiveTab] = useState<TabType>("session");

  const sessionDate = new Date(session.session_date);

  return (
    <GlassCard blur="lg" interactive={false} className="shadow-xl overflow-hidden">
      {/* Tab Switcher */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("session")}
          className={cn(
            "flex-1 px-6 py-4 text-sm font-medium transition-all relative",
            activeTab === "session"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Calendar className="h-4 w-4 inline-block mr-2" />
          Session Info
          {activeTab === "session" && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-pink-500"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab("people")}
          className={cn(
            "flex-1 px-6 py-4 text-sm font-medium transition-all relative",
            activeTab === "people"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <User className="h-4 w-4 inline-block mr-2" />
          People
          {activeTab === "people" && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-pink-500"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        <AnimatePresence mode="wait">
          {activeTab === "session" && (
            <motion.div
              key="session"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div>
                <p className="text-sm text-muted-foreground">Date</p>
                <p className="font-medium">
                  {sessionDate.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Time Slot</p>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">{session.time_slot || "N/A"}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Location</p>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">{session.location || "N/A"}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Financial Status</p>
                {session.financial_status === "Paid" ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                    className="flex items-center gap-2 p-2 bg-success/10 border border-success/30 rounded-lg w-fit"
                  >
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <Badge variant="success">{session.financial_status}</Badge>
                  </motion.div>
                ) : (
                  <Badge variant="warning">{session.financial_status || "Unpaid"}</Badge>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "people" && (
            <motion.div
              key="people"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="space-y-5"
            >
              <div>
                <p className="text-sm text-muted-foreground mb-1">Student</p>
                <p className="font-semibold text-xl">{session.student_name || "Unknown"}</p>
                {session.school_student_id && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    ID: {session.school_student_id}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1.5">Grade</p>
                  <Badge variant="outline" className="w-fit">
                    {session.grade || "N/A"}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1.5">Stream</p>
                  <Badge variant="outline" className="w-fit">
                    {session.lang_stream || "N/A"}
                  </Badge>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-1">School</p>
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">{session.school || "N/A"}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-1">Tutor</p>
                <p className="font-medium text-lg">{session.tutor_name || "Not Assigned"}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlassCard>
  );
}
