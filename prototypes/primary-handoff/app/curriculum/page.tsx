import { Suspense } from "react";
import { CoursewareBrowser } from "@/components/courseware/CoursewareBrowser";

export default function CurriculumPage() {
  return (
    // No description blurb under the title: the browser's own meta line says
    // what clicking a code does, and every pixel above the plan matrix costs
    // visible rows.
    <div className="space-y-3">
      <h1 className="text-lg font-semibold text-ink-900">Curriculum</h1>
      <Suspense fallback={null}>
        <CoursewareBrowser />
      </Suspense>
    </div>
  );
}
