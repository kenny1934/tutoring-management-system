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
          Lifecycle board for prospective students going through an assessment.
          Cards move left-to-right as the parent commits or drops out. Same
          shape as CSM's Trial page but with assessment-specific fields:
          assessed score, follow-up due date, conversion outcome.
        </p>
      </div>
      <Suspense fallback={null}>
        <AssessmentKanban />
      </Suspense>
    </div>
  );
}
