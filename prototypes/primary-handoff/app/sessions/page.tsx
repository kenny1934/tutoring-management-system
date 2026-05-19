import { SessionsApp } from "@/components/sessions/SessionsApp";
import { sessions } from "@/lib/mock-data/sessions";
import { students } from "@/lib/mock-data/students";
import { checktables } from "@/lib/mock-data/checktables";

export default function SessionsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">
          Sessions, reschedule, makeup
        </h1>
        <p className="text-sm text-ink-600 max-w-3xl">
          A tutor's session list for the day. Each row records attendance,
          per-student CW/HW exercise items, and a performance rating. CW and
          HW buttons open a recorder that pulls items straight from the active
          checktable, so the assignment is captured in both the session and
          the student's checktable history. Absent or late students get a
          one-click makeup scheduler with suggested slots.
        </p>
      </div>
      <SessionsApp
        sessions={sessions}
        students={students}
        checktables={checktables}
      />
    </div>
  );
}
