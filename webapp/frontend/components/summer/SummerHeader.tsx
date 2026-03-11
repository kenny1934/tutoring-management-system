"use client";

import Image from "next/image";
import Link from "next/link";

export function SummerHeader() {
  return (
    <header className="bg-card border-b border-border shadow-sm">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
        <Link href="/summer/apply" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="MathConcept"
            width={36}
            height={36}
            className="h-9 w-auto"
          />
          <div>
            <div className="font-bold text-lg leading-tight text-foreground">
              MathConcept Secondary Academy
            </div>
            <div className="text-xs text-muted-foreground">Summer Course</div>
          </div>
        </Link>
      </div>
    </header>
  );
}
