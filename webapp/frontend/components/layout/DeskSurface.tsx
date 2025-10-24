"use client";

import { ReactNode } from "react";

interface DeskSurfaceProps {
  children: ReactNode;
}

export function DeskSurface({ children }: DeskSurfaceProps) {
  return (
    <div className="relative min-h-screen desk-background">
      {/* Wood grain texture overlay - visible and warm */}
      <div className="absolute inset-0 wood-grain-texture opacity-75 pointer-events-none" />

      {/* Lighting gradient */}
      <div className="absolute inset-0 desk-lighting pointer-events-none" />

      {/* Vignette */}
      <div className="absolute inset-0 desk-vignette pointer-events-none" />

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
