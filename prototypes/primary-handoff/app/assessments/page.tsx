import { Suspense } from "react";
import { AssessmentKanban } from "@/components/assessments/AssessmentKanban";

export default function AssessmentsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">
          Assessment booking & follow-up
        </h1>
        <p className="text-sm text-ink-600 max-w-3xl">
          Track prospective students through each assessment stage. Move a card
          right as the parent commits, or out when they drop. Each card carries
          the assessed score, follow-up date, and conversion outcome.
        </p>
      </div>
      <Suspense fallback={null}>
        <AssessmentKanban />
      </Suspense>
    </div>
  );
}
