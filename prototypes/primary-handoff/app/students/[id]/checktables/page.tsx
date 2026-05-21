import { Suspense } from "react";
import { StudentChecktablesTab } from "@/components/students/StudentChecktablesTab";

export default function StudentChecktablesPage() {
  return (
    <Suspense fallback={null}>
      <StudentChecktablesTab />
    </Suspense>
  );
}
