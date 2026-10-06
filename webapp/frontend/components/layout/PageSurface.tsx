"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageSurfaceProps {
  children: ReactNode;
  /** When true, constrains to viewport height with no page scrollbar */
  fullHeight?: boolean;
}

/**
 * The background behind a page. Which background it draws (plain, the wood
 * desk, or anything added later) comes from the `data-surface` attribute on
 * <html>, through the surface variables in globals.css. On the plain surface
 * the texture, lighting and vignette layers have nothing to draw.
 */
export function PageSurface({ children, fullHeight = false }: PageSurfaceProps) {
  return (
    <div className={cn(
      "relative surface min-h-full w-full",
      fullHeight && "h-full overflow-hidden"
    )}>
      <div className="absolute inset-0 surface-texture opacity-75 pointer-events-none" />
      <div className="absolute inset-0 surface-lighting pointer-events-none" />
      <div className="absolute inset-0 surface-vignette pointer-events-none" />

      <div className={cn("relative z-10 min-h-full w-full", fullHeight && "h-full flex flex-col")}>
        {children}
      </div>
    </div>
  );
}
