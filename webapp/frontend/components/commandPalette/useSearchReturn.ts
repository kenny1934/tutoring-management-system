"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { protectOverlayHistory } from "@/hooks/useBackToClose";
import type { SearchOrigin } from "@/contexts/CommandPaletteContext";

import type { SearchFilters } from "./search-filters";

export type SearchPlace = { area?: "records" | "materials"; filters?: SearchFilters; query: string; includeHistory?: boolean; selectedId?: string; index: number; path: string[]; top: number };
const KEY = "csmSearchReturn";

/** Keep only navigation coordinates and the query in tab memory, never in the URL or storage. */
export function useSearchReturn(scope: string, open: (source?: HTMLElement) => void, origin: React.RefObject<SearchOrigin | null>, snapshot: () => SearchPlace, restore: (place: SearchPlace) => void) {
  const pathname = usePathname(), params = useSearchParams();
  const records = useRef(new Map<string, { scope: string; origin: SearchOrigin; place: SearchPlace }>());
  const latest = useRef({ scope, snapshot, restore, open }); latest.current = { scope, snapshot, restore, open };
  const navigation = useRef(false);
  const protection = useRef<(() => void) | null>(null);
  const release = useCallback(() => { protection.current?.(); protection.current = null; }, []);
  const remember = useCallback(() => {
    const source = origin.current;
    navigation.current = true;
    if (!source) return;
    records.current.set(source.token, { scope: latest.current.scope, origin: source, place: latest.current.snapshot() });
    if (records.current.size > 20) records.current.delete(records.current.keys().next().value!);
    // A slow router.push from a button must not be cancelled by the phone overlay's close timer.
    release();
    window.history.replaceState({ ...window.history.state, csmSearchNavigation: source.token }, "");
    protection.current = protectOverlayHistory("csmSearchNavigation", source.token);
  }, [origin, release]);
  useEffect(() => {
    if (origin.current && window.location.href !== origin.current.url) release();
  }, [pathname, params, origin, release]);
  useEffect(() => {
    const back = () => {
      release();
      const token = window.history.state?.[KEY], record = records.current.get(token);
      if (!record || record.scope !== latest.current.scope || record.origin.url !== window.location.href) return;
      records.current.delete(token);
      latest.current.restore(record.place);
      latest.current.open(record.origin.source?.isConnected ? record.origin.source : undefined);
    };
    window.addEventListener("popstate", back);
    return () => { window.removeEventListener("popstate", back); release(); };
  }, [release]);
  return { remember, navigation };
}
