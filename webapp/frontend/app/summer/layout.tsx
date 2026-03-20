import { SummerHeader } from "@/components/summer/SummerHeader";
import { SummerFooter } from "@/components/summer/SummerFooter";

export const metadata = {
  title: "Summer Course | MathConcept Secondary Academy",
  icons: { icon: "/favicon-secondary.png" },
};

export default function SummerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="summer-light min-h-screen flex flex-col bg-background text-foreground">
      <SummerHeader />
      <main className="flex-1 w-full mx-auto px-4 sm:px-8 py-8">
        {children}
      </main>
      <SummerFooter />
    </div>
  );
}
