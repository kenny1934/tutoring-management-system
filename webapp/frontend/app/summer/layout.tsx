import { SummerLayoutInner } from "@/components/summer/SummerLayoutInner";

export const metadata = {
  title: "Summer Course | MathConcept Secondary Academy",
};

export default function SummerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SummerLayoutInner>{children}</SummerLayoutInner>;
}
