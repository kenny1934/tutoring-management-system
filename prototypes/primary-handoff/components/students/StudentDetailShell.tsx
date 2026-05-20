"use client";

import { notFound, useParams } from "next/navigation";
import { usePrimaryStore } from "@/lib/store/PrimaryStore";
import { DEMO_DAY } from "@/lib/mock-data/sessions";
import { StudentDetailHeader } from "./StudentDetailHeader";
import { StudentTabStrip } from "./StudentTabStrip";
import { getPendingCount } from "./student-utils";

export function StudentDetailShell({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const { students, sessions, assignments } = usePrimaryStore();
  const student = students.find((s) => s.id === id);
  if (!student) {
    notFound();
  }

  const sessionCount = sessions.filter((s) => s.student_id === student.id).length;
  const pending = getPendingCount(student.id, assignments);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "sessions", label: "Sessions", count: sessionCount },
    { id: "checktables", label: "Checktables", count: pending },
    { id: "performance", label: "Performance" },
    { id: "assessments", label: "Assessments" },
    { id: "parent-comms", label: "Parent comms" },
    { id: "history", label: "History" },
  ];

  return (
    <div className="space-y-4">
      <StudentDetailHeader
        student={student}
        sessions={sessions}
        assignments={assignments}
        todayIso={DEMO_DAY}
      />
      <StudentTabStrip studentId={student.id} tabs={tabs} />
      {children}
    </div>
  );
}
