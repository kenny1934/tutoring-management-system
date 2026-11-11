"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { createMaterialFlight, focusMaterialSource, rememberScroll, restoreScroll, visibleMaterialElement, type ScrollPlace } from "./materialJourney";

interface JourneyOptions {
  sourceSelector?: string;
  targetSelector?: string;
  kind?: "document" | "label";
  focusWithinDialog?: boolean;
  focusOriginalControl?: boolean;
}

export function useDocumentJourney(root: RefObject<HTMLElement | null>, docId: number | string | null, options: JourneyOptions = {}) {
  const { sourceSelector = "[data-material-doc-id], tr[data-doc-id]", targetSelector = "[data-material-reader-content]", kind = "document", focusWithinDialog = false, focusOriginalControl = false } = options;
  const origin = useRef<{ id: number | string; source: HTMLElement; focus: HTMLElement; scroll: ScrollPlace[] } | null>(null);
  const activeFlight = useRef<ReturnType<typeof createMaterialFlight>>(null);
  const focusFrame = useRef(0);
  const pending = useRef<{ returning: boolean; flight: ReturnType<typeof createMaterialFlight> } | null>(null);
  const reader = useCallback(() => visibleMaterialElement(document.querySelectorAll<HTMLElement>(targetSelector)), [targetSelector]);
  const cancel = useCallback(() => { activeFlight.current?.cancel(); activeFlight.current = null; cancelAnimationFrame(focusFrame.current); pending.current = null; if (root.current) delete root.current.dataset.materialJourney; }, [root]);
  const prepareOpen = useCallback((id: number | string, source?: HTMLElement | null) => {
    cancel();
    const node = source?.closest<HTMLElement>(sourceSelector) ?? source;
    if (!node) return;
    origin.current = { id, source: node, focus: focusOriginalControl && source ? source : node, scroll: rememberScroll(node) };
    if (root.current) root.current.dataset.materialJourney = "true";
    activeFlight.current = createMaterialFlight(node, { kind, onFinish: () => { if (root.current) delete root.current.dataset.materialJourney; } });
    pending.current = { returning: false, flight: activeFlight.current };
  }, [cancel, root, sourceSelector, kind, focusOriginalControl]);
  const prepareReturn = useCallback(() => {
    cancel();
    const place = origin.current, pane = reader();
    if (!place) return;
    if (root.current) root.current.dataset.materialJourney = "true";
    activeFlight.current = pane && place.source.isConnected ? createMaterialFlight(place.source, { kind, reverse: true, from: pane.getBoundingClientRect(), onFinish: () => { if (root.current) delete root.current.dataset.materialJourney; } }) : null;
    pending.current = { returning: true, flight: activeFlight.current };
  }, [cancel, reader, root, kind]);
  useLayoutEffect(() => {
    const next = pending.current;
    if (!next) return;
    if (!next.returning && docId === null) { cancel(); return; }
    if (next.returning && docId === null) {
      const place = origin.current;
      if (place) { restoreScroll(place.scroll); focusFrame.current = requestAnimationFrame(() => { restoreScroll(place.scroll); const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]; if (!dialogs.length || (focusWithinDialog && dialogs.at(-1)?.contains(place.focus))) focusMaterialSource(place.focus.isConnected ? place.focus : place.source); }); if (place.source.isConnected) next.flight?.land(place.source); else next.flight?.cancel(); }
      pending.current = null;
      if (!next.flight && root.current) delete root.current.dataset.materialJourney;
    } else if (!next.returning && docId !== null) {
      const pane = reader();
      if (pane) next.flight?.land(pane); else next.flight?.cancel();
      // Retain the flight until it finishes or a new action cancels it.
      if (!next.flight && root.current) delete root.current.dataset.materialJourney;
    }
  }, [cancel, docId, reader, root, focusWithinDialog]);
  useEffect(() => () => cancel(), [cancel]);
  return useMemo(() => ({ prepareOpen, prepareReturn }), [prepareOpen, prepareReturn]);
}
