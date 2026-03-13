import { ATTENDANCE_COLORS, CHART_COLORS } from "@/lib/progress-constants";
import { cn } from "@/lib/utils";
import type { StudentProgress } from "@/types";
import type { ReportMode } from "../ProgressReport";

interface ReportMetricsProps {
  progress: StudentProgress;
  mode: ReportMode;
  showRating?: boolean;
}

function MetricCard({ label, value, subtitle, color }: {
  label: string;
  value: string | number;
  subtitle?: string;
  color: string;
}) {
  return (
    <div className="border border-[#e8d4b8] rounded-lg px-4 py-3 text-center">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
    </div>
  );
}

export function ReportMetrics({ progress, mode, showRating = true }: ReportMetricsProps) {
  const { attendance, ratings, exercises } = progress;

  if (mode === "parent") {
    return (
      <div className={cn("grid gap-4 mb-6", showRating ? "grid-cols-3" : "grid-cols-2")}>
        <MetricCard
          label="Sessions Attended"
          value={attendance.attended}
          subtitle={`out of ${attendance.attended + attendance.no_show} scheduled`}
          color={CHART_COLORS.sessions}
        />
        {showRating && (
          <MetricCard
            label="Avg Rating"
            value={ratings.overall_avg > 0 ? ratings.overall_avg.toFixed(1) : "-"}
            subtitle={ratings.total_rated > 0 ? `${ratings.total_rated} rated sessions` : "No ratings yet"}
            color={CHART_COLORS.rating}
          />
        )}
        <MetricCard
          label="Exercises"
          value={exercises.total}
          subtitle={`${exercises.classwork} classwork / ${exercises.homework} homework`}
          color={CHART_COLORS.exercises}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      <MetricCard
        label="Attendance Rate"
        value={`${attendance.attendance_rate}%`}
        subtitle={`${attendance.attended} attended, ${attendance.no_show} no-show${attendance.no_show !== 1 ? "s" : ""}`}
        color={ATTENDANCE_COLORS.attended}
      />
      <MetricCard
        label="Avg Rating"
        value={ratings.overall_avg > 0 ? ratings.overall_avg.toFixed(1) : "-"}
        subtitle={ratings.total_rated > 0 ? `${ratings.total_rated} rated sessions` : "No ratings yet"}
        color={CHART_COLORS.rating}
      />
      <MetricCard
        label="Total Sessions"
        value={attendance.attended + attendance.no_show}
        subtitle={`${attendance.no_show} no-show${attendance.no_show !== 1 ? "s" : ""}`}
        color={CHART_COLORS.sessions}
      />
      <MetricCard
        label="Exercises"
        value={exercises.total}
        subtitle={`${exercises.classwork} CW / ${exercises.homework} HW`}
        color={CHART_COLORS.exercises}
      />
    </div>
  );
}
