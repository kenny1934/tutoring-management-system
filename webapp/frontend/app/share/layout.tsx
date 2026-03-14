import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Progress Report",
  icons: { icon: "data:," },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
