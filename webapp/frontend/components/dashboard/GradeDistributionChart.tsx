"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { GraduationCap } from "lucide-react";
import { api } from "@/lib/api";
import { useLocation } from "@/contexts/LocationContext";
import type { Enrollment } from "@/types";

const COLORS = [
  "#3b82f6", // blue-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#f59e0b", // amber-500
  "#10b981", // emerald-500
  "#6366f1", // indigo-500
];

export function GradeDistributionChart() {
  const { selectedLocation } = useLocation();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEnrollments() {
      try {
        setLoading(true);
        const data = await api.enrollments.getActive(selectedLocation);
        setEnrollments(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    fetchEnrollments();
  }, [selectedLocation]);

  const chartData = useMemo(() => {
    const gradeCounts: Record<string, number> = {};

    enrollments.forEach((enrollment) => {
      const grade = enrollment.grade || "Unknown";
      gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
    });

    return Object.entries(gradeCounts)
      .map(([grade, count]) => ({
        name: grade,
        value: count,
      }))
      .sort((a, b) => {
        // Sort grades in order: F1, F2, F3, F4, F5, F6, Unknown
        const gradeOrder = ["F1", "F2", "F3", "F4", "F5", "F6", "Unknown"];
        return gradeOrder.indexOf(a.name) - gradeOrder.indexOf(b.name);
      });
  }, [enrollments]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          Grade Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="h-32 w-32 bg-muted rounded-full animate-pulse" />
          </div>
        ) : error ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-center text-destructive">Error: {error}</div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-center text-muted-foreground">No data available</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(props) => {
                  const { name, percent } = props as unknown as { name: string; percent: number };
                  return `${name} (${(percent * 100).toFixed(0)}%)`;
                }}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
