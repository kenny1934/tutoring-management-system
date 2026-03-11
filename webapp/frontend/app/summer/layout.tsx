import { SummerHeader } from "@/components/summer/SummerHeader";
import { SummerFooter } from "@/components/summer/SummerFooter";

export const metadata = {
  title: "Summer Course | MathConcept Secondary Academy",
};

export default function SummerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SummerHeader />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-8">
        {children}
      </main>
      <SummerFooter />
    </div>
  );
}
