"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useLocation } from "@/contexts/LocationContext";
import type { Session } from "@/types";
import { Calendar, Clock, MapPin, Filter, ChevronRight } from "lucide-react";

export default function SessionsPage() {
  const { selectedLocation } = useLocation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    async function fetchSessions() {
      try {
        setLoading(true);
        const data = await api.sessions.getAll({
          date: selectedDate || undefined,
          location: selectedLocation !== "All Locations" ? selectedLocation : undefined,
          status: statusFilter || undefined,
          limit: 500,
        });
        setSessions(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sessions");
      } finally {
        setLoading(false);
      }
    }

    fetchSessions();
  }, [selectedDate, statusFilter, selectedLocation]);

  // Group sessions by time slot
  const groupedSessions = useMemo(() => {
    const groups: Record<string, Session[]> = {};

    sessions.forEach((session) => {
      const timeSlot = session.time_slot || "Unscheduled";
      if (!groups[timeSlot]) {
        groups[timeSlot] = [];
      }
      groups[timeSlot].push(session);
    });

    // Sort time slots chronologically
    return Object.entries(groups).sort(([timeA], [timeB]) => {
      // Handle "Unscheduled" to appear last
      if (timeA === "Unscheduled") return 1;
      if (timeB === "Unscheduled") return -1;

      const startA = timeA.split("-")[0];
      const startB = timeB.split("-")[0];
      return startA.localeCompare(startB);
    });
  }, [sessions]);

  const getStatusVariant = (status: string): "success" | "warning" | "secondary" | "default" => {
    switch (status.toLowerCase()) {
      case "scheduled":
        return "success";
      case "make-up class":
      case "makeup":
        return "warning";
      case "cancelled":
      case "canceled":
        return "secondary";
      default:
        return "default";
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-8">
        {/* Header Skeleton */}
        <div>
          <div className="h-9 w-48 bg-muted rounded animate-pulse mb-2" />
          <div className="h-5 w-96 bg-muted rounded animate-pulse" />
        </div>

        {/* Filters Skeleton */}
        <Card>
          <CardContent className="p-6">
            <div className="flex gap-4">
              <div className="h-10 w-48 bg-muted rounded animate-pulse" />
              <div className="h-10 w-48 bg-muted rounded animate-pulse" />
            </div>
          </CardContent>
        </Card>

        {/* Sessions Skeleton */}
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-6 w-32 bg-muted rounded animate-pulse" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-20 bg-muted rounded animate-pulse" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-destructive">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sessions</h1>
          <p className="text-muted-foreground">
            View and manage all tutoring sessions
          </p>
        </div>
        <Badge variant="secondary">{sessions.length} sessions</Badge>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm text-muted-foreground mb-2 block">
                Session Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex-1">
              <label className="text-sm text-muted-foreground mb-2 block">
                Status Filter
              </label>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                >
                  <option value="">All Statuses</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Make-up Class">Make-up Class</option>
                  <option value="Cancelled">Cancelled</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grouped Sessions */}
      {groupedSessions.length === 0 ? (
        <Card>
          <CardContent className="p-12">
            <div className="text-center">
              <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">No sessions found</p>
              <p className="text-sm text-muted-foreground">
                Try selecting a different date or adjusting your filters
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        groupedSessions.map(([timeSlot, sessionsInSlot]) => (
          <Card key={timeSlot}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                {timeSlot}
                <Badge variant="secondary" className="ml-2">
                  {sessionsInSlot.length} session{sessionsInSlot.length !== 1 ? "s" : ""}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sessionsInSlot.map((session) => (
                  <div
                    key={session.id}
                    className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-3">
                          <p className="font-medium text-lg">
                            {session.student?.student_name || `Student #${session.student_id}`}
                          </p>
                          {session.student?.school_student_id && (
                            <Badge variant="outline" className="font-mono text-xs">
                              {session.student.school_student_id}
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {session.enrollment?.subject && (
                            <div className="flex items-center gap-1">
                              <span className="font-medium">{session.enrollment.subject}</span>
                            </div>
                          )}

                          {session.location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              <span>{session.location}</span>
                            </div>
                          )}
                        </div>

                        {session.attendance_status && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Attendance:</span>
                            <Badge variant="outline" className="text-xs">
                              {session.attendance_status}
                            </Badge>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <Badge variant={getStatusVariant(session.session_status)}>
                          {session.session_status}
                        </Badge>

                        {session.financial_status && (
                          <Badge
                            variant={
                              session.financial_status === "Paid"
                                ? "success"
                                : session.financial_status === "Pending Payment"
                                ? "warning"
                                : "secondary"
                            }
                            className="text-xs"
                          >
                            {session.financial_status}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Quick Stats */}
      {groupedSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Session Summary for {new Date(selectedDate).toLocaleDateString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Total Sessions</p>
                <p className="text-2xl font-bold">{sessions.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Time Slots</p>
                <p className="text-2xl font-bold">{groupedSessions.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg per Slot</p>
                <p className="text-2xl font-bold">
                  {(sessions.length / groupedSessions.length).toFixed(1)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
