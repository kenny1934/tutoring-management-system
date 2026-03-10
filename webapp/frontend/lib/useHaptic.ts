"use client";

import { useWebHaptics } from "web-haptics/react";
import { useCallback } from "react";

// Raw vibration arrays [vibrate_ms, pause_ms, vibrate_ms, ...]
// These bypass the library's intensity micro-pulsing for solid, perceptible vibrations on Android
const PATTERNS = {
  success:   [30, 60, 40],          // double-tap: light then firm
  error:     [40, 40, 40, 40, 40],  // triple-tap: urgent
  warning:   [40, 80, 30],          // double-tap: cautionary
  light:     [20],                   // single subtle tap
  medium:    [35],                   // single firm tap
  heavy:     [50],                   // single strong tap
  selection: [15],                   // single tick
} as const;

type HapticType = keyof typeof PATTERNS;

export function useHaptic() {
  const haptics = useWebHaptics();

  const trigger = useCallback((type: HapticType) => {
    haptics.trigger(PATTERNS[type]);
  }, [haptics]);

  return { trigger };
}
