import { ReactNode } from "react";
import { ZenGuard, ZenLayout } from "@/components/zen";

export default function ZenRootLayout({ children }: { children: ReactNode }) {
  return (
    <ZenGuard>
      <ZenLayout>{children}</ZenLayout>
    </ZenGuard>
  );
}
