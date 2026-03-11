export function SummerFooter() {
  return (
    <footer className="bg-card border-t border-border py-4 text-center text-xs text-muted-foreground">
      <div className="max-w-2xl mx-auto px-4">
        &copy; {new Date().getFullYear()} MathConcept Secondary Academy
      </div>
    </footer>
  );
}
