"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import { api } from "@/lib/api";
import { useLocation } from "@/contexts/LocationContext";
import { formatEnrollmentDisplay, formatSessionDateTime } from "@/lib/formatters";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Enrollment } from "@/types";

export function ActiveEnrollmentsTable() {
  const { selectedLocation } = useLocation();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    async function fetchEnrollments() {
      try {
        setLoading(true);
        const data = await api.enrollments.getActive(selectedLocation);
        setEnrollments(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load enrollments");
      } finally {
        setLoading(false);
      }
    }

    fetchEnrollments();
  }, [selectedLocation]);

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            <BookOpen className="h-5 w-5" />
            Active Enrollments
            <Badge variant="secondary" className="ml-2">
              {enrollments.length}
            </Badge>
          </CardTitle>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              Error: {error}
            </div>
          ) : enrollments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No active enrollments found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-3 px-4 text-sm font-medium text-muted-foreground">Student Details</th>
                    <th className="py-3 px-4 text-sm font-medium text-muted-foreground">Schedule</th>
                    <th className="py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="py-3 px-4 text-sm font-medium text-muted-foreground">Lessons</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((enrollment) => (
                    <tr
                      key={enrollment.id}
                      className="border-b border-border hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-sm">
                            {formatEnrollmentDisplay(enrollment)}
                          </span>
                          {enrollment.enrollment_type && (
                            <Badge variant="outline" className="w-fit text-xs">
                              {enrollment.enrollment_type}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1 text-sm">
                          <span>
                            {enrollment.assigned_day && enrollment.assigned_time
                              ? `${enrollment.assigned_day} ${enrollment.assigned_time}`
                              : "TBD"}
                          </span>
                          {enrollment.tutor_name && (
                            <span className="text-xs text-muted-foreground">
                              Tutor: {enrollment.tutor_name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={enrollment.payment_status} />
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary">{enrollment.lessons_paid || 0}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
