"use client";

import { cn } from "@/lib/utils";
import { SURFACES } from "@/lib/surfaces";
import { surfacePreference } from "@/lib/surface-preference";

/**
 * Lets a person choose the page background. Each tile carries its own
 * `data-surface`, so it draws its background with the same CSS the pages
 * use, and a background added to SURFACES shows up here with a true preview.
 */
export function SurfacePicker() {
  const [surface, setSurface] = surfacePreference.usePreference();

  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Page background">
      {SURFACES.map((option) => {
        const selected = option.id === surface;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.description}
            onClick={() => setSurface(option.id)}
            className={cn(
              "flex flex-col gap-1.5 rounded-lg p-1.5 text-left transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              selected ? "bg-tint ring-2 ring-primary" : "hover:bg-foreground/5",
            )}
          >
            <span
              data-surface={option.id}
              className="surface relative block h-12 w-full overflow-hidden rounded-md border border-line"
            >
              <span className="absolute inset-0 surface-texture opacity-75" />
              <span className="absolute inset-0 surface-lighting" />
              <span className="absolute inset-0 surface-vignette" />
              {/* A card and a heading, so the tile shows how a page reads on it. */}
              <span className="absolute left-2 top-2 text-xs font-bold text-on-surface">Aa</span>
              <span className="absolute bottom-1.5 right-1.5 h-5 w-9 rounded-sm bg-paper border border-line" />
            </span>
            <span className="px-0.5 text-xs font-medium text-foreground/80">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
