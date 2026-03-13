"use client";

import { useMemo, useState, useCallback } from "react";
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
  FileText,
  Sparkles,
  Loader2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudentProgress } from "@/lib/hooks";
import { formatShortDate } from "@/lib/formatters";
import { StickyNote } from "@/lib/design-system";
import { Tooltip as UITooltip } from "@/components/ui/tooltip";
import { getMethodIcon, getContactTypeIcon, getContactTypeColor } from "@/components/parent-contacts/contact-utils";
import { Modal } from "@/components/ui/modal";
import { useCooldown } from "@/lib/ui-hooks";
import { type ReportMode, type ReportSectionToggles } from "./ProgressReport";
import { studentsAPI } from "@/lib/api";
import { ATTENDANCE_COLORS, CHART_COLORS, DATA_KEY_LABELS, formatMonthLabel } from "@/lib/progress-constants";
import type { StudentProgress, MonthlyActivity } from "@/types";

// --- Trend Delta Badge ---

function DeltaBadge({ delta, format, tooltip }: { delta: number; format: (v: number) => string; tooltip?: string }) {
  if (delta === 0) return null;
  const isUp = delta > 0;
  const badge = (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
      isUp ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
    )}>
      {isUp ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
      {format(Math.abs(delta))}
    </span>
  );
  if (tooltip) return <UITooltip content={tooltip}>{badge}</UITooltip>;
  return badge;
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
    ];
    return items.filter((d) => d.value > 0);
  }, [data.attended, data.no_show, data.rescheduled]);

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

function EnrollmentTimelineList({ data, onViewAll }: { data: StudentProgress["enrollment_timeline"]; onViewAll?: () => void }) {
  if (data.length === 0) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
        No enrollments found
      </div>
    );
  }

  const displayed = data.slice(0, 2);
  const hasMore = data.length > 2;

  return (
    <div className="space-y-0">
      {displayed.map((e, i) => (
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
            {i < displayed.length - 1 && (
              <div className="w-px flex-1 bg-[#e8d4b8] dark:bg-[#6b5a4a]" />
            )}
          </div>
          {/* Content */}
          <div className="pb-4 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {e.tutor_name && (
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{e.tutor_name}</span>
              )}
              {e.enrollment_type && (
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-medium",
                  e.enrollment_type === "Trial"
                    ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
                    : e.enrollment_type === "One-Time"
                      ? "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300"
                      : "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
                )}>
                  {e.enrollment_type}
                </span>
              )}
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium",
                e.payment_status === "Paid"
                  ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300"
                  : e.payment_status === "Cancelled"
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                    : e.payment_status === "Overdue"
                      ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300"
                      : "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
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
      {hasMore && onViewAll && (
        <button
          onClick={onViewAll}
          className="text-xs text-[#a0704b] hover:text-[#8b6140] font-medium mt-1 transition-colors"
        >
          View all {data.length} enrollments →
        </button>
      )}
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
                className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white/50 dark:bg-black/10 rounded border border-[#e8d4b8] dark:border-[#6b5a4a] text-[11px] text-gray-700 dark:text-gray-300"
              >
                {getMethodIcon(method, "h-3 w-3")}
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
                className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium", getContactTypeColor(type))}
              >
                {getContactTypeIcon(type, "h-2.5 w-2.5")}
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

// --- Report Config ---

type DatePreset = "1m" | "3m" | "6m" | "12m" | "enrollment" | "custom";

function getPresetDates(preset: DatePreset, enrollmentStart?: string | null): { start?: string; end?: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const end = fmt(today);

  switch (preset) {
    case "1m": {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 1);
      return { start: fmt(d), end };
    }
    case "3m": {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 3);
      return { start: fmt(d), end };
    }
    case "6m": {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 6);
      return { start: fmt(d), end };
    }
    case "12m": {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 12);
      return { start: fmt(d), end };
    }
    case "enrollment":
      return enrollmentStart ? { start: enrollmentStart, end } : {};
    case "custom":
      return {};
  }
}

type SectionKey = keyof ReportSectionToggles;

const SECTION_TOGGLES: readonly { key: SectionKey; label: string; ai?: boolean; modes?: ReportMode[] }[] = [
  { key: "showAttendance", label: "Attendance", modes: ["internal"] },
  { key: "showRating", label: "Rating" },
  { key: "showConceptMap", label: "Concept Map", ai: true },
  { key: "showTopics", label: "Topics Covered" },
  { key: "showTests", label: "Tests & Exams" },
  { key: "showActivity", label: "Monthly Activity" },
  { key: "showEnrollment", label: "Enrollment History" },
  { key: "showContacts", label: "Contact Summary", modes: ["internal"] },
];

export const DEFAULT_SECTIONS: ReportSectionToggles = {
  showAttendance: true,
  showRating: true,
  showConceptMap: false,
  showTopics: true,
  showTests: true,
  showActivity: true,
  showEnrollment: true,
  showContacts: true,
};

