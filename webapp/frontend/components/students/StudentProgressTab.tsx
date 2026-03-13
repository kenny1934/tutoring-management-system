"use client";

import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  CheckCircle2,
  Star,
  Calendar,
  PenTool,
  MapPin,
  Clock,
  ArrowUp,
  ArrowDown,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudentProgress } from "@/lib/hooks";
import { formatShortDate } from "@/lib/formatters";
import { StickyNote } from "@/lib/design-system";
import type { StudentProgress, MonthlyActivity } from "@/types";

// Sepia palette matching dashboard theme
const ATTENDANCE_COLORS = {
  attended: "#a0704b",
  no_show: "#dc2626",
  rescheduled: "#d97706",
  cancelled: "#9ca3af",
};

const CHART_COLORS = {
  sessions: "#a0704b",
  exercises: "#cd853f",
  rating: "#f59e0b",
  grid: "#e8d4b8",
};

const DATA_KEY_LABELS: Record<string, string> = {
  sessions_attended: "Sessions",
  exercises_assigned: "Exercises",
  avg_rating: "Avg Rating",
};

function formatMonthLabel(month: string): string {
  return month.slice(2).replace("-", "/"); // "2025-01" -> "25/01"
}

// --- Trend Delta Badge ---

function DeltaBadge({ delta, format }: { delta: number; format: (v: number) => string }) {
  if (delta === 0) return null;
  const isUp = delta > 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
      isUp ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
    )}>
      {isUp ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
      {format(Math.abs(delta))}
    </span>
  );
}

// --- Tooltip Components ---

function AttendanceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { name: string; value: number; fill: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-[#fef9f3] dark:bg-[#2d2618] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg px-3 py-2 shadow-lg text-sm">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.fill }} />
        <span className="font-medium text-gray-900 dark:text-gray-100">{data.name}</span>
      </div>
      <div className="text-gray-600 dark:text-gray-400 mt-0.5">{data.value} sessions</div>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#fef9f3] dark:bg-[#2d2618] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg px-3 py-2 shadow-lg text-sm">
      <div className="font-medium text-gray-900 dark:text-gray-100 mb-1">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="capitalize">{DATA_KEY_LABELS[entry.dataKey] ?? entry.dataKey}:</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {entry.dataKey === "avg_rating" ? entry.value.toFixed(1) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// --- Summary Card ---

function SummaryCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color,
  delta,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtitle?: string;
  color: string;
  delta?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-[#f5ede3] dark:bg-[#3d3628] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-4",
        onClick && "cursor-pointer hover:ring-2 hover:ring-[#d4a574]/50 transition-all"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
        {delta}
      </div>
      {subtitle && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</div>
      )}
    </div>
  );
}

// --- Chart Section Wrapper ---

function ChartSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-[#f5ede3] dark:bg-[#3d3628] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-4", className)}>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{title}</h3>
      {children}
    </div>
  );
}

// --- Attendance Donut ---

