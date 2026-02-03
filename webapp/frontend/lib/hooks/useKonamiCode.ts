"use client";

import { useEffect, useCallback, useRef } from "react";

// Konami Code: ↑ ↑ ↓ ↓ ← → ← → B A
const KONAMI_SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "KeyB",
  "KeyA",
];

const SEQUENCE_TIMEOUT = 2000; // 2 seconds between keys

interface UseKonamiCodeOptions {
  onActivate: () => void;
  enabled?: boolean;
}

export function useKonamiCode({ onActivate, enabled = true }: UseKonamiCodeOptions) {
  const sequenceIndex = useRef(0);
  const lastKeyTime = useRef(0);

  const resetSequence = useCallback(() => {
    sequenceIndex.current = 0;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const now = Date.now();
      const timeSinceLastKey = now - lastKeyTime.current;

      // Reset if too much time has passed
      if (timeSinceLastKey > SEQUENCE_TIMEOUT && sequenceIndex.current > 0) {
        resetSequence();
      }

      lastKeyTime.current = now;

      // Check if the key matches the expected one in the sequence
      const expectedKey = KONAMI_SEQUENCE[sequenceIndex.current];
      const pressedKey = event.code;

      if (pressedKey === expectedKey) {
        sequenceIndex.current++;

        // Check if sequence is complete
        if (sequenceIndex.current === KONAMI_SEQUENCE.length) {
          resetSequence();
          onActivate();
        }
      } else {
        // Reset on wrong key (but check if it could be start of new sequence)
        if (pressedKey === KONAMI_SEQUENCE[0]) {
          sequenceIndex.current = 1;
        } else {
          resetSequence();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onActivate, resetSequence]);

  return { resetSequence };
}
