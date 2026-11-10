"use client";

import { ArrowLeft, BookOpen, ChevronDown, TrendingUp } from "lucide-react";
import { IconButton } from "@/components/controls";
import { GradeBadge } from "@/components/ui/grade-label";
import { StudentParticipation } from "./StudentParticipation";
import type { Student } from "@/types";
import styles from "@/components/material/MaterialWorkspace.module.css";

type Identity = Pick<Student, "id" | "student_name" | "school_student_id" | "grade" | "lang_stream" | "school">;
export function StudentRecordHeader({ student, enrollments, progressOpen, onBack, onProgress }: {
  student: Identity; enrollments: number; progressOpen: boolean; onBack: () => void; onProgress: () => void;
}) {
  return <header className={styles.materialRecordHeader}>
    <IconButton label="Back" icon={ArrowLeft} onClick={onBack} />
    <div className={styles.materialRecordIdentity}>
      <div className={styles.materialRecordName}>
        <h1>{student.student_name}</h1>
        {student.grade && <GradeBadge className="text-xs px-2 py-0.5 rounded text-gray-800" grade={student.grade} langStream={student.lang_stream} />}
        {student.school && <span className="text-xs px-2 py-0.5 rounded bg-wash text-ink-strong">{student.school}</span>}
      </div>
      <div className={styles.materialRecordMeta}>
        <span>{student.school_student_id || `#${student.id}`}</span>
      <span className="flex items-center gap-1.5 text-xs text-ink-subtle"><BookOpen size={14} />{enrollments} enrollment{enrollments !== 1 ? "s" : ""}</span>
        <StudentParticipation studentId={student.id} />
      </div>
    </div>
    <div className={styles.materialRecordActions}>
      <button type="button" onClick={onProgress} aria-label="Progress" aria-expanded={progressOpen} className="flex items-center gap-1.5 min-h-10 px-2 text-sm text-accent-ink rounded hover:bg-wash">
        <TrendingUp size={15} /><span className="hidden sm:inline">Progress</span><ChevronDown size={15} style={{ rotate: progressOpen ? "180deg" : "0deg", transition: "rotate 180ms" }} />
      </button>
    </div>
  </header>;
}
