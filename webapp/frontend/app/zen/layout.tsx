import { ReactNode } from "react";
import { ZenGuard, ZenLayout } from "@/components/zen";
import { ZenSessionProvider } from "@/contexts/ZenSessionContext";

export default function ZenRootLayout({ children }: { children: ReactNode }) {
  return (
    <ZenGuard>
      <ZenSessionProvider>
        <ZenLayout>{children}</ZenLayout>
      </ZenSessionProvider>
    </ZenGuard>
  );
}
