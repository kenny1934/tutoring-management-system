"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SummerHeader() {
  const pathname = usePathname();
  const isApplyPage = pathname.startsWith("/summer/apply") || pathname === "/summer/status";

  return (
    <header className="bg-card border-b border-border shadow-sm">
      <div className="mx-auto px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/logo-secondary.png"
            alt="MathConcept Secondary Academy"
            width={36}
            height={36}
            className="h-9 w-auto"
          />
          <div>
            <div className="font-bold text-lg leading-tight text-foreground">
              MathConcept Secondary Academy
            </div>
            <div className="text-xs text-muted-foreground">中學教室</div>
          </div>
        </div>
        {!isApplyPage && (
          <Link
            href="/summer/apply"
            className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            Summer Application &rarr;
          </Link>
        )}
      </div>
    </header>
  );
}
