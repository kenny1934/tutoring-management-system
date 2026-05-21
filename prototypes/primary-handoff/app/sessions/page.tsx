import { Suspense } from "react";
import { SessionsApp } from "@/components/sessions/SessionsApp";

export default function SessionsPage() {
  return (
    <Suspense fallback={null}>
      <SessionsApp />
    </Suspense>
  );
}
