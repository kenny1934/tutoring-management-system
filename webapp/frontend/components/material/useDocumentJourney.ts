"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { createMaterialFlight, focusMaterialSource, rememberScroll, restoreScroll, visibleMaterialElement, type ScrollPlace } from "./materialJourney";

export function useDocumentJourney(root: RefObject<HTMLElement | null>, docId: number | null) {
  const origin = useRef<{ id: number; source: HTMLElement; scroll: ScrollPlace[] } | null>(null);
  const activeFlight = useRef<ReturnType<typeof createMaterialFlight>>(null);
  const focusFrame = useRef(0);
  const pending = useRef<{ returning: boolean; flight: ReturnType<typeof createMaterialFlight> } | null>(null);
  const reader = useCallback(() => visibleMaterialElement(document.querySelectorAll<HTMLElement>("[data-material-reader-content]")), []);
  const cancel = useCallback(() => { activeFlight.current?.cancel(); activeFlight.current = null; cancelAnimationFrame(focusFrame.current); pending.current = null; if (root.current) delete root.current.dataset.materialJourney; }, [root]);
  const prepareOpen = useCallback((id: number, source?: HTMLElement | null) => {
    cancel();
    const node = source?.closest<HTMLElement>("[data-material-doc-id], tr[data-doc-id]") ?? source;
    if (!node) return;
    origin.current = { id, source: node, scroll: rememberScroll(node) };
    if (root.current) root.current.dataset.materialJourney = "true";
    activeFlight.current = createMaterialFlight(node, { kind: "document", onFinish: () => { if (root.current) delete root.current.dataset.materialJourney; } });
    pending.current = { returning: false, flight: activeFlight.current };
  }, [cancel, root]);
  const prepareReturn = useCallback(() => {
    cancel();
    const place = origin.current, pane = reader();
    if (!place) return;
    if (root.current) root.current.dataset.materialJourney = "true";
    activeFlight.current = pane && place.source.isConnected ? createMaterialFlight(place.source, { kind: "document", reverse: true, from: pane.getBoundingClientRect(), onFinish: () => { if (root.current) delete root.current.dataset.materialJourney; } }) : null;
    pending.current = { returning: true, flight: activeFlight.current };
  }, [cancel, reader, root]);
  useLayoutEffect(() => {
    const next = pending.current;
    if (!next) return;
    if (!next.returning && docId === null) { cancel(); return; }
    if (next.returning && docId === null) {
      const place = origin.current;
      if (place) { restoreScroll(place.scroll); focusFrame.current = requestAnimationFrame(() => { restoreScroll(place.scroll); if (!document.querySelector('[role="dialog"]')) focusMaterialSource(place.source); }); if (place.source.isConnected) next.flight?.land(place.source); else next.flight?.cancel(); }
      pending.current = null;
      if (!next.flight && root.current) delete root.current.dataset.materialJourney;
    } else if (!next.returning && docId !== null) {
      const pane = reader();
      if (pane) next.flight?.land(pane); else next.flight?.cancel();
      // Retain the flight until it finishes or a new action cancels it.
      if (!next.flight && root.current) delete root.current.dataset.materialJourney;
    }
  }, [cancel, docId, reader, root]);
  useEffect(() => () => cancel(), [cancel]);
  return useMemo(() => ({ prepareOpen, prepareReturn }), [prepareOpen, prepareReturn]);
}
