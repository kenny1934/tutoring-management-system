"use client";

import type { ReactNode } from "react";
import { PrimaryStoreProvider } from "@/lib/store/PrimaryStore";

export function Providers({ children }: { children: ReactNode }) {
  return <PrimaryStoreProvider>{children}</PrimaryStoreProvider>;
}
