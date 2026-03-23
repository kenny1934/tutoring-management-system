import { SummerLayoutInner } from "@/components/summer/SummerLayoutInner";

export const metadata = {
  title: "Summer Course | MathConcept Secondary Academy",
  icons: { icon: "/favicon-secondary.png" },
};

export default function SummerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SummerLayoutInner>{children}</SummerLayoutInner>;
}
