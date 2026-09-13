"use client";

import { useCallback, useState, type ComponentType, type RefObject } from "react";
import { DraftingCompass, Ruler as RulerIcon } from "lucide-react";
import { measureContainer, toContainer } from "@/hooks/usePlacedTool";
import type { DrawingGuide } from "@/lib/drawing-guide";
import type { Vec } from "@/lib/stroke-select";
import { Ruler } from "./Ruler";
import { Protractor, ProtractorIcon } from "./Protractor";
import { Compass } from "./Compass";

export type PaneToolKind = "ruler" | "protractor" | "compass";

/** The tools that can lie on a pane, in the order the menus list them, with each one's icon and the name its row uses. */
export const PANE_TOOLS: { kind: PaneToolKind; Icon: ComponentType<{ className?: string }>; name: string }[] = [
  { kind: "ruler", Icon: RulerIcon, name: "the ruler" },
  { kind: "protractor", Icon: ProtractorIcon, name: "the protractor" },
  { kind: "compass", Icon: DraftingCompass, name: "the compasses" },
];

/** What a menu row says for a tool: "Show the ruler" while it's put away, and "Hide the ruler" while it's out. */
export const paneToolLabel = (name: string, out: boolean) => `${out ? "Hide" : "Show"} ${name}`;

/** Where each tool that's out was put, in the container's own pixels. */
type Placed = Partial<Record<PaneToolKind, Vec>>;

/** What a menu needs to list the tools: which are out, and how to put one out or away. */
export interface PaneToolsMenu {
  placed: Placed;
  toggle: (kind: PaneToolKind) => void;
}

/** Where a new tool goes: across the middle of what the pane is showing, in the container's own pixels. */
function toolStart(container: HTMLElement | null, viewport: HTMLElement | null): Vec | null {
  if (!container || !viewport) return null;
  const view = viewport.getBoundingClientRect();
  return toContainer(measureContainer(container), [(view.left + view.right) / 2, (view.top + view.bottom) / 2]);
}

/**
 * The tools out on one pane, such as the worksheet or the Draft: where each
 * one was put, and the guides that the ruler and the protractor join while
 * they're out, for the pane's drawing layers. `containerRef` is what the tools
 * lie in, and a new one is put in the middle of what `viewportRef` shows.
 * `putAway` takes them all away, for a pane that moves on to another exercise.
 */
export function usePaneTools(containerRef: RefObject<HTMLElement | null>, viewportRef: RefObject<HTMLElement | null>) {
  const [placed, setPlaced] = useState<Placed>({});
  const [guides] = useState(() => new Set<DrawingGuide>());
  const hide = useCallback((kind: PaneToolKind) => {
    setPlaced((prev) => {
      const next = { ...prev };
      delete next[kind];
      return next;
    });
  }, []);
  const putAway = useCallback(() => setPlaced((prev) => (Object.keys(prev).length > 0 ? {} : prev)), []);
  const toggle = (kind: PaneToolKind) => {
    if (placed[kind]) {
      hide(kind);
      return;
    }
    const start = toolStart(containerRef.current, viewportRef.current);
    if (start) setPlaced((prev) => ({ ...prev, [kind]: start }));
  };
  return { placed, guides, hide, toggle, putAway, anyOut: Object.keys(placed).length > 0 };
}

interface PaneToolsProps {
  /** The pane's tools, from usePaneTools. */
  state: ReturnType<typeof usePaneTools>;
  /** What the tools lie in, the same container given to usePaneTools. */
  containerRef: RefObject<HTMLElement | null>;
  /** A centimetre in the container's own pixels, before any zoom. */
  cm: number;
  /** Dark PDF mode, where the tools darken along with the pages. */
  darkMode: boolean;
}

/** Each tool that's out on a pane, lying in its container among the pages, with its own X to put it away. */
export function PaneTools({ state: { placed, guides, hide }, containerRef, cm, darkMode }: PaneToolsProps) {
  return (
    <>
      {placed.ruler && (
        <Ruler containerRef={containerRef} cm={cm} start={placed.ruler} guides={guides} darkMode={darkMode} onHide={() => hide("ruler")} />
      )}
      {placed.protractor && (
        <Protractor
          containerRef={containerRef}
          cm={cm}
          start={placed.protractor}
          guides={guides}
          darkMode={darkMode}
          onHide={() => hide("protractor")}
        />
      )}
      {placed.compass && (
        <Compass containerRef={containerRef} cm={cm} start={placed.compass} darkMode={darkMode} onHide={() => hide("compass")} />
      )}
    </>
  );
}