function AttendanceDonut({ data }: { data: StudentProgress["attendance"] }) {
  const chartData = useMemo(() => {
    const items = [
      { name: "Attended", value: data.attended, fill: ATTENDANCE_COLORS.attended },
      { name: "No Show", value: data.no_show, fill: ATTENDANCE_COLORS.no_show },
      { name: "Rescheduled", value: data.rescheduled, fill: ATTENDANCE_COLORS.rescheduled },
      { name: "Cancelled", value: data.cancelled, fill: ATTENDANCE_COLORS.cancelled },
    ];
    return items.filter((d) => d.value > 0);
  }, [data.attended, data.no_show, data.rescheduled, data.cancelled]);

  if (data.total_past_sessions === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-500 dark:text-gray-400">
        No sessions recorded yet
      </div>
    );
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip content={<AttendanceTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      {/* Center text */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{data.attendance_rate}%</div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400">attendance</div>
        </div>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-1.5 justify-center mt-1">
        {chartData.map((entry) => (
          <span
            key={entry.name}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white/50 dark:bg-black/10 rounded border border-[#e8d4b8] dark:border-[#6b5a4a] text-[11px]"
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.fill }} />
            <span className="text-gray-700 dark:text-gray-300">{entry.name} ({entry.value})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// --- Rating Trend Line ---

function RatingTrendChart({ data }: { data: StudentProgress["ratings"] }) {
  if (data.monthly_trend.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-500 dark:text-gray-400">
        No rated sessions yet
      </div>
    );
  }

  const chartData = data.monthly_trend.map((d) => ({
    ...d,
    label: formatMonthLabel(d.month),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#8b7355" }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 5]}
          ticks={[1, 2, 3, 4, 5]}
          tick={{ fontSize: 11, fill: "#8b7355" }}
          tickLine={false}
        />
        <Tooltip content={<ChartTooltip />} />
        <Line
          type="monotone"
          dataKey="avg_rating"
          stroke={CHART_COLORS.rating}
          strokeWidth={2}
          dot={{ fill: CHART_COLORS.rating, r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// --- Monthly Activity Bars ---

function MonthlyActivityChart({ data }: { data: MonthlyActivity[] }) {
  if (data.length === 0 || data.every((d) => d.sessions_attended === 0 && d.exercises_assigned === 0)) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-500 dark:text-gray-400">
        No activity data yet
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: formatMonthLabel(d.month),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#8b7355" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#8b7355" }}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<ChartTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value: string) => (
            <span className="text-gray-600 dark:text-gray-400 capitalize">
              {DATA_KEY_LABELS[value] ?? value}
            </span>
          )}
        />
        <Bar dataKey="sessions_attended" fill={CHART_COLORS.sessions} radius={[2, 2, 0, 0]} />
        <Bar dataKey="exercises_assigned" fill={CHART_COLORS.exercises} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// --- Enrollment Timeline ---

function EnrollmentTimelineList({ data }: { data: StudentProgress["enrollment_timeline"] }) {
  if (data.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
        No enrollments found
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {data.map((e, i) => (
        <div key={e.id} className="flex gap-3">
          {/* Timeline line + dot */}
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "w-2.5 h-2.5 rounded-full mt-1.5 shrink-0",
                e.payment_status === "Paid" || e.payment_status === "Active"
                  ? "bg-[#a0704b]"
                  : e.payment_status === "Cancelled"
                    ? "bg-gray-400"
                    : "bg-amber-500"
              )}
            />
            {i < data.length - 1 && (
              <div className="w-px flex-1 bg-[#e8d4b8] dark:bg-[#6b5a4a]" />
            )}
          </div>
          {/* Content */}
          <div className="pb-4 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {e.tutor_name && (
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{e.tutor_name}</span>
              )}
              {e.enrollment_type && e.enrollment_type !== "Regular" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">
                  {e.enrollment_type}
                </span>
              )}
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium",
                e.payment_status === "Paid" || e.payment_status === "Active"
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                  : e.payment_status === "Cancelled"
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                    : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
              )}>
                {e.payment_status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1 flex-wrap">
              {e.first_lesson_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatShortDate(e.first_lesson_date)}
                </span>
              )}
              {e.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {e.location}
                </span>
              )}
              {e.assigned_day && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {e.assigned_day} {e.assigned_time || ""}
                </span>
              )}
              {e.lessons_paid != null && (
                <span>{e.lessons_paid} lessons</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Contact Summary ---

function ContactSummaryCard({ data }: { data: StudentProgress["contacts"] }) {
  if (data.total_contacts === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
        No parent contacts recorded
      </div>
    );
  }

  // Days since last contact with color coding
  const daysSinceContact = data.last_contact_date
    ? Math.floor((Date.now() - new Date(data.last_contact_date).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const contactFreshness = daysSinceContact == null
    ? null
    : daysSinceContact <= 14
      ? "text-green-600 dark:text-green-400"
      : daysSinceContact <= 30
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600 dark:text-gray-400">Total contacts</span>
        <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{data.total_contacts}</span>
      </div>
      {data.last_contact_date && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 dark:text-gray-400">Last contact</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {formatShortDate(data.last_contact_date)}
            </span>
            {daysSinceContact != null && (
              <span className={cn("text-xs font-medium", contactFreshness)}>
                ({daysSinceContact === 0 ? "today" : `${daysSinceContact}d ago`})
              </span>
            )}
          </div>
        </div>
      )}
      {Object.keys(data.by_method).length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">By Method</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(data.by_method).map(([method, count]) => (
              <span
                key={method}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/50 dark:bg-black/10 rounded border border-[#e8d4b8] dark:border-[#6b5a4a] text-[11px] text-gray-700 dark:text-gray-300"
              >
                {method}: {count}
              </span>
            ))}
          </div>
        </div>
      )}
      {Object.keys(data.by_type).length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">By Type</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(data.by_type).map(([type, count]) => (
              <span
                key={type}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/50 dark:bg-black/10 rounded border border-[#e8d4b8] dark:border-[#6b5a4a] text-[11px] text-gray-700 dark:text-gray-300"
              >
                {type}: {count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Loading Skeleton ---

function ProgressSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[#f5ede3] dark:bg-[#3d3628] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-4">
            <div className="h-3 w-20 bg-[#e8d4b8] dark:bg-[#6b5a4a] rounded mb-3" />
            <div className="h-7 w-16 bg-[#e8d4b8] dark:bg-[#6b5a4a] rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-[#f5ede3] dark:bg-[#3d3628] border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg p-4 h-64" />
        ))}
      </div>
    </div>
  );
}

// --- Main Component ---

type ProgressNavTarget = "sessions" | "ratings" | "courseware";

export function StudentProgressDrawer({
  studentId,
  onNavigateTab,
}: {
  studentId: number;
  onNavigateTab: (tab: ProgressNavTarget) => void;
}) {
  const { data: progress, error, isLoading } = useStudentProgress(studentId);

  if (isLoading) {
    return <ProgressSkeleton />;
  }

  if (error) {
    return (
      <StickyNote color="pink" className="mx-auto max-w-md">
        <p className="text-sm">Failed to load progress data. Please try again later.</p>
      </StickyNote>
    );
  }

  if (!progress) {
    return <ProgressSkeleton />;
  }

  const { attendance, ratings, exercises, enrollment_timeline, contacts, monthly_activity } = progress;

  // Consolidated empty state for brand new students
  const isNewStudent = attendance.total_past_sessions === 0 && exercises.total === 0 && enrollment_timeline.length === 0;
  if (isNewStudent) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <MessageSquare className="w-10 h-10 text-[#d4a574] mb-3" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No progress data yet</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Progress will appear here once sessions are recorded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          icon={CheckCircle2}
          label="Attendance"
          value={`${attendance.attendance_rate}%`}
          subtitle={`${attendance.attended} attended, ${attendance.no_show} no-show${attendance.no_show !== 1 ? "s" : ""}`}
          color={ATTENDANCE_COLORS.attended}
          delta={attendance.recent_rate != null && attendance.previous_rate != null
            ? <DeltaBadge delta={Math.round((attendance.recent_rate - attendance.previous_rate) * 10) / 10} format={(v) => `${v}%`} />
            : undefined}
          onClick={() => onNavigateTab("sessions")}
        />
        <SummaryCard
          icon={Star}
          label="Avg Rating"
          value={ratings.overall_avg > 0 ? ratings.overall_avg.toFixed(1) : "-"}
          subtitle={ratings.total_rated > 0 ? `${ratings.total_rated} rated sessions` : "No ratings yet"}
          color={CHART_COLORS.rating}
          delta={ratings.recent_avg != null && ratings.overall_avg > 0
            ? <DeltaBadge delta={Math.round((ratings.recent_avg - ratings.overall_avg) * 100) / 100} format={(v) => v.toFixed(1)} />
            : undefined}
          onClick={() => onNavigateTab("ratings")}
        />
        <SummaryCard
          icon={Calendar}
          label="Total Sessions"
          value={attendance.total_past_sessions}
          subtitle={`${attendance.no_show} no-show${attendance.no_show !== 1 ? "s" : ""}`}
          color={CHART_COLORS.sessions}
          onClick={() => onNavigateTab("sessions")}
        />
        <SummaryCard
          icon={PenTool}
          label="Exercises"
          value={exercises.total}
          subtitle={`${exercises.classwork} CW / ${exercises.homework} HW`}
          color={CHART_COLORS.exercises}
          onClick={() => onNavigateTab("courseware")}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartSection title="Attendance Breakdown">
          <AttendanceDonut data={attendance} />
        </ChartSection>
        <ChartSection title="Rating Trend">
          <RatingTrendChart data={ratings} />
        </ChartSection>
      </div>

      {/* Monthly Activity */}
      <ChartSection title="Monthly Activity (Last 12 Months)">
        <MonthlyActivityChart data={monthly_activity} />
      </ChartSection>

      {/* Bottom Row: Timeline + Contacts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartSection title="Enrollment History">
          <EnrollmentTimelineList data={enrollment_timeline} />
        </ChartSection>
        <ChartSection title="Parent Contact Summary">
          <ContactSummaryCard data={contacts} />
        </ChartSection>
      </div>
    </div>
  );
}
