"use client";

import { useEffect, useState } from "react";

export type ShareResult = "shared" | "copied" | "cancelled";

/**
 * Whether a message for a parent should go through the phone's share sheet.
 * Only on a touch screen: desktop browsers have a share sheet too, but people
 * there paste into WhatsApp Web, and Copy is what they expect.
 */
export function canShareText(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    !!window.matchMedia?.("(pointer: coarse)").matches
  );
}

/**
 * Whether this device shares instead of copying, for labelling the button.
 * It starts false and is checked after mount, so the server and the first
 * client render agree.
 */
export function useCanShare(): boolean {
  const [can, setCan] = useState(false);
  useEffect(() => setCan(canShareText()), []);
  return can;
}

/**
 * Opens the share sheet with the message (or the link) on a phone, and copies
 * it everywhere else.
 *
 * A phone only lets a page open the share sheet shortly after a tap. Some of
 * our buttons fetch the message from the server first, and if that takes too
 * long the phone refuses. In that case, and whenever sharing fails for any
 * other reason, the message is copied instead, so the tap always does
 * something. Closing the share sheet without choosing an app counts as
 * "cancelled", and nothing else happens.
 *
 * @throws when copying fails as well, so callers keep their error toast.
 */
export async function shareOrCopy(text: string, { url }: { url?: boolean } = {}): Promise<ShareResult> {
  if (canShareText()) {
    try {
      await navigator.share(url ? { url: text } : { text });
      return "shared";
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(text);
  return "copied";
}
