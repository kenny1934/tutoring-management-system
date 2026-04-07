"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function SummerHeader() {
  const pathname = usePathname();
  const [summerApplyHref, setSummerApplyHref] = useState("/summer/apply");
  const [isProspectSubdomain, setIsProspectSubdomain] = useState(false);

  useEffect(() => {
    const host = window.location.hostname;
    if (host.startsWith("prospect.")) {
      setIsProspectSubdomain(true);
      setSummerApplyHref(`${window.location.protocol}//${host.replace("prospect.", "summer.")}/`);
    }
  }, []);

  const isBuddyPage = pathname.startsWith("/summer/buddy") ||
    (typeof window !== 'undefined' && window.location.hostname.startsWith('buddy.'));
  const isPublicPage = pathname.startsWith("/summer/apply") || pathname.startsWith("/summer/status");
  const isInternalPage = isProspectSubdomain || isBuddyPage || !isPublicPage;

  // On the public apply / status pages the original marketing banner is split
  // into two tightly-cropped pieces: the brand emblem (MC logo + 中學教室 /
  // Secondary Academy) and the date callout (暑期中學班 7月5日正式開課 ·
  // Secondary Summer Class · Starting on 5th July). On mobile they stack
  // vertically (brand on top, date below) so phone users still get the full
  // marketing experience; on md+ they sit side-by-side. The bar uses a subtle
  // vertical gradient and a gold accent line at the bottom to soften the
  // flat-red harshness while staying true to the brand palette.
  if (isPublicPage && !isBuddyPage) {
    return (
      <header
        className="relative z-50 shadow-md border-b border-[#8a0a18] bg-[#A40C1D]"
      >
        <div className="mx-auto px-4 sm:px-8 py-2 md:h-14 md:py-0 flex flex-col md:flex-row items-center md:justify-between gap-1.5 md:gap-3">
          <Image
            src="/summer/summer-banner-brand.jpg"
            alt="MathConcept Secondary Academy 中學教室"
            width={2329}
            height={507}
            className="h-9 md:h-full w-auto md:py-1.5 shrink-0 brightness-90"
            priority
          />
          <Image
            src="/summer/summer-banner-date.jpg"
            alt="暑期中學班 7月5日正式開課 · Secondary Summer Class Starting on 5th July"
            width={6326}
            height={796}
            className="h-6 md:h-full w-auto md:py-1.5 shrink-0 brightness-90"
            priority
          />
        </div>
        {/* Gold accent line — picks up the yellow from the pamphlet slogan
            and softens the hard bottom edge of the red bar. */}
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-[#F5C518]/80 to-transparent" />
      </header>
    );
  }

  return (
    <header className="bg-card border-b border-border shadow-sm relative z-50">
      <div className="mx-auto px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isBuddyPage ? (
            <a href="https://mathconcept.com.mo" target="_blank" rel="noopener noreferrer">
              <Image
                src="/logo-mathconcept.png"
                alt="MathConcept"
                width={180}
                height={48}
                className="h-9 w-auto dark:drop-shadow-[0_0_3px_rgba(255,255,255,1)] dark:contrast-125"
              />
            </a>
          ) : (
            <>
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
            </>
          )}
          {!isBuddyPage && (
            <div>
              <div className="font-bold text-lg leading-tight text-foreground">
                <span className="hidden sm:inline">MathConcept Secondary Academy</span>
                <span className="sm:hidden">MC Secondary</span>
              </div>
              <div className="text-xs text-muted-foreground">中學教室</div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isInternalPage && <ThemeToggle compact />}
          {isInternalPage && !isBuddyPage && (
            <a
              href={summerApplyHref}
              className="hidden sm:inline text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Summer Application &rarr;
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
