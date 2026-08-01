import { RegularHeader } from "@/components/regular/RegularHeader";
import { SummerFooter } from "@/components/summer/SummerFooter";

export const metadata = {
  title: "Regular Course | MathConcept Secondary Academy",
};

// Unlike the summer tree there are no prospect/buddy sub-surfaces here, so
// the parent-facing light theme applies unconditionally and the layout can
// stay a server component. The summer-light theme class is reused as-is so
// the styling carries over.
export default function RegularLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="summer-light min-h-screen flex flex-col bg-background text-foreground">
      <RegularHeader />
      <main className="flex-1 w-full mx-auto px-4 sm:px-8 py-8">
        {children}
      </main>
      <SummerFooter />
    </div>
  );
}
