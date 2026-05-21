import { StudentDetailShell } from "@/components/students/StudentDetailShell";
import { students } from "@/lib/mock-data/students";

export function generateStaticParams() {
  return students.map((s) => ({ id: s.id }));
}

export default function StudentDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StudentDetailShell>{children}</StudentDetailShell>;
}