function ReportConfigButton({ studentId, enrollmentStart }: { studentId: number; enrollmentStart?: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ReportMode>("parent");
  const [preset, setPreset] = useState<DatePreset>("1m");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [comment, setComment] = useState("");
  const [language, setLanguage] = useState<"en" | "zh-hant">("en");
  const [narrative, setNarrative] = useState("");
  const [aiInsights, setAiInsights] = useState<Record<string, unknown> | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isCoolingDown, triggerCooldown] = useCooldown(5000);
  const [aiError, setAiError] = useState("");
  const [sections, setSections] = useState<ReportSectionToggles>(DEFAULT_SECTIONS);

  const toggleSection = useCallback((key: SectionKey) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleGenerateAI = useCallback(async () => {
    setIsGeneratingAI(true);
    setAiError("");
    try {
      const dates = preset === "custom"
        ? { start: customStart || undefined, end: customEnd || undefined }
        : getPresetDates(preset, enrollmentStart);
      const progress = await studentsAPI.getProgress(studentId, dates.start, dates.end, true, language, true);
      if (progress.insights) {
        if (progress.insights.narrative) setNarrative(progress.insights.narrative);
        setAiInsights(progress.insights as Record<string, unknown>);
        if (progress.insights.concept_nodes?.length) {
          setSections((prev) => ({ ...prev, showConceptMap: true }));
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate AI insights";
      setAiError(msg);
      console.error("Failed to generate AI insights:", err);
    } finally {
      setIsGeneratingAI(false);
      triggerCooldown();
    }
  }, [studentId, preset, customStart, customEnd, enrollmentStart, language]);

  const handleGenerate = useCallback(() => {
    const params = new URLSearchParams();
    params.set("mode", mode);
    params.set("print", "1");

    const dates = preset === "custom"
      ? { start: customStart || undefined, end: customEnd || undefined }
      : getPresetDates(preset, enrollmentStart);

    if (dates.start) params.set("startDate", dates.start);
    if (dates.end) params.set("endDate", dates.end);

    if (comment.trim()) {
      const key = crypto.randomUUID();
      localStorage.setItem(`report-comment-${key}`, comment.trim());
      params.set("commentKey", key);
    }

    // Store insights: full AI insights if available, or just manual narrative
    if (narrative.trim() || aiInsights) {
      const insightsKey = crypto.randomUUID();
      const stored = aiInsights
        ? { ...aiInsights, narrative: narrative.trim() }
        : { narrative: narrative.trim() };
      localStorage.setItem(`report-insights-${insightsKey}`, JSON.stringify(stored));
      params.set("insightsKey", insightsKey);
    }

    if (language !== "en") params.set("language", language);

    // Section toggles — opt-out convention (write "0" for unchecked)
    for (const { key, modes } of SECTION_TOGGLES) {
      if (!modes || modes.includes(mode)) {
        if (!sections[key]) params.set(key, "0");
      }
    }

    window.open(`/students/${studentId}/report?${params}`, "_blank");
    setIsOpen(false);
  }, [studentId, mode, preset, customStart, customEnd, comment, narrative, aiInsights, language, enrollmentStart, sections]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-[#a0704b] text-white hover:bg-[#8b6140] transition-colors"
      >
        <FileText className="w-3.5 h-3.5" />
        Generate Report
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Report Settings"
        size="sm"
        footer={
          <button
            onClick={handleGenerate}
            className="w-full flex items-center justify-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-[#a0704b] text-white hover:bg-[#8b6140] transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Generate Report
          </button>
        }
      >
        <div className="space-y-3">
          {/* Mode toggle */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Report Type</label>
            <div className="flex rounded-lg overflow-hidden border border-[#e8d4b8] dark:border-[#6b5a4a]">
              {(["internal", "parent"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex-1 text-xs py-1.5 font-medium transition-colors capitalize",
                    mode === m
                      ? "bg-[#a0704b] text-white"
                      : "bg-white dark:bg-[#2d2618] text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                  )}
                >
                  {m === "parent" ? "For Parents" : "Internal"}
                </button>
              ))}
            </div>
          </div>

          {/* AI Generation */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
              AI Content <span className="text-gray-400 dark:text-gray-500">(optional)</span>
            </label>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5">
              Generates a learning summary and concept map from student data.
            </p>
            <div className="flex items-center gap-2">
              <div className="flex rounded-md overflow-hidden border border-[#e8d4b8] dark:border-[#6b5a4a]">
                {([["en", "EN"], ["zh-hant", "中文"]] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => { setLanguage(val); setAiInsights(null); }}
                    className={cn(
                      "text-[10px] px-2 py-1 font-medium transition-colors",
                      language === val
                        ? "bg-[#a0704b] text-white"
                        : "bg-white dark:bg-[#2d2618] text-gray-500 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628]"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={handleGenerateAI}
                disabled={isGeneratingAI || isCoolingDown}
                className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md border border-[#e8d4b8] dark:border-[#6b5a4a] text-gray-600 dark:text-gray-400 hover:bg-[#f5ede3] dark:hover:bg-[#3d3628] transition-colors disabled:opacity-50"
              >
                {isGeneratingAI ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Generating...
                  </>
                ) : isCoolingDown ? (
                  <>
                    <Check className="w-3 h-3 text-green-600" />
                    Generated
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3" />
                    Generate with AI
                  </>
                )}
              </button>
            </div>
            {aiError && (
              <p className="text-[10px] text-red-500 mt-1">{aiError}</p>
            )}
          </div>

          {/* Learning Summary */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
              Learning Summary <span className="text-gray-400 dark:text-gray-500">(optional)</span>
            </label>
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Write a summary or use AI to generate one..."
              rows={3}
              className="w-full text-xs border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg px-2.5 py-1.5 bg-white dark:bg-[#2d2618] text-gray-700 dark:text-gray-300 placeholder-gray-400 resize-none"
            />
          </div>

          {/* Section toggles */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">Sections to Include</label>
            <div className="space-y-1.5">
              {SECTION_TOGGLES
                .filter(({ modes }) => !modes || modes.includes(mode))
                .map(({ key, label, ai }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sections[key]}
                      onChange={() => toggleSection(key)}
                      className="rounded border-gray-300 text-[#a0704b] focus:ring-[#a0704b]"
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                      {label}
                      {ai && <Sparkles className="w-3 h-3 text-amber-500" />}
                    </span>
                  </label>
                ))}
            </div>
          </div>

          {/* Date range */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Date Range</label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as DatePreset)}
              className="w-full text-xs border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg px-2.5 py-1.5 bg-white dark:bg-[#2d2618] text-gray-700 dark:text-gray-300"
            >
              <option value="1m">Last month</option>
              <option value="3m">Last 3 months</option>
              <option value="6m">Last 6 months</option>
              <option value="12m">Last 12 months</option>
              {enrollmentStart && <option value="enrollment">This enrollment</option>}
              <option value="custom">Custom range</option>
            </select>
            {preset === "custom" && (
              <div className="flex gap-2 mt-1.5">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="flex-1 text-xs border border-[#e8d4b8] dark:border-[#6b5a4a] rounded px-2 py-1 bg-white dark:bg-[#2d2618] text-gray-700 dark:text-gray-300"
                />
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="flex-1 text-xs border border-[#e8d4b8] dark:border-[#6b5a4a] rounded px-2 py-1 bg-white dark:bg-[#2d2618] text-gray-700 dark:text-gray-300"
                />
              </div>
            )}
          </div>

          {/* Tutor comment */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
              Tutor Comment <span className="text-gray-400 dark:text-gray-500">(optional)</span>
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add observations or recommendations..."
              rows={3}
              className="w-full text-xs border border-[#e8d4b8] dark:border-[#6b5a4a] rounded-lg px-2.5 py-1.5 bg-white dark:bg-[#2d2618] text-gray-700 dark:text-gray-300 placeholder-gray-400 resize-none"
            />
          </div>
        </div>
      </Modal>
    </>
  );
}

// --- Main Component ---

type ProgressNavTarget = "sessions" | "ratings" | "courseware" | "profile";

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

  // Find most recent enrollment start date for "This enrollment" preset
  const latestEnrollmentStart = enrollment_timeline[0]?.first_lesson_date || null;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Overview</h3>
        <ReportConfigButton studentId={studentId} enrollmentStart={latestEnrollmentStart} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          icon={CheckCircle2}
          label="Attendance"
          value={`${attendance.attendance_rate}%`}
          subtitle={`${attendance.attended} attended, ${attendance.no_show} no-show${attendance.no_show !== 1 ? "s" : ""}`}
          color={ATTENDANCE_COLORS.attended}
          delta={attendance.recent_rate != null && attendance.previous_rate != null
            ? <DeltaBadge
                delta={Math.round((attendance.recent_rate - attendance.previous_rate) * 10) / 10}
                format={(v) => `${v}%`}
                tooltip={`Last 30 days: ${attendance.recent_rate}% vs previous 30 days: ${attendance.previous_rate}%`}
              />
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
            ? <DeltaBadge
                delta={Math.round((ratings.recent_avg - ratings.overall_avg) * 100) / 100}
                format={(v) => v.toFixed(1)}
                tooltip={`Last 30 days: ${ratings.recent_avg.toFixed(1)} vs overall: ${ratings.overall_avg.toFixed(1)}`}
              />
            : undefined}
          onClick={() => onNavigateTab("ratings")}
        />
        <SummaryCard
          icon={Calendar}
          label="Total Sessions"
          value={attendance.attended + attendance.no_show}
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
          <EnrollmentTimelineList data={enrollment_timeline} onViewAll={() => onNavigateTab("profile")} />
        </ChartSection>
        <ChartSection title="Parent Contact Summary">
          <ContactSummaryCard data={contacts} />
        </ChartSection>
      </div>
    </div>
  );
}
