"use client";

import { useEffect, useState } from "react";

/** Touch tablets are wider than the mobile breakpoint but still have no
 *  hover, so touch affordances key off the pointer, not the width. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return coarse;
}

/** Hit-area classes for the tiny icon buttons on the curriculum rows: same
 *  visual footprint, but on touch devices the padding grows into the row's
 *  gaps so the target is comfortably tappable. */
export function iconHitArea(coarse: boolean): string {
  return coarse ? "p-1.5 -m-1" : "p-0.5";
}
