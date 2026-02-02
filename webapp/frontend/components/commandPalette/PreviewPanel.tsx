import {
  User,
  Calendar,
  BookOpen,
  Clock,
  Phone,
  MapPin,
  HandCoins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getGradeColor } from "@/lib/constants";
import { getSessionStatusConfig } from "@/lib/session-status";
import { getPaymentStatusConfig } from "@/lib/enrollment-utils";
import { HelpTopic } from "./types";

// Preview panel skeleton
export function PreviewSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-4 w-24 bg-[#e8d4b8] dark:bg-[#3d3628] rounded" />
      <div className="h-5 w-32 bg-[#e8d4b8] dark:bg-[#3d3628] rounded" />
      <div className="flex gap-2">
        <div className="h-5 w-12 bg-[#e8d4b8] dark:bg-[#3d3628] rounded" />
        <div className="h-5 w-16 bg-[#e8d4b8] dark:bg-[#3d3628] rounded" />
      </div>
      <div className="h-4 w-28 bg-[#e8d4b8] dark:bg-[#3d3628] rounded" />
    </div>
  );
}

// Help preview component
export function HelpPreview({ topic }: { topic: HelpTopic }) {
  return (
    <div className="space-y-3">
      <div className="font-semibold text-[#5d4a3a] dark:text-[#d4c4b0]">
        {topic.title}
      </div>
      <div className="space-y-2">
        {topic.content.map((item, idx) => (
          <div key={idx} className="flex gap-3 text-xs">
            <span className="font-mono text-[#a0704b] dark:text-[#cd853f] shrink-0 w-20">
              {item.label}
            </span>
            <span className="text-[#5d4a3a] dark:text-[#d4c4b0]">
              {item.desc}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Preview content component following app-wide display patterns
export function PreviewContent({ data }: { data: { type: string; data: any } | null }) {
  if (!data) return null;

  // Help topic preview
  if (data.type === 'help') {
    return <HelpPreview topic={data.data} />;
  }

  // Student preview - follows StudentDetailPopover pattern
  if (data.type === 'student') {
    const s = data.data;
    return (
      <div className="space-y-3">
        {/* ID - monospace, small, gray (consistent with StudentInfoBadges) */}
        {s.school_student_id && (
          <div className="text-[10px] font-mono text-[#8b7355] dark:text-[#a89880]">
            {s.school_student_id}
          </div>
        )}
        {/* Name - semibold, main text */}
        <div className="font-semibold text-[#5d4a3a] dark:text-[#d4c4b0]">
          {s.student_name}
        </div>
        {/* Badges - grade with color, school with amber */}
        <div className="flex flex-wrap gap-1.5">
          {s.grade && (
            <span
              className="px-1.5 py-0.5 text-[11px] rounded text-gray-800"
              style={{ backgroundColor: getGradeColor(s.grade, s.lang_stream) }}
            >
              {s.grade}{s.lang_stream || ''}
            </span>
          )}
          {s.school && (
            <span className="px-1.5 py-0.5 text-[11px] rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200">
              {s.school}
            </span>
          )}
        </div>
        {/* Contact info with icons */}
        <div className="text-xs space-y-1.5 text-[#5d4a3a] dark:text-[#d4c4b0]">
          {s.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3 w-3 text-[#8b7355]" />
              <span>{s.phone}</span>
            </div>
          )}
          {s.home_location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3 w-3 text-[#8b7355]" />
              <span>{s.home_location}</span>
            </div>
          )}
          {s.enrollment_count !== undefined && (
            <div className="flex items-center gap-2">
              <BookOpen className="h-3 w-3 text-[#8b7355]" />
              <span>{s.enrollment_count} enrollment{s.enrollment_count !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Session preview - follows SessionDetailPopover pattern
  if (data.type === 'session') {
    const s = data.data;
    const statusConfig = getSessionStatusConfig(s.session_status);
    return (
      <div className="space-y-3">
        {/* Date/time header */}
        <div className="flex items-center gap-2 text-xs text-[#8b7355] dark:text-[#a89880]">
          <Calendar className="h-3 w-3" />
          <span>{s.session_date}</span>
          {s.time_slot && (
            <>
              <Clock className="h-3 w-3 ml-1" />
              <span>{s.time_slot}</span>
            </>
          )}
        </div>
        {/* Student info */}
        <div>
          {s.school_student_id && (
            <div className="text-[10px] font-mono text-[#8b7355] dark:text-[#a89880]">
              {s.school_student_id}
            </div>
          )}
          <div className="font-semibold text-[#5d4a3a] dark:text-[#d4c4b0]">
            {s.student_name}
          </div>
        </div>
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          {s.grade && (
            <span
              className="px-1.5 py-0.5 text-[11px] rounded text-gray-800"
              style={{ backgroundColor: getGradeColor(s.grade, s.lang_stream) }}
            >
              {s.grade}{s.lang_stream || ''}
            </span>
          )}
          {s.school && (
            <span className="px-1.5 py-0.5 text-[11px] rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200">
              {s.school}
            </span>
          )}
          {/* Status badge with color coding */}
          {s.session_status && (
            <span className={cn(
              "px-1.5 py-0.5 text-[11px] rounded",
              statusConfig.bgTint,
              statusConfig.textClass
            )}>
              {s.session_status}
            </span>
          )}
        </div>
        {/* Tutor info */}
        {s.tutor_name && (
          <div className="flex items-center gap-2 text-xs text-[#5d4a3a] dark:text-[#d4c4b0]">
            <User className="h-3 w-3 text-[#8b7355]" />
            <span>{s.tutor_name}</span>
          </div>
        )}
      </div>
    );
  }

  // Enrollment preview - follows EnrollmentDetailPopover pattern
  if (data.type === 'enrollment') {
    const e = data.data;
    const paymentConfig = getPaymentStatusConfig(e.payment_status);
    return (
      <div className="space-y-3">
        {/* Student ID and name */}
        {e.school_student_id && (
          <div className="text-[10px] font-mono text-[#8b7355] dark:text-[#a89880]">
            {e.school_student_id}
          </div>
        )}
        <div className="font-semibold text-[#5d4a3a] dark:text-[#d4c4b0]">
          {e.student_name}
        </div>
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          {e.grade && (
            <span
              className="px-1.5 py-0.5 text-[11px] rounded text-gray-800"
              style={{ backgroundColor: getGradeColor(e.grade, e.lang_stream) }}
            >
              {e.grade}{e.lang_stream || ''}
            </span>
          )}
          {e.school && (
            <span className="px-1.5 py-0.5 text-[11px] rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200">
              {e.school}
            </span>
          )}
          {/* Payment status with color coding */}
          {e.payment_status && (
            <span className={cn(
              "px-1.5 py-0.5 text-[11px] rounded",
              paymentConfig.bgTint
            )}>
              {e.payment_status}
            </span>
          )}
        </div>
        {/* Details */}
        <div className="text-xs space-y-1.5 text-[#5d4a3a] dark:text-[#d4c4b0]">
          {(e.assigned_day || e.assigned_time) && (
            <div className="flex items-center gap-2">
              <Calendar className="h-3 w-3 text-[#8b7355]" />
              <span>{e.assigned_day} {e.assigned_time}</span>
            </div>
          )}
          {e.tutor_name && (
            <div className="flex items-center gap-2">
              <User className="h-3 w-3 text-[#8b7355]" />
              <span>{e.tutor_name}</span>
            </div>
          )}
          {e.lessons_paid !== undefined && (
            <div className="flex items-center gap-2">
              <HandCoins className="h-3 w-3 text-[#8b7355]" />
              <span>{e.lessons_paid} lessons paid</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
