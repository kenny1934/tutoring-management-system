import { createPreference } from "./preference";

/**
 * A yes-or-no setting kept in localStorage. It reads as false until someone
 * turns it on. See `createPreference` for how it is shared between components
 * and tabs.
 */
export function createBooleanPreference(storageKey: string) {
  const { get, set, usePreference } = createPreference<boolean>(
    storageKey,
    (stored) => stored === "true",
    String,
  );
  return { get, set, usePreference };
}
