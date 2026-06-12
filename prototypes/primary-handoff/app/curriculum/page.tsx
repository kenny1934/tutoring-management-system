import { Suspense } from "react";
import { CoursewareBrowser } from "@/components/courseware/CoursewareBrowser";

export default function CurriculumPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">Curriculum</h1>
        <p className="text-sm text-ink-600 max-w-3xl">
          Browse the MC Drive worksheet library by product line and level. Open
          any worksheet to preview the PDF and assign it to a student's upcoming
          session.
        </p>
      </div>
      <Suspense fallback={null}>
        <CoursewareBrowser />
      </Suspense>
    </div>
  );
}
