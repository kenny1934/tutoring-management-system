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
    <div>
      {/* Identity + tabs stay pinned so you can always see which student you're
       *  assigning work to while scrolling a long checktable. Full-bleed bg
       *  (negative margins cancel the main padding) lets content scroll cleanly
       *  underneath; offset below the mobile nav bar on small screens. */}
      <div className="sticky top-[52px] lg:top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-1 space-y-3 bg-ink-50/95 backdrop-blur-sm shadow-sm">
        <StudentDetailHeader
          student={student}
          sessions={sessions}
          assignments={assignments}
          todayIso={DEMO_DAY}
        />
        <StudentTabStrip studentId={student.id} tabs={tabs} />
      </div>
      <div className="pt-4">{children}</div>
    </div>
  );
}
