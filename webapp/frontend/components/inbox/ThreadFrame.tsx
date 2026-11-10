"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { motion, useIsPresent, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Desktop keeps its split-pane geometry; phone navigation has one reversible surface. */
export function ThreadFrame({ mobile, children, onUnmount }: { mobile: boolean; children: ReactNode; onUnmount: () => void }) {
  const surface = useRef<HTMLDivElement>(null);
  const present = useIsPresent();
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    if (!mobile) return;
    const background = [...document.querySelectorAll<HTMLElement>("[data-inbox-background]")].map(element => ({ element, inert: element.inert }));
    const focusedInside = !!surface.current?.contains(document.activeElement);
    background.forEach(({ element }) => { element.inert = true; });
    if (!focusedInside) surface.current?.querySelector<HTMLButtonElement>('button[aria-label="Back to the inbox"]')?.focus({ preventScroll: true });
    return () => background.forEach(({ element, inert }) => { element.inert = inert; });
  }, [mobile]);
  const returnToSource = useRef(onUnmount);
  returnToSource.current = onUnmount;
  // Return focus after the exiting surface has released the list, including a zero-duration exit.
  useLayoutEffect(() => () => returnToSource.current(), []);
  return <motion.div
    ref={surface}
    role="region"
    aria-label="Thread detail"
    data-inbox-thread-frame
    inert={!present}
    initial={mobile && !reduced ? { x: "18%", opacity: .8 } : false}
    animate={{ x: 0, opacity: 1 }}
    exit={mobile && !reduced ? { x: "22%", opacity: 0 } : { x: 0, opacity: 1 }}
    transition={{ duration: mobile && !reduced ? .18 : 0, ease: [.2, .7, .2, 1] }}
    className={cn("h-full rounded-lg overflow-hidden bg-raised", mobile
      ? "fixed inset-0 z-40 md:left-[var(--sidebar-width)]"
      : "w-[450px] xl:w-[550px] flex-shrink-0")}
    style={{ pointerEvents: present ? undefined : "none" }}
  >{children}</motion.div>;
}
