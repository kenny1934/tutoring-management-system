"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, BookOpen, Calendar } from "lucide-react";
import { api } from "@/lib/api";
import { useLocation } from "@/contexts/LocationContext";
import { formatEnrollmentDisplay, formatSessionDateTime } from "@/lib/formatters";
import { StatusBadge } from "@/components/ui/status-badge";
import Link from "next/link";
import type { Enrollment } from "@/types";

interface ActiveEnrollmentsTableProps {
  compact?: boolean;
}

export function ActiveEnrollmentsTable({ compact = false }: ActiveEnrollmentsTableProps) {
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

  // Compact version for dashboard
  if (compact) {
    if (loading) {
      return (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-6 text-red-500 dark:text-red-400 text-sm">
          Error: {error}
        </div>
      );
    }

    if (enrollments.length === 0) {
      return (
        <div className="text-center py-6 text-gray-500 dark:text-gray-400">
          <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No active enrollments</p>
        </div>
      );
    }

    const displayedEnrollments = enrollments.slice(0, 6);

    return (
      <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
        {displayedEnrollments.map((enrollment) => (
          <Link
            key={enrollment.id}
            href={`/enrollments/${enrollment.id}`}
            className="flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors"
          >
            {/* Student info */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {formatEnrollmentDisplay(enrollment)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                <Calendar className="h-3 w-3" />
                {enrollment.assigned_day && enrollment.assigned_time
                  ? `${enrollment.assigned_day} ${enrollment.assigned_time}`
                  : "TBD"}
                {enrollment.tutor_name && (
                  <span className="text-gray-400 dark:text-gray-500">
                    • {enrollment.tutor_name}
                  </span>
                )}
              </div>
            </div>

            {/* Status & Lessons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <StatusBadge status={enrollment.payment_status} size="sm" />
              <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                {enrollment.lessons_paid || 0}
              </span>
            </div>
          </Link>
        ))}
        {enrollments.length > 6 && (
          <Link
            href="/enrollments?status=active"
            className="block text-xs text-center text-[#a0704b] dark:text-[#cd853f] hover:underline pt-2"
          >
            +{enrollments.length - 6} more enrollments
          </Link>
        )}
      </div>
    );
  }

  // Full version with card wrapper (original)
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
