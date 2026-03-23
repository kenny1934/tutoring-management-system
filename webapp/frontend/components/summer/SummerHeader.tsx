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

  const isPublicPage = pathname.startsWith("/summer/apply") || pathname.startsWith("/summer/status");
  const isInternalPage = isProspectSubdomain || !isPublicPage;

  return (
    <header className="bg-card border-b border-border shadow-sm">
      <div className="mx-auto px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isPublicPage ? (
            <Image
              src="/logo-secondary.png"
              alt="MathConcept Secondary Academy"
              width={36}
              height={36}
              className="h-9 w-auto"
            />
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
          <div>
            <div className="font-bold text-lg leading-tight text-foreground">
              <span className="hidden sm:inline">MathConcept Secondary Academy</span>
              <span className="sm:hidden">MC Secondary</span>
            </div>
            <div className="text-xs text-muted-foreground">中學教室</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isInternalPage && <ThemeToggle compact />}
          {isInternalPage && (
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
