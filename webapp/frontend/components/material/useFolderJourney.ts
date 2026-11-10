"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { createMaterialFlight, focusMaterialSource } from "./materialJourney";

type Place = { file: string; scroll: number; left: number };
export function useFolderJourney(scroller: RefObject<HTMLElement | null>, path: string[], busy: boolean, failed: boolean) {
  const key = JSON.stringify(path), history = useRef(new Map<string, Place>());
  const pending = useRef<{ returning: boolean; destination: string; place?: Place; flight: ReturnType<typeof createMaterialFlight> } | null>(null);
  const cancel = useCallback(() => { pending.current?.flight?.cancel(); pending.current = null; }, []);
  const find = useCallback((file: string) => [...(scroller.current?.querySelectorAll<HTMLElement>("[data-material-file]") ?? [])].find(element => element.dataset.materialFile === file), [scroller]);
  const enter = useCallback((file: string, destination: string[]) => {
    cancel(); const pane = scroller.current, node = find(file);
    if (!pane) return;
    history.current.set(key, { file, scroll: pane.scrollTop, left: pane.scrollLeft });
    if (history.current.size > 32) history.current.delete(history.current.keys().next().value!);
    const artwork = node?.querySelector<HTMLElement>("[data-material-artwork]");
    pending.current = { returning: false, destination: JSON.stringify(destination), flight: artwork ? createMaterialFlight(artwork, { kind: "folder" }) : null };
  }, [cancel, find, key, scroller]);
  const back = useCallback((destination: string[]) => {
    cancel(); const place = history.current.get(JSON.stringify(destination));
    pending.current = { returning: true, destination: JSON.stringify(destination), place, flight: null };
  }, [cancel]);
  useLayoutEffect(() => {
    const next = pending.current, pane = scroller.current;
    if (!next || busy || next.destination !== key || !pane) return;
    if (failed) { cancel(); return; }
    if (next.returning && next.place) {
      pane.scrollTop = next.place.scroll; pane.scrollLeft = next.place.left;
      const node = find(next.place.file), artwork = node?.querySelector<HTMLElement>("[data-material-artwork]");
      if (artwork) { next.flight = createMaterialFlight(artwork, { kind: "folder", reverse: true, from: pane.getBoundingClientRect() }); next.flight?.land(artwork); }
      focusMaterialSource(node ?? null);
    } else next.flight?.land(pane);
  }, [busy, cancel, failed, find, key, scroller]);
  useEffect(() => () => cancel(), [cancel]);
  return useMemo(() => ({ enter, back }), [enter, back]);
}
