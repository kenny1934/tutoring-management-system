"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DeskSurfaceProps {
  children: ReactNode;
  /** When true, constrains to viewport height with no page scrollbar */
  fullHeight?: boolean;
}

export function DeskSurface({ children, fullHeight = false }: DeskSurfaceProps) {
  return (
    <div className={cn(
      "relative desk-background h-full",
      fullHeight && "overflow-hidden"
    )}>
      {/* Wood grain texture overlay - visible and warm */}
      <div className="absolute inset-0 wood-grain-texture opacity-75 pointer-events-none" />

      {/* Lighting gradient */}
      <div className="absolute inset-0 desk-lighting pointer-events-none" />

      {/* Vignette */}
      <div className="absolute inset-0 desk-vignette pointer-events-none" />

      {/* Content */}
      <div className={cn("relative z-10 h-full", fullHeight && "flex flex-col")}>
        {children}
      </div>
    </div>
  );
}
