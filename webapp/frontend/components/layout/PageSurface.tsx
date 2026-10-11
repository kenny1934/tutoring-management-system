"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageSurfaceProps {
  children: ReactNode;
  /** When true, constrains to viewport height with no page scrollbar */
  fullHeight?: boolean;
  /**
   * With fullHeight, lets the whole page scroll on a phone instead. A page
   * locked to the screen keeps its heading and filters in place and scrolls
   * its list in whatever is left, which on a phone can be a few hundred
   * pixels. Pages that need the fixed frame on a phone too, like the grids,
   * the inbox and lesson mode, leave this off.
   */
  scrollOnPhone?: boolean;
}

/**
 * The background behind a page. Which background it draws (plain, the wood
 * desk, or anything added later) comes from the `data-surface` attribute on
 * <html>, through the surface variables in globals.css. On the plain surface
 * the texture, lighting and vignette layers have nothing to draw.
 */
export function PageSurface({ children, fullHeight = false, scrollOnPhone = false }: PageSurfaceProps) {
  return (
    <div className={cn(
      "relative surface min-h-full w-full",
      fullHeight && (scrollOnPhone ? "md:h-full md:overflow-hidden" : "h-full overflow-hidden")
    )}>
      <div className="absolute inset-0 surface-texture opacity-75 pointer-events-none" />
      <div className="absolute inset-0 surface-lighting pointer-events-none" />
      <div className="absolute inset-0 surface-vignette pointer-events-none" />

      <div className={cn("relative z-10 min-h-full w-full", fullHeight && (scrollOnPhone ? "md:h-full md:flex md:flex-col" : "h-full flex flex-col"))}>
        {children}
      </div>
    </div>
  );
}
