"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function RegularHeader() {
  const pathname = usePathname();

  const isPublicPage =
    pathname.startsWith("/regular/apply") ||
    pathname.startsWith("/regular/status");

  // Public apply / status pages get the brand bar: the parent MathConcept
  // mark on a white chip (the primary wordmark uses black + red on a
  // transparent background, so on the red header it needs a white chip to
  // read cleanly) next to the Secondary Academy bilingual title. The bar
  // keeps the summer treatment — red band with a gold accent line — but the
  // seasonal date-callout imagery is dropped; regular is evergreen.
  if (isPublicPage) {
    return (
      <header
        className="no-image-save relative z-50 shadow-md border-b border-[#8a0a18] bg-[#A40C1D]"
        onContextMenu={(e) => {
          if (e.target instanceof HTMLImageElement) e.preventDefault();
        }}
      >
        <div className="mx-auto px-4 sm:px-8 h-14 flex items-center gap-3">
          <a
            href="https://mathconcept.com.mo/regular-courses/secondary-school/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="MathConcept"
            className="inline-flex items-center hover:brightness-110 transition-[filter] shrink-0"
          >
            <span className="inline-flex items-center justify-center bg-white rounded-md px-2 py-1 shadow-sm brightness-90">
              <Image
                src="/logo-mathconcept.png"
                alt="MathConcept"
                width={1536}
                height={410}
                className="h-7 md:h-9 w-auto"
                draggable={false}
                priority
              />
            </span>
          </a>
          <div className="text-white leading-tight min-w-0">
            <div className="font-bold text-sm sm:text-base truncate">
              中學教室
              <span className="hidden sm:inline"> MathConcept Secondary Academy</span>
              <span className="sm:hidden"> MC Secondary</span>
            </div>
            <div className="text-[11px] sm:text-xs text-white/85 truncate">
              常規課程 Regular Course
            </div>
          </div>
        </div>
        {/* Gold accent line — softens the hard bottom edge of the red bar. */}
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-[#F5C518]/80 to-transparent" />
      </header>
    );
  }

  return (
    <header className="bg-card border-b border-border shadow-sm relative z-50">
      <div className="mx-auto px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/logo-secondary.png"
            alt="MathConcept Secondary Academy"
            width={36}
            height={36}
            className="h-9 w-auto dark:hidden"
          />
          <Image
            src="/logo-secondary-dark.png"
            alt="MathConcept Secondary Academy"
            width={36}
            height={36}
            className="h-9 w-auto hidden dark:block"
          />
          <div>
            <div className="font-bold text-lg leading-tight text-foreground">
              <span className="hidden sm:inline">MathConcept Secondary Academy</span>
              <span className="sm:hidden">MC Secondary</span>
            </div>
            <div className="text-xs text-muted-foreground">中學教室</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle compact />
          <a
            href="/regular/apply"
            className="hidden sm:inline text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            Regular Application &rarr;
          </a>
        </div>
      </div>
    </header>
  );
}
