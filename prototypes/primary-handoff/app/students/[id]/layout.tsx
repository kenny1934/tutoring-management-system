import { StudentDetailShell } from "@/components/students/StudentDetailShell";

export default function StudentDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StudentDetailShell>{children}</StudentDetailShell>;
}
