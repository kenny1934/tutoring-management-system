"use client";

import { useCallback, useState } from "react";
import type { Session } from "@/types";

/**
 * The exercise editor both lesson views open, for one lesson's classwork or
 * homework. Closing it asks the view to fetch its lessons again, because the
 * exercises may have changed.
 */
export function useExerciseEditor(onSessionDataChange: () => void) {
  const [editing, setEditing] = useState<{ session: Session; type: "CW" | "HW" } | null>(null);

  const openEditor = useCallback((session: Session, type: "CW" | "HW") => setEditing({ session, type }), []);
  const closeEditor = useCallback(() => {
    setEditing(null);
    onSessionDataChange();
  }, [onSessionDataChange]);

  return { editing, openEditor, closeEditor };
}
